import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
from sqlalchemy.orm import Session
import models

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

def sync_soci_from_postgres(db: Session, postgres_url: str = None):
    """
    Connects to the external PostgreSQL database, reads the 'prospetto_soci' table,
    and upserts the records into the local SQLite 'soci' table.
    """
    url = postgres_url or os.environ.get("POSTGRES_SYNC_URL", "")
    if not url:
        print("Warning: POSTGRES_SYNC_URL environment variable is not set. Skipping Postgres sync.")
        return {"status": "error", "message": "POSTGRES_SYNC_URL non configurato"}
    
    print(f"Attempting to sync soci from PostgreSQL: {url.split('@')[-1] if '@' in url else 'configured-url'}")
    
    try:
        # Connect to Postgres with explicit 3-second timeout
        conn = psycopg2.connect(url, connect_timeout=3)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Read from prospetto_soci
        cursor.execute("SELECT nome, ruolo, area_lavoro FROM prospetto_soci;")
        pg_soci = cursor.fetchall()
        
        # Process each row
        synced_count = 0
        added_count = 0
        updated_count = 0
        
        for pg_socio in pg_soci:
            nome_originale = str(pg_socio.get("nome", "")).strip()
            if not nome_originale:
                continue
                
            email = nome_originale.replace(" ", "").lower() + "@jemore.it"
            
            nome = nome_originale
            ruolo = str(pg_socio.get("ruolo", "")).strip() or None
            area_lavoro = str(pg_socio.get("area_lavoro", "")).strip() or None
            
            # Check if socio exists in local SQLite
            local_socio = db.query(models.Socio).filter(models.Socio.email.ilike(email)).first()
            
            if local_socio:
                # Update existing
                local_socio.nome = nome
                local_socio.ruolo = ruolo
                local_socio.area_lavoro = area_lavoro
                # We don't overwrite 'stato' because Postgres doesn't have it (default to ATTIVO if new)
                updated_count += 1
            else:
                # Create new
                new_socio = models.Socio(
                    nome=nome,
                    ruolo=ruolo,
                    area_lavoro=area_lavoro,
                    email=email,
                    stato="ATTIVO"  # Default status for new members
                )
                db.add(new_socio)
                added_count += 1
                
            synced_count += 1
            
        db.commit()
        cursor.close()
        conn.close()
        
        print(f"PostgreSQL Sync complete. Added: {added_count}, Updated: {updated_count}. Total in Postgres: {synced_count}")
        return {
            "status": "success",
            "added": added_count,
            "updated": updated_count,
            "total_synced": synced_count
        }
        
    except psycopg2.OperationalError as e:
        print(f"Failed to connect to PostgreSQL: {e}")
        return {"status": "error", "message": f"Connection failed: {str(e)}"}
    except Exception as e:
        print(f"Error during PostgreSQL sync: {e}")
        return {"status": "error", "message": f"Sync error: {str(e)}"}
