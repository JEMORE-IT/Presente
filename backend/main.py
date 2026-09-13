import asyncio
import json
import io
import os
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Query, Security, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

import models
from database import engine, Base, get_db, SessionLocal
from parsers import parse_and_seed_csv, possible_paths, parse_and_seed_csv_text
from auth import get_current_user, generate_qr_token, verify_qr_token, DEV_MODE
import services
from postgres_sync import sync_soci_from_postgres

# Initialize DB tables safely
def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        seed_database_if_empty()
    except Exception as e:
        print(f"Warning: Database initialization encountered an issue: {e}")

# Initial roster seed if soci table is empty
def seed_database_if_empty():
    db = SessionLocal()
    try:
        from models import Socio
        import os
        if db.query(Socio).count() == 0:
            print("Soci table is empty. Seeding from CSV...")
            csv_file = None
            for p in possible_paths:
                if os.path.exists(p):
                    csv_file = p
                    break
            if csv_file:
                parse_and_seed_csv(db, csv_file)
            else:
                print("Could not find CSV for initial seeding.")
    finally:
        db.close()

init_db()

app = FastAPI(title="Presente! API", version="1.0.0")

# Enable CORS for Next.js frontend
cors_env = os.getenv("CORS_ORIGINS", "")
allowed_origins = [
    "http://localhost:3000",
    "https://presente.jemore.it",
]
if cors_env:
    allowed_origins.extend([o.strip() for o in cors_env.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SSE Broadcaster State
sse_listeners: list[asyncio.Queue] = []

async def broadcast_to_sse(event_type: str, payload: dict):
    """
    Broadcasts a JSON payload to all active SSE listener queues.
    """
    message = {"event": event_type, "data": payload, "timestamp": datetime.utcnow().isoformat()}
    for queue in list(sse_listeners):
        await queue.put(message)

# Pydantic Schemas
class EventCreate(BaseModel):
    titolo: str
    tipo: str  # "ASSEMBLEA", "FORMAZIONE", "TEAM_BUILDING"
    data_ora: Optional[datetime] = None
    modalita: str  # "ONLINE_ONLY", "HYBRID", "IN_PERSON_ONLY"
    soglia_consecutiva: Optional[int] = 3

class EventResponse(BaseModel):
    id: int
    titolo: str
    tipo: str
    data_ora: datetime
    modalita: str
    soglia_consecutiva: int
    is_attivo: bool

    class Config:
        from_attributes = True

class CheckinPayload(BaseModel):
    event_id: int
    modalita: Optional[str] = "IN_PRESENZA"
    token: Optional[str] = None

# Automatic database seeding on startup if empty
@app.on_event("startup")
def startup_db_seed():
    db = SessionLocal()
    try:
        # 1. Attempt to sync from PostgreSQL first
        print("Starting up... Attempting to sync members from PostgreSQL.")
        sync_result = sync_soci_from_postgres(db)
        
        # 2. If Postgres failed and DB is completely empty, fallback to CSV seed
        count = db.query(models.Socio).count()
        if count == 0:
            print("Database still empty (Postgres sync failed or had no data). Attempting to seed from CSV fallback...")
            csv_file = None
            for p in possible_paths:
                import os
                if os.path.exists(p):
                    csv_file = p
                    break
            if csv_file:
                parse_and_seed_csv(db, csv_file)
            else:
                print("Could not find CSV file to seed database.")
        else:
            print(f"Database has {count} members.")
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Presente! API is running", "dev_mode": DEV_MODE}

@app.get("/health")
def health_check():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}

# --- Event Endpoints ---

@app.post("/api/events", response_model=EventResponse)
async def create_event(event_in: EventCreate, db: Session = Depends(get_db)):
    """
    Creates a new event.
    """
    new_event = models.Evento(
        titolo=event_in.titolo,
        tipo=event_in.tipo,
        data_ora=event_in.data_ora or datetime.utcnow(),
        modalita=event_in.modalita,
        soglia_consecutiva=event_in.soglia_consecutiva,
        is_attivo=True
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    
    # Broadcast event creation
    await broadcast_to_sse("EVENT_CREATED", {"id": new_event.id, "titolo": new_event.titolo})
    
    # If ASSEMBLEA, generate the folder and Excel tracking file on OneDrive
    if new_event.tipo == "ASSEMBLEA":
        try:
            from ms_graph import create_and_upload_empty_excel
            cartella = f"Deleghe_{new_event.titolo.replace(' ', '_')}"
            # This task can happen in the background or awaited directly.
            # Awaiting to ensure it's created before any fast submissions.
            await create_and_upload_empty_excel(cartella)
        except Exception as e:
            print(f"Failed to create Excel for Assemblea: {e}")
    
    return new_event

@app.get("/api/events", response_model=list[EventResponse])
def list_events(db: Session = Depends(get_db)):
    """
    Lists all events.
    """
    return db.query(models.Evento).order_by(models.Evento.data_ora.desc()).all()

@app.get("/api/events/{event_id}/qr")
def get_event_qr(event_id: int, db: Session = Depends(get_db)):
    """
    Generates a rotating HMAC-SHA256 token for an event's check-in QR code.
    Cycles every 30 seconds.
    """
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.is_attivo:
        raise HTTPException(status_code=400, detail="Event is not active")
        
    token, window_id = generate_qr_token(event_id)
    
    # Calculate seconds remaining in the current 30-second window
    seconds_remaining = 30 - (int(datetime.utcnow().timestamp()) % 30)
    
    from auth import generate_static_qr_token
    return {
        "event_id": event_id,
        "token": token,
        "seconds_remaining": seconds_remaining,
        "window_id": window_id,
        "static_token": generate_static_qr_token(event_id)
    }

@app.get("/api/events/{event_id}")
def get_event(event_id: int, db: Session = Depends(get_db)):
    """
    Returns a single event by its ID.
    """
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

@app.delete("/api/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """
    Deletes an event by its ID. Restricted to specific user based on JWT claims.
    """
    user_name = current_user.get("name")
    if user_name not in ["Joachim Chiebuka Ihedioha", "Ihedioha Joachim Chiebuka"]:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    db.delete(event)
    db.commit()
    return {"status": "success", "message": "Evento eliminato con successo"}

# --- Check-in Endpoint ---

@app.post("/api/checkin")
async def checkin(payload: CheckinPayload, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """
    Registers a check-in via QR code scan.
    Security is identity-based: the user must be authenticated (via mock session or Entra ID).
    The QR code identifies the event; no rotating token is required.
    """
    event_id = payload.event_id
    email = current_user.get("email")
    name = current_user.get("name")
    
    from auth import verify_static_qr_token
    if not payload.token or not verify_static_qr_token(event_id, payload.token):
        raise HTTPException(status_code=403, detail="Token QR Code non valido o mancante. Non puoi modificare l'ID evento manualmente.")
    
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.is_attivo:
        raise HTTPException(status_code=400, detail="L'evento non è attivo. Contatta l'amministratore.")

    # Determine effective modality: user choice overridden if event forces one
    modalita_effettiva = payload.modalita or "IN_PRESENZA"
    if event.modalita == "IN_PERSON_ONLY":
        modalita_effettiva = "IN_PRESENZA"
    elif event.modalita == "ONLINE_ONLY":
        modalita_effettiva = "ONLINE"

    # Call service to register the check-in
    result = services.checkin_member(
        db=db,
        email=email,
        event_id=event_id,
        modalita=modalita_effettiva,
        name_fallback=name
    )
    
    # Always include event_id in SSE payload so dashboard can filter correctly
    result["event_id"] = event_id
    result["modalita"] = modalita_effettiva
    
    # Broadcast this checkin to all live dashboards
    await broadcast_to_sse("CHECKIN_UPDATED", result)
    
    return result

class ManualCheckinRequest(BaseModel):
    socio_id: int
    event_id: int
    modalita: str  # "IN_PRESENZA", "ONLINE", "GIUSTIFICATO", "PRE_REGISTRATO", "ASSENTE"
    delega_a: Optional[str] = None

@app.post("/api/checkin/manual")
async def manual_checkin(payload: ManualCheckinRequest, db: Session = Depends(get_db)):
    """
    Registers a check-in manually by an administrator.
    This does not require a QR code token, since it is triggered by an admin.
    """
    socio = db.query(models.Socio).filter(models.Socio.id == payload.socio_id).first()
    if not socio:
        raise HTTPException(status_code=404, detail="Socio not found")
        
    result = services.checkin_member(
        db=db,
        email=socio.email,
        event_id=payload.event_id,
        modalita=payload.modalita,
        name_fallback=socio.nome,
        delega_a=payload.delega_a
    )
    
    # Always include event_id and modalita in SSE payload so dashboard can filter correctly
    result["event_id"] = payload.event_id
    result["modalita"] = payload.modalita
    
    # Broadcast to SSE listeners
    await broadcast_to_sse("CHECKIN_UPDATED", result)
    return result

@app.post("/api/events/{event_id}/delega")
async def register_delega(
    event_id: int,
    email: str = Form(...),
    modalita: str = Form(...),
    delega_a: Optional[str] = Form(None),
    intolleranze: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Registers an absence with a delegation (delega), optionally uploading a PDF to Microsoft Drive.
    """
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    socio = db.query(models.Socio).filter(models.Socio.email.ilike(email)).first()
    if not socio:
        raise HTTPException(status_code=404, detail="Socio non trovato")

    # 1. Se c'è un file di delega, lo carichiamo su OneDrive
    pdf_url = None
    if file and delega_a:
        try:
            from ms_graph import upload_file_to_drive
            content = await file.read()
            # Cartella con il nome dell'evento
            cartella = f"Deleghe_{event.titolo.replace(' ', '_')}"
            nome_file = f"Delega_{socio.nome.replace(' ', '_')}_A_{delega_a.replace(' ', '_')}.pdf"
            pdf_url = await upload_file_to_drive(content, nome_file, cartella)
        except Exception as e:
            # Se l'upload fallisce, segnaliamo un errore grave
            print(f"Failed to upload to drive: {e}")
            raise HTTPException(status_code=500, detail=f"Errore durante l'upload su Microsoft Drive: {str(e)}")

    # 2. Map form selections to the proper Pre-Registration or Giustificato state
    db_modalita = modalita
    is_prereg = False
    
    if modalita in ["IN_PRESENZA", "ONLINE"]:
        db_modalita = "PRE_REGISTRATO"
        is_prereg = True
    elif modalita == "ASSENTE":
        db_modalita = "GIUSTIFICATO"

    # 3. Registra nel database, `checkin_member` controllerà il limite delle 3 deleghe
    result = services.checkin_member(
        db=db,
        email=socio.email,
        event_id=event_id,
        modalita=db_modalita,
        name_fallback=socio.nome,
        delega_a=delega_a,
        intolleranze=intolleranze
    )
    
    # If the user was pre-registered, set the flag explicitly
    if is_prereg and result.get("status") == "success" and result.get("type") == "matched":
        presence = db.query(models.Presenza).filter(
            models.Presenza.evento_id == event_id,
            models.Presenza.socio_id == result["socio_id"]
        ).first()
        if presence:
            presence.is_preregistrato = True
            db.commit()
    
    result["event_id"] = event_id
    result["modalita"] = db_modalita
    if pdf_url:
        result["pdf_url"] = pdf_url

    # Appends to Excel file on OneDrive if ASSEMBLEA
    if event.tipo == "ASSEMBLEA":
        try:
            from ms_graph import append_to_excel_on_drive
            cartella = f"Deleghe_{event.titolo.replace(' ', '_')}"
            row_data = {
                "nome": socio.nome,
                "email": socio.email,
                "modalita": db_modalita,
                "delega_a": delega_a if db_modalita == "GIUSTIFICATO" else "",
                "intolleranze": intolleranze or ""
            }
            # Execute without blocking the return heavily (in a real prod app, use BackgroundTasks)
            await append_to_excel_on_drive(cartella, "Raccolta_Dati.xlsx", row_data)
        except Exception as e:
            print(f"Error appending to Excel on Drive: {e}")

    # Broadcast to SSE listeners
    await broadcast_to_sse("CHECKIN_UPDATED", result)
    return result

# --- Dashboard & Roster Endpoints ---

@app.get("/api/streaks")
def get_streaks(tipo: Optional[str] = Query(None, description="Filter by event type"), db: Session = Depends(get_db)):
    """
    Gets consecutive unexcused absences and alert states for all active members.
    """
    return services.get_absence_streaks(db, event_type=tipo)

@app.get("/api/events/{event_id}/roster")
def get_event_roster(event_id: int, db: Session = Depends(get_db)):
    """
    Gets the complete roster status for an event (including checked-in members,
    absent members, and streak indicators).
    """
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    # Get all active members
    active_soci = db.query(models.Socio).filter(models.Socio.stato == "ATTIVO").order_by(models.Socio.nome.asc()).all()
    
    # Get all presence records for this event
    presences = db.query(models.Presenza).filter(models.Presenza.evento_id == event_id).all()
    presence_map = {p.socio_id: p for p in presences}
    
    # Get all streaks of this event type
    streaks = services.get_absence_streaks(db, event_type=event.tipo)
    streak_map = {s["socio_id"]: s for s in streaks}
    
    roster = []
    for socio in active_soci:
        presence = presence_map.get(socio.id)
        streak_info = streak_map.get(socio.id, {"consecutive_absences": 0, "is_critical_alert": False})
        
        status = presence.modalita if presence else "ASSENTE"
        delega_a = presence.delega_a if presence else None
        durata = presence.durata_minuti if presence else 0
        registrato_il = presence.registrato_il.isoformat() if presence else None
        
        roster.append({
            "socio_id": socio.id,
            "nome": socio.nome,
            "email": socio.email,
            "ruolo": socio.ruolo,
            "area_lavoro": socio.area_lavoro,
            "stato": socio.stato,
            "status": status,
            "delega_a": delega_a,
            "durata_minuti": durata,
            "registrato_il": registrato_il,
            "consecutive_absences": streak_info["consecutive_absences"],
            "is_critical_alert": streak_info["consecutive_absences"] >= event.soglia_consecutiva,
            "is_preregistrato": presence.is_preregistrato if presence else False
        })
        
    return {
        "event_id": event_id,
        "titolo": event.titolo,
        "tipo": event.tipo,
        "modalita": event.modalita,
        "roster": roster
    }

@app.post("/api/events/{event_id}/import-pre-assembly")
async def import_pre_assembly(event_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Imports a pre-assembly CSV file for an event to record proxies (delege) and pre-registrations.
    """
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    try:
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        
        from parsers import parse_pre_assembly_csv
        result = parse_pre_assembly_csv(db, event_id, csv_text)
        
        # Broadcast SSE event to update all dashboards dynamically
        await broadcast_to_sse("ROSTER_UPDATED", {"event_id": event_id, "summary": result})
        
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore durante l'importazione del file CSV: {str(e)}")

@app.post("/api/events/{event_id}/import-teams")
async def import_teams(event_id: int, threshold_minutes: int = Query(15, description="Minuti minimi per essere considerati presenti"), file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Imports a Microsoft Teams attendance report CSV for online attendees.
    """
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    try:
        contents = await file.read()
        
        from teams_parser import parse_teams_csv
        result = parse_teams_csv(db, event_id, contents, threshold_minutes)
        
        # Broadcast SSE event to update all dashboards dynamically
        await broadcast_to_sse("ROSTER_UPDATED", {"event_id": event_id, "summary": result})
        
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore durante l'importazione del file Teams: {str(e)}")


# --- SSE Stream Endpoint ---

@app.get("/api/live")
async def live_stream():
    """
    Server-Sent Events endpoint to stream check-ins and updates to client in real time.
    """
    async def event_generator():
        queue = asyncio.Queue()
        sse_listeners.append(queue)
        print(f"Client connected to SSE stream. Total listeners: {len(sse_listeners)}")
        try:
            while True:
                # Get the next message
                message = await queue.get()
                yield f"data: {json.dumps(message)}\n\n"
        except asyncio.CancelledError:
            print("SSE client connection canceled.")
        finally:
            sse_listeners.remove(queue)
            print(f"Client disconnected from SSE stream. Total listeners: {len(sse_listeners)}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# --- Minutes & Analytics Endpoints ---

@app.get("/api/members/analytics")
def get_members_analytics(db: Session = Depends(get_db)):
    """
    Returns global participation statistics, assembly attendances, and warning alerts.
    """
    return services.get_member_analytics(db)

@app.post("/api/members/import")
async def import_members(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Imports or updates members from an uploaded CSV (prospetto_completo format).
    """
    try:
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        result = parse_and_seed_csv_text(db, csv_text)
        return {"status": "success", "summary": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore durante l'importazione dell'anagrafica: {str(e)}")

@app.post("/api/members/sync-postgres")
def trigger_postgres_sync(db: Session = Depends(get_db)):
    """
    Manually triggers a synchronization of the members table from the external PostgreSQL database.
    """
    result = sync_soci_from_postgres(db)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message", "Sync failed"))
    return result

@app.get("/api/events/{event_id}/export-minutes/csv")
def export_minutes_csv(event_id: int, quorum_pct: float = Query(0.5, description="Custom quorum threshold percentage"), db: Session = Depends(get_db)):
    """
    Generates and downloads a CSV spreadsheet report for event minutes.
    """
    import reports
    try:
        csv_bytes = reports.generate_minutes_csv(db, event_id, quorum_pct=quorum_pct)
        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=verbale_evento_{event_id}.csv"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore durante l'esportazione: {str(e)}")

@app.get("/api/events/{event_id}/export-minutes/pdf")
def export_minutes_pdf(event_id: int, quorum_pct: float = Query(0.5, description="Custom quorum threshold percentage"), db: Session = Depends(get_db)):
    """
    Generates and downloads a print-ready official PDF minutes report.
    """
    import reports
    try:
        pdf_bytes = reports.generate_minutes_pdf(db, event_id, quorum_pct=quorum_pct)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=verbale_evento_{event_id}.pdf"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore durante l'esportazione: {str(e)}")


@app.get("/api/soci/{email}")
def get_socio_by_email(email: str, db: Session = Depends(get_db)):
    """
    Returns member details by email for NextAuth role validation.
    """
    # check for exact match or lowercase match
    socio = db.query(models.Socio).filter(models.Socio.email.ilike(email)).first()
    if not socio:
        raise HTTPException(status_code=404, detail="Socio not found")
    return {
        "id": socio.id,
        "nome": socio.nome,
        "email": socio.email,
        "ruolo": socio.ruolo,
        "area_lavoro": socio.area_lavoro,
        "stato": socio.stato
    }

@app.get("/api/soci")
def list_soci(db: Session = Depends(get_db)):
    """
    Returns all active members for dropdowns.
    """
    soci = db.query(models.Socio).filter(models.Socio.stato == "ATTIVO").order_by(models.Socio.nome.asc()).all()
    return [{"id": s.id, "nome": s.nome, "email": s.email} for s in soci]

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)

