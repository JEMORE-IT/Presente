import csv
import io
import math
from typing import Optional
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
import models

def get_event_verbale_data(
    db: Session,
    event_id: int,
    ora_inizio: Optional[str] = None,
    ora_fine: Optional[str] = None
) -> dict:
    """
    Extracts and organizes event data for the official minutes report.
    """
    event = db.query(models.Evento).filter(models.Evento.id == event_id).first()
    if not event:
        raise ValueError("Event not found")

    # Active members
    active_soci = db.query(models.Socio).filter(models.Socio.stato == "ATTIVO").order_by(models.Socio.nome.asc()).all()
    active_socio_map = {s.id: s for s in active_soci}

    # Presences
    presences = db.query(models.Presenza).filter(models.Presenza.evento_id == event_id).all()
    
    presenti_sala = []
    presenti_teams = []
    annunci_list = []
    present_socio_ids = set()

    for p in presences:
        if p.socio_id not in active_socio_map:
            continue
        socio = active_socio_map[p.socio_id]

        if p.modalita == "IN_PRESENZA":
            presenti_sala.append(socio.nome)
            present_socio_ids.add(socio.id)
        elif p.modalita == "ONLINE":
            presenti_teams.append(socio.nome)
            present_socio_ids.add(socio.id)

        # Deleghe / Annunci
        delega_dest = p.delegato.nome if p.delegato else (p.delega_a.strip() if p.delega_a else None)
        if delega_dest and delega_dest.lower() not in ["nessuno", "nessuna", "no", "-", "none", "null"]:
            annunci_list.append(f"{socio.nome} delega {delega_dest}")

    # Assenti = all active members who are NOT present in person or online
    # (Includes both members with proxy delegations and unexcused absentees)
    assenti = []
    for socio in active_soci:
        if socio.id not in present_socio_ids:
            assenti.append(socio.nome)

    presenti_sala.sort()
    presenti_teams.sort()
    assenti.sort()
    annunci_list.sort()

    data_formatted = event.data_ora.strftime("%d/%m/%Y")
    default_start = event.data_ora.strftime("%H:%M")
    ora_inizio_val = ora_inizio.strip() if (ora_inizio and ora_inizio.strip()) else default_start
    ora_fine_val = ora_fine.strip() if (ora_fine and ora_fine.strip()) else ""
    luogo_val = event.luogo.strip() if (event.luogo and event.luogo.strip()) else "Sede JEMORE"

    return {
        "data": data_formatted,
        "ora_inizio": ora_inizio_val,
        "ora_fine": ora_fine_val,
        "luogo": luogo_val,
        "scopo": event.titolo,
        "presenti_sala": presenti_sala,
        "presenti_teams": presenti_teams,
        "assenti": assenti,
        "annunci": annunci_list
    }

def generate_minutes_pdf(
    db: Session,
    event_id: int,
    ora_inizio: Optional[str] = None,
    ora_fine: Optional[str] = None,
    quorum_pct: float = 0.5
) -> bytes:
    """
    Generates the print-ready PDF minutes report matching the exact official template:
    - Data: GG/MM/AAAA
    - Ora inizio: HH:MM
    - Ora di scioglimento: HH:MM
    - Luogo: <Luogo Evento>
    - Scopo della riunione: <Titolo Evento>
    - Presenti presso la Sala (N): <nomi separati da virgola>.
    - Presenti in chiamata Teams (N): <nomi separati da virgola>.
    - Assenti (N): <nomi separati da virgola>.
    - Annunci: <Delegante delega Delegato, ...>.
    """
    data = get_event_verbale_data(db, event_id, ora_inizio=ora_inizio, ora_fine=ora_fine)
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=45,
        leftMargin=45,
        topMargin=45,
        bottomMargin=45
    )
    
    styles = getSampleStyleSheet()
    
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor('#000000'),
        spaceAfter=14
    )
    
    scopo_style = ParagraphStyle(
        'ScopoStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=16,
        textColor=colors.HexColor('#000000'),
        spaceAfter=18
    )

    body_style = ParagraphStyle(
        'VerbaleBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14.5,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=16
    )
    
    story = []
    
    # 1. Header Metadata Block
    header_lines = [
        f"<b>Data:</b> {data['data']}",
        f"<b>Ora inizio:</b> {data['ora_inizio']}",
    ]
    if data['ora_fine']:
        header_lines.append(f"<b>Ora di scioglimento:</b> {data['ora_fine']}")
    else:
        header_lines.append("<b>Ora di scioglimento:</b> -")
        
    header_lines.append(f"<b>Luogo:</b> {data['luogo']}")
    
    story.append(Paragraph("<br/>".join(header_lines), header_style))
    story.append(Spacer(1, 6))
    
    # 2. Scopo della riunione
    story.append(Paragraph(f"<b>Scopo della riunione:</b> {data['scopo']}", scopo_style))
    story.append(Spacer(1, 8))
    
    # 3. Presenti presso la Sala (N)
    sala_names_str = ", ".join(data['presenti_sala']) + "." if data['presenti_sala'] else "Nessuno."
    story.append(Paragraph(f"<b>Presenti presso la Sala ({len(data['presenti_sala'])}):</b> {sala_names_str}", body_style))
    
    # 4. Presenti in chiamata Teams (N)
    teams_names_str = ", ".join(data['presenti_teams']) + "." if data['presenti_teams'] else "Nessuno."
    story.append(Paragraph(f"<b>Presenti in chiamata Teams ({len(data['presenti_teams'])}):</b> {teams_names_str}", body_style))
    
    # 5. Assenti (N)
    assenti_names_str = ", ".join(data['assenti']) + "." if data['assenti'] else "Nessuno."
    story.append(Paragraph(f"<b>Assenti ({len(data['assenti'])}):</b> {assenti_names_str}", body_style))
    
    # 6. Annunci (Deleghe)
    annunci_str = ", ".join(data['annunci']) + "." if data['annunci'] else "Nessun annuncio o delega."
    story.append(Paragraph(f"<b>Annunci:</b> {annunci_str}", body_style))
    
    doc.build(story)
    return buffer.getvalue()

def generate_minutes_csv(
    db: Session,
    event_id: int,
    ora_inizio: Optional[str] = None,
    ora_fine: Optional[str] = None,
    quorum_pct: float = 0.5
) -> bytes:
    """
    Generates a cleanly formatted text/CSV minutes report matching the official format.
    """
    data = get_event_verbale_data(db, event_id, ora_inizio=ora_inizio, ora_fine=ora_fine)
    output = io.StringIO()
    
    output.write(f"Data: {data['data']}\n")
    output.write(f"Ora inizio: {data['ora_inizio']}\n")
    output.write(f"Ora di scioglimento: {data['ora_fine'] or '-'}\n")
    output.write(f"Luogo: {data['luogo']}\n\n")
    
    output.write(f"Scopo della riunione: {data['scopo']}\n\n")
    
    sala_str = ", ".join(data['presenti_sala']) + "." if data['presenti_sala'] else "Nessuno."
    output.write(f"Presenti presso la Sala ({len(data['presenti_sala'])}): {sala_str}\n\n")
    
    teams_str = ", ".join(data['presenti_teams']) + "." if data['presenti_teams'] else "Nessuno."
    output.write(f"Presenti in chiamata Teams ({len(data['presenti_teams'])}): {teams_str}\n\n")
    
    assenti_str = ", ".join(data['assenti']) + "." if data['assenti'] else "Nessuno."
    output.write(f"Assenti ({len(data['assenti'])}): {assenti_str}\n\n")
    
    annunci_str = ", ".join(data['annunci']) + "." if data['annunci'] else "Nessun annuncio o delega."
    output.write(f"Annunci: {annunci_str}\n")
    
    return output.getvalue().encode("utf-8")
