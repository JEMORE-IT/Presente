import os
import csv
import re
import unicodedata
from typing import Optional
from sqlalchemy.orm import Session
from database import SessionLocal, Base, engine
from models import Socio

def generate_email(name: str) -> str:
    """
    Generates a clean email like nomecognome@jemore.it
    All words in full name lowercased, concatenated without dots, spaces, or accents.
    """
    # Normalize unicode to decompose accents (e.g. à -> a)
    normalized = unicodedata.normalize('NFKD', name)
    # Convert to ascii bytes, ignoring errors, then back to string
    ascii_str = normalized.encode('ASCII', 'ignore').decode('ASCII')
    # Remove all spaces, dots, and non-alphanumeric characters
    clean_name = re.sub(r'[^a-zA-Z0-9]', '', ascii_str)
    return f"{clean_name.lower()}@jemore.it"

def parse_and_seed_csv(db: Session, csv_path: str):
    """
    Parses prospetto_completo_2026-08-19.csv and seeds the SQLite database.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found at: {csv_path}")

    print(f"Reading CSV file from: {csv_path}...")
    
    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        # Read header and print check
        print(f"Found CSV headers: {reader.fieldnames}")
        
        count_added = 0
        count_skipped = 0
        
        for row in reader:
            try:
                socio_id = int(row.get('id', '').strip())
                nome = row.get('nome', '').strip()
                ruolo = row.get('ruolo', '').strip()
                area_lavoro = row.get('area_lavoro', '').strip()
                uscita_effettiva = row.get('uscita_effettiva', '').strip()
                
                # Check status
                # If uscita_effettiva is not empty, status is ALUMNI, otherwise ATTIVO
                stato = "ALUMNI" if uscita_effettiva else "ATTIVO"
                
                if not nome:
                    print(f"Skipping row with missing name for ID: {socio_id}")
                    continue
                
                email = generate_email(nome)
                
                # Check if socio already exists in db
                existing = db.query(Socio).filter(Socio.id == socio_id).first()
                if existing:
                    # Update fields
                    existing.nome = nome
                    existing.ruolo = ruolo
                    existing.area_lavoro = area_lavoro
                    existing.email = email
                    existing.stato = stato
                    count_skipped += 1
                else:
                    new_socio = Socio(
                        id=socio_id,
                        nome=nome,
                        ruolo=ruolo,
                        area_lavoro=area_lavoro,
                        email=email,
                        stato=stato
                    )
                    db.add(new_socio)
                    count_added += 1
            except Exception as e:
                print(f"Error parsing row {row}: {e}")
                
        db.commit()
        print(f"Database seeding complete: {count_added} added, {count_skipped} updated.")

possible_paths = [
    "../prospetto_completo_2026-08-19.csv",
    "prospetto_completo_2026-08-19.csv"
]

def find_socio_by_name_or_email(db: Session, query_str: str) -> Optional[Socio]:
    """
    Search for a Socio in database matching query_str by name or email.
    We normalize both query and db values to maximize matching.
    """
    if not query_str:
        return None
        
    query_str_clean = query_str.strip().lower()
    
    # 1. Direct email lookup
    socio = db.query(Socio).filter(Socio.email == query_str_clean).first()
    if socio:
        return socio
        
    # 2. Try match using generate_email on the input
    gen_email = generate_email(query_str)
    socio = db.query(Socio).filter(Socio.email == gen_email).first()
    if socio:
        return socio
        
    # 3. Fuzzy/normalized name check
    active_soci = db.query(Socio).filter(Socio.stato == "ATTIVO").all()
    
    def normalize_name(name: str) -> str:
        normalized = unicodedata.normalize('NFKD', name)
        ascii_str = normalized.encode('ASCII', 'ignore').decode('ASCII')
        return re.sub(r'[^a-zA-Z0-9]', '', ascii_str).lower()
        
    query_norm = normalize_name(query_str)
    for s in active_soci:
        if normalize_name(s.nome) == query_norm:
            return s
            
    # Try substring match
    for s in active_soci:
        s_norm = normalize_name(s.nome)
        if query_norm in s_norm or s_norm in query_norm:
            return s
            
    return None

def parse_pre_assembly_csv(db: Session, event_id: int, csv_content: str) -> dict:
    """
    Parses a pre-assembly Google Form export CSV string and updates/seeds the presenze table.
    - Members absent with a proxy are marked as GIUSTIFICATO (storing proxy delegate details in delegato_id / delega_a).
    - Members intending to attend are set to PRE_REGISTRATO.
    """
    import csv
    import io
    from models import Socio, Presenza
    
    # Read the CSV content as a file-like object
    f = io.StringIO(csv_content.strip())
    reader = csv.DictReader(f)
    
    # Check headers
    headers = reader.fieldnames or []
    print(f"Pre-assembly CSV headers: {headers}")
    
    # Helper to find matching headers
    def find_header(keywords):
        for h in headers:
            if any(k in h.lower() for k in keywords):
                return h
        return None
        
    email_header = find_header(["email", "indirizzo", "mail"])
    nome_header = find_header(["nome", "cognome", "socio", "nominativo", "name"])
    attendance_header = find_header(["partecip", "presen", "attend", "ci sarai", "modalità di presenza"])
    
    # Priority to actual name fields, avoid the file upload field
    delega_header = find_header(["nome del delegato", "a chi deleghi", "delegat"])
    if not delega_header:
        # Fallback if they just called it "delega" but ensure it's not the document upload
        for h in headers:
            h_low = h.lower()
            if "delega" in h_low and "documento" not in h_low and "file" not in h_low:
                delega_header = h
                break
    
    print(f"Mapped headers: email={email_header}, nome={nome_header}, attendance={attendance_header}, delega={delega_header}")
    
    count_giustificati = 0
    count_preregistrati = 0
    count_errors = 0
    
    for row in reader:
        try:
            # 1. Get email
            email_val = ""
            if email_header:
                email_val = row.get(email_header, "").strip().lower()
            else:
                # Loop columns to find email format
                for k, v in row.items():
                    if v and "@" in v:
                        email_val = v.strip().lower()
                        break
            
            if not email_val:
                continue
                
            # 2. Get attendance state & proxy delegate
            attendance_val = row.get(attendance_header, "").strip().lower() if attendance_header else ""
            delega_val = row.get(delega_header, "").strip() if delega_header else ""
            
            # Find matching socio
            socio = db.query(Socio).filter(Socio.email == email_val).first()
            if not socio:
                # Try matching by name if name header is present
                nome_val = row.get(nome_header, "").strip() if nome_header else ""
                if nome_val:
                    generated = generate_email(nome_val)
                    socio = db.query(Socio).filter(Socio.email == generated).first()
            
            if not socio:
                print(f"Pre-assembly import: Member not found in database for email: {email_val}")
                count_errors += 1
                continue
                
            # Clean and sanitize delegation value
            clean_delega = delega_val.strip() if delega_val else ""
            if clean_delega.lower() in ["nessuno", "nessuna", "no", "-", "none", "null", "n/a", "na"]:
                clean_delega = ""

            # Determine presence modality:
            is_absent = "no" in attendance_val or "non" in attendance_val or "assente" in attendance_val
            is_online = "online" in attendance_val
            is_in_person = "presenza" in attendance_val
            has_proxy = bool(clean_delega)
            
            if has_proxy:
                modalita = "GIUSTIFICATO"
            elif is_absent:
                modalita = "ASSENTE"
            elif is_online or is_in_person:
                modalita = "PRE_REGISTRATO"
            else:
                modalita = "PRE_REGISTRATO"
                
            # Perform delegate lookup
            delegato_id_val = None
            if modalita == "GIUSTIFICATO" and clean_delega:
                delegato_socio = find_socio_by_name_or_email(db, clean_delega)
                if delegato_socio:
                    delegato_id_val = delegato_socio.id
                
            # Create or update Presenza record
            presence = db.query(Presenza).filter(
                Presenza.evento_id == event_id,
                Presenza.socio_id == socio.id
            ).first()
            
            if presence:
                presence.modalita = modalita
                presence.delega_a = clean_delega if modalita == "GIUSTIFICATO" else None
                presence.delegante_id = socio.id if modalita == "GIUSTIFICATO" else None
                presence.delegato_id = delegato_id_val if modalita == "GIUSTIFICATO" else None
                presence.is_preregistrato = (modalita == "PRE_REGISTRATO")
            else:
                presence = Presenza(
                    evento_id=event_id,
                    socio_id=socio.id,
                    modalita=modalita,
                    delega_a=clean_delega if modalita == "GIUSTIFICATO" else None,
                    delegante_id=socio.id if modalita == "GIUSTIFICATO" else None,
                    delegato_id=delegato_id_val if modalita == "GIUSTIFICATO" else None,
                    durata_minuti=0,
                    is_preregistrato=(modalita == "PRE_REGISTRATO")
                )
                db.add(presence)
                
            if modalita == "GIUSTIFICATO":
                count_giustificati += 1
            elif modalita == "ASSENTE":
                count_assenti = locals().get("count_assenti", 0) + 1
            else:
                count_preregistrati += 1
                
        except Exception as e:
            print(f"Error importing row {row}: {e}")
            count_errors += 1
            
    db.commit()
    return {
        "status": "success",
        "giustificati": count_giustificati,
        "assenti": locals().get("count_assenti", 0),
        "preregistrati": count_preregistrati,
        "errors": count_errors
    }

def parse_and_seed_csv_text(db: Session, csv_content: str) -> dict:
    """
    Parses prospetto_completo_2026-08-19.csv contents (as a string) and seeds/updates the SQLite database.
    """
    import io
    f = io.StringIO(csv_content.strip())
    reader = csv.DictReader(f)
    
    count_added = 0
    count_skipped = 0
    
    for row in reader:
        try:
            socio_id_str = row.get('id', '').strip()
            if not socio_id_str:
                continue
            socio_id = int(socio_id_str)
            nome = row.get('nome', '').strip()
            ruolo = row.get('ruolo', '').strip()
            area_lavoro = row.get('area_lavoro', '').strip()
            uscita_effettiva = row.get('uscita_effettiva', '').strip()
            
            # Check status: If uscita_effettiva is not empty, status is ALUMNI, otherwise ATTIVO
            stato = "ALUMNI" if uscita_effettiva else "ATTIVO"
            
            if not nome:
                continue
            
            email = generate_email(nome)
            
            # Check if socio already exists in db
            existing = db.query(Socio).filter(Socio.id == socio_id).first()
            if existing:
                # Update fields
                existing.nome = nome
                existing.ruolo = ruolo
                existing.area_lavoro = area_lavoro
                existing.email = email
                existing.stato = stato
                count_skipped += 1
            else:
                new_socio = Socio(
                    id=socio_id,
                    nome=nome,
                    ruolo=ruolo,
                    area_lavoro=area_lavoro,
                    email=email,
                    stato=stato
                )
                db.add(new_socio)
                count_added += 1
        except Exception as e:
            print(f"Error parsing row {row}: {e}")
            
    db.commit()
    return {"added": count_added, "updated": count_skipped}

if __name__ == "__main__":
    # Create tables if not exist
    Base.metadata.create_all(bind=engine)
    
    # Locate CSV file (checking parent directory first since script runs in /backend)
    csv_file = None
    for p in possible_paths:
        if os.path.exists(p):
            csv_file = p
            break
            
    if csv_file:
        db = SessionLocal()
        try:
            parse_and_seed_csv(db, csv_file)
        finally:
            db.close()
    else:
        print("Error: Could not locate prospetto_completo_2026-08-19.csv in backend/ or root folder.")
