from sqlalchemy import text
from sqlalchemy.orm import Session
from models import Socio, Evento, Presenza, UnmatchedLog

def checkin_member(
    db: Session, 
    email: str, 
    event_id: int, 
    modalita: str, 
    name_fallback: str = None, 
    durata_minuti: int = 0, 
    delega_a: str = None, 
    intolleranze: str = None,
    is_admin: bool = False
) -> dict:
    """
    Checks in a member for an event.
    If the member is found by email, a Presenza record is created/updated.
    Enforces a 30-minute lock after first compilation for normal users (unless is_admin=True).
    If the member is not found, the details are logged in UnmatchedLog.
    """
    # Verify event exists and is active
    event = db.query(Evento).filter(Evento.id == event_id).first()
    if not event:
        return {"status": "error", "message": f"Event {event_id} not found"}
        
    if not event.is_attivo:
        return {"status": "error", "message": f"Event {event_id} is not active"}

    # Find socio by email
    socio = db.query(Socio).filter(Socio.email == email.strip().lower()).first()
    
    if socio:
        # Check if already has a presence record
        presence = db.query(Presenza).filter(
            Presenza.evento_id == event_id,
            Presenza.socio_id == socio.id
        ).first()
        
        if presence:
            # 30-minute presence modification lock for regular users
            if not is_admin and presence.registrato_il:
                import datetime
                now_utc = datetime.datetime.utcnow()
                reg_time = presence.registrato_il
                if reg_time.tzinfo is not None:
                    reg_time = reg_time.replace(tzinfo=None)
                
                elapsed_seconds = (now_utc - reg_time).total_seconds()
                if elapsed_seconds > 30 * 60:
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=403,
                        detail="Sono trascorsi più di 30 minuti dalla tua compilazione della presenza per questo evento. Non è più possibile modificarla in autonomia. Contatta il Segretario Generale (SG) per la modifica manuale dalla Dashboard."
                    )

            # --- Max 3 deleghe per delegato validation ---
            # If this checkin carries a delegation, check how many delegations the target already holds
            if delega_a:
                MAX_DELEGHE = 3
                existing_deleghe_count = db.query(Presenza).filter(
                    Presenza.evento_id == event_id,
                    Presenza.delega_a == delega_a,
                    Presenza.socio_id != socio.id  # Don't count this member's own delegation
                ).count()
                if existing_deleghe_count >= MAX_DELEGHE:
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=400,
                        detail=f"Il delegato '{delega_a}' ha già raggiunto il massimo di {MAX_DELEGHE} deleghe per questo evento."
                    )

            presence.modalita = modalita
            presence.durata_minuti = max(presence.durata_minuti, durata_minuti)
            if modalita != "GIUSTIFICATO":
                presence.delega_a = None
            elif delega_a is not None:
                presence.delega_a = delega_a
                
            if intolleranze is not None:
                presence.intolleranze = intolleranze
            
            # Keep original registrato_il so the 30-min window counts from initial registration
        else:
            # --- Max 3 deleghe per delegato validation ---
            if delega_a:
                MAX_DELEGHE = 3
                existing_deleghe_count = db.query(Presenza).filter(
                    Presenza.evento_id == event_id,
                    Presenza.delega_a == delega_a
                ).count()
                if existing_deleghe_count >= MAX_DELEGHE:
                    from fastapi import HTTPException
                    raise HTTPException(
                        status_code=400,
                        detail=f"Il delegato '{delega_a}' ha già raggiunto il massimo di {MAX_DELEGHE} deleghe per questo evento."
                    )

            import datetime
            presence = Presenza(
                evento_id=event_id,
                socio_id=socio.id,
                modalita=modalita,
                durata_minuti=durata_minuti,
                delega_a=delega_a if modalita == "GIUSTIFICATO" else None,
                intolleranze=intolleranze,
                registrato_il=datetime.datetime.utcnow()
            )
            db.add(presence)
            
        db.commit()
        db.refresh(presence)
        return {
            "status": "success",
            "type": "matched",
            "socio_id": socio.id,
            "nome": socio.nome,
            "email": socio.email,
            "modalita": modalita,
            "delega_a": presence.delega_a
        }
    else:
        # Create an unmatched log
        unmatched = UnmatchedLog(
            evento_id=event_id,
            email=email.strip().lower(),
            nome_rilevato=name_fallback or email.split("@")[0],
            durata_minuti=durata_minuti
        )
        db.add(unmatched)
        db.commit()
        db.refresh(unmatched)
        return {
            "status": "success",
            "type": "unmatched",
            "unmatched_id": unmatched.id,
            "nome_rilevato": unmatched.nome_rilevato,
            "email": unmatched.email
        }

def get_absence_streaks(db: Session, event_type: str = None) -> list[dict]:
    """
    Retrieves the consecutive unexcused absences (streak) for all active members (stato = 'ATTIVO')
    globally across the member's history in the association.
    
    Any presence (IN_PRESENZA, ONLINE) or excused absence (GIUSTIFICATO, ASSENTE_GIUSTIFICATO) resets/zeroes the streak.
    Unexcused absences (ASSENTE or no record, and PRE_REGISTRATO if not checked in) advance the streak.
    """
    query = """
    WITH RankedEvents AS (
        SELECT 
            id AS event_id,
            titolo,
            data_ora,
            ROW_NUMBER() OVER (ORDER BY data_ora DESC) AS rnk
        FROM eventi
        WHERE is_attivo = 1
    ),
    SocioEventPresence AS (
        SELECT
            s.id AS socio_id,
            s.nome AS socio_nome,
            s.email AS socio_email,
            s.ruolo AS socio_ruolo,
            s.area_lavoro AS socio_area_lavoro,
            s.stato AS socio_stato,
            e.event_id,
            e.rnk,
            p.modalita
        FROM soci s
        CROSS JOIN RankedEvents e
        LEFT JOIN presenze p ON p.evento_id = e.event_id AND p.socio_id = s.id
        WHERE s.stato = 'ATTIVO'
    ),
    FirstReset AS (
        SELECT
            socio_id,
            MIN(rnk) AS first_reset_rnk
        FROM SocioEventPresence
        WHERE modalita IN ('IN_PRESENZA', 'ONLINE', 'GIUSTIFICATO', 'ASSENTE_GIUSTIFICATO')
        GROUP BY socio_id
    ),
    TotalEvents AS (
        SELECT COUNT(*) as cnt
        FROM RankedEvents
    )
    SELECT
        s.id AS socio_id,
        s.nome AS socio_nome,
        s.email AS socio_email,
        s.ruolo AS socio_ruolo,
        s.area_lavoro AS socio_area_lavoro,
        s.stato AS socio_stato,
        COALESCE(fr.first_reset_rnk - 1, (SELECT cnt FROM TotalEvents)) AS streak
    FROM soci s
    LEFT JOIN FirstReset fr ON fr.socio_id = s.id
    WHERE s.stato = 'ATTIVO'
    ORDER BY s.nome ASC
    """
    
    result = db.execute(text(query))
    
    streaks = []
    for row in result:
        is_critical = row.streak >= 3
        
        streaks.append({
            "socio_id": row.socio_id,
            "nome": row.socio_nome,
            "email": row.socio_email,
            "ruolo": row.socio_ruolo,
            "area_lavoro": row.socio_area_lavoro,
            "stato": row.socio_stato,
            "tipo_evento": "GLOBAL",
            "consecutive_absences": row.streak,
            "is_critical_alert": is_critical
        })
        
    return streaks

def get_member_analytics(db: Session) -> list[dict]:
    """
    Retrieves global participation stats, assembly statistics, consecutive absences streak,
    and alert levels (Yellow Pre-Alert for 1 assembly absence, Red Critical for 2+ assembly absences or 3+ global consecutive absences)
    for all active members.
    """
    query = """
    WITH RankedEvents AS (
        SELECT id AS event_id, tipo, data_ora, titolo,
               ROW_NUMBER() OVER (ORDER BY data_ora DESC) AS rnk,
               ROW_NUMBER() OVER (PARTITION BY tipo ORDER BY data_ora DESC) AS tipo_rnk
        FROM eventi WHERE is_attivo = 1
    ),
    SocioEventPresence AS (
        SELECT s.id AS socio_id, e.event_id, e.tipo AS event_type, e.titolo AS event_title, e.rnk, e.tipo_rnk, p.modalita
        FROM soci s
        CROSS JOIN RankedEvents e
        LEFT JOIN presenze p ON p.evento_id = e.event_id AND p.socio_id = s.id
        WHERE s.stato = 'ATTIVO'
    ),
    FirstAssemblyReset AS (
        SELECT socio_id, MIN(tipo_rnk) AS first_reset_rnk
        FROM SocioEventPresence
        WHERE event_type = 'ASSEMBLEA' AND modalita IN ('IN_PRESENZA', 'ONLINE', 'GIUSTIFICATO', 'ASSENTE_GIUSTIFICATO')
        GROUP BY socio_id
    ),
    TotalAssemblyEvents AS (
        SELECT COUNT(*) as cnt FROM RankedEvents WHERE tipo = 'ASSEMBLEA'
    ),
    TotalEvents AS (
        SELECT COUNT(*) as cnt FROM RankedEvents
    ),
    Stats AS (
        SELECT socio_id,
               COUNT(CASE WHEN modalita IN ('IN_PRESENZA', 'ONLINE') THEN 1 END) AS total_attendances,
               COUNT(CASE WHEN event_type = 'ASSEMBLEA' AND modalita IN ('IN_PRESENZA', 'ONLINE') THEN 1 END) AS assembly_attendances,
               COUNT(CASE WHEN event_type = 'ASSEMBLEA' AND (modalita IS NULL OR modalita IN ('ASSENTE', 'PRE_REGISTRATO')) THEN 1 END) AS assembly_absences,
               GROUP_CONCAT(CASE WHEN event_type = 'ASSEMBLEA' AND (modalita IS NULL OR modalita IN ('ASSENTE', 'PRE_REGISTRATO')) THEN event_title END, '||') AS missed_assembly_names
        FROM SocioEventPresence
        GROUP BY socio_id
    )
    SELECT
        s.id AS socio_id, s.nome, s.email, s.ruolo, s.area_lavoro,
        (SELECT cnt FROM TotalEvents) AS total_events_held,
        COALESCE(st.total_attendances, 0) AS total_attendances,
        ((SELECT cnt FROM TotalEvents) - COALESCE(st.total_attendances, 0)) AS total_absences,
        CASE 
            WHEN (SELECT cnt FROM TotalEvents) > 0 
            THEN ROUND(CAST(COALESCE(st.total_attendances, 0) AS FLOAT) * 100.0 / (SELECT cnt FROM TotalEvents), 1)
            ELSE 100.0
        END AS global_attendance_pct,
        (SELECT COUNT(*) FROM RankedEvents WHERE tipo = 'ASSEMBLEA') AS assembly_events_held,
        COALESCE(st.assembly_attendances, 0) AS assembly_attendances,
        COALESCE(st.assembly_absences, 0) AS assembly_absences,
        COALESCE(far.first_reset_rnk - 1, (SELECT cnt FROM TotalAssemblyEvents)) AS assembly_consecutive_streak,
        CASE 
            WHEN COALESCE(far.first_reset_rnk - 1, (SELECT cnt FROM TotalAssemblyEvents)) >= 2 THEN 'CRITICAL'
            WHEN COALESCE(st.assembly_absences, 0) >= 1 THEN 'PRE_ALERT'
            ELSE 'NORMAL'
        END AS warning_level,
        st.missed_assembly_names
    FROM soci s
    LEFT JOIN FirstAssemblyReset far ON far.socio_id = s.id
    LEFT JOIN Stats st ON st.socio_id = s.id
    WHERE s.stato = 'ATTIVO'
    ORDER BY s.nome ASC;
    """
    
    result = db.execute(text(query))
    analytics = []
    for row in result:
        analytics.append({
            "socio_id": row.socio_id,
            "nome": row.nome,
            "email": row.email,
            "ruolo": row.ruolo,
            "area_lavoro": row.area_lavoro,
            "total_events_held": row.total_events_held,
            "total_attendances": row.total_attendances,
            "total_absences": row.total_absences,
            "global_attendance_pct": row.global_attendance_pct,
            "assembly_events_held": row.assembly_events_held,
            "assembly_attendances": row.assembly_attendances,
            "assembly_absences": row.assembly_absences,
            "missed_assembly_names": row.missed_assembly_names.split("||") if row.missed_assembly_names else [],
            "assembly_consecutive_streak": row.assembly_consecutive_streak,
            "warning_level": row.warning_level
        })
    return analytics

