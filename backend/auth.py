import os
import time
import hmac
import hashlib
import secrets
import jwt
import httpx
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from typing import Optional
from fastapi import Header

# DEV_MODE: Set to True for local testing without Azure Entra configuration.
# In production (e.g. Dokploy), set DEV_MODE=false to enforce full RS256 JWKS validation.
DEV_MODE = os.getenv("DEV_MODE", "true").lower() in ("true", "1", "yes")

# Secret key for generating/verifying dynamic QR code HMAC tokens.
# In production, this must be a secure random key loaded from environment variables.
QR_SECRET_KEY = os.getenv("QR_SECRET_KEY", "presente-super-secret-key-321").encode("utf-8")

# Internal shared secret for server-to-server calls (e.g. NextAuth <-> FastAPI)
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "presente-internal-system-secret-2026")

# Microsoft JWKS config (supports tenant-specific or common)
MS_TENANT_ID = os.getenv("MS_TENANT_ID", "common")
MICROSOFT_JWKS_URL = f"https://login.microsoftonline.com/{MS_TENANT_ID}/discovery/v2.0/keys"
jwks_cache = {"keys": [], "expires_at": 0}

security = HTTPBearer(auto_error=False)

async def get_microsoft_jwks() -> list:
    """
    Fetches and caches the public keys from Microsoft JWKS endpoint.
    Cache expires every 24 hours.
    """
    now = time.time()
    if jwks_cache["expires_at"] > now and jwks_cache["keys"]:
        return jwks_cache["keys"]

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(MICROSOFT_JWKS_URL)
            response.raise_for_status()
            data = response.json()
            jwks_cache["keys"] = data.get("keys", [])
            jwks_cache["expires_at"] = now + 86400  # Cache for 24 hours
            return jwks_cache["keys"]
    except Exception as e:
        print(f"Error fetching Microsoft JWKS: {e}")
        # Return whatever is in cache if fetch fails
        return jwks_cache["keys"]

def generate_static_qr_token(event_id: int) -> str:
    """
    Generates a stateless, permanent QR code token for a given event,
    so users cannot guess the URL for other events.
    """
    message = f"event_static:{event_id}".encode("utf-8")
    token = hmac.new(QR_SECRET_KEY, message, hashlib.sha256).hexdigest()[:16]
    return token

def verify_static_qr_token(event_id: int, token_to_verify: str) -> bool:
    expected = generate_static_qr_token(event_id)
    return hmac.compare_digest(expected, token_to_verify)

def generate_qr_token(event_id: int, timestamp: float = None) -> tuple[str, int]:
    """
    Generates a stateless rotating QR code token for a given event.
    Returns:
        (token_hex, time_window_id)
    """
    if timestamp is None:
        timestamp = time.time()
    
    # Define a 30-second window ID
    window_id = int(timestamp // 30)
    
    # Message to sign contains event_id and the time window
    message = f"event:{event_id}:window:{window_id}".encode("utf-8")
    
    # Generate HMAC-SHA256 signature
    token = hmac.new(QR_SECRET_KEY, message, hashlib.sha256).hexdigest()
    return token, window_id

def verify_qr_token(event_id: int, token_to_verify: str) -> bool:
    """
    Verifies a rotating QR code token by checking the current time window
    and the previous time window (to account for network lag and clock drift).
    """
    now = time.time()
    current_window = int(now // 30)
    
    # Check current window and previous window (max 60-second validity)
    for window in [current_window, current_window - 1]:
        message = f"event:{event_id}:window:{window}".encode("utf-8")
        expected_token = hmac.new(QR_SECRET_KEY, message, hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected_token, token_to_verify):
            return True
            
    return False

def generate_form_slug(event_id: int) -> str:
    """
    Generates a secure, deterministic or random URL-safe slug for the event's form.
    Format is clean and concise: 8 characters.
    """
    message = f"form_secret:{event_id}".encode("utf-8")
    slug = hmac.new(QR_SECRET_KEY, message, hashlib.sha256).hexdigest()[:8]
    return slug

def generate_daily_qr_code(event_id: int, timestamp: float = None) -> str:
    """
    Generates a daily rotating QR code (valid for 24 hours).
    Format: "{event_id}-{sig}" with no eventId segment in the path: /checkin/{code}.
    """
    if timestamp is None:
        timestamp = time.time()
    day_window = int(timestamp // 86400)
    message = f"event_daily:{event_id}:{day_window}".encode("utf-8")
    sig = hmac.new(QR_SECRET_KEY, message, hashlib.sha256).hexdigest()[:12]
    return f"{event_id}-{sig}"

def verify_daily_qr_code(code: str) -> tuple[bool, int | None]:
    """
    Verifies daily QR code and returns (is_valid, event_id).
    Checks current 24h day window and previous day window (tolerance for midnight events).
    """
    try:
        parts = code.split("-")
        if len(parts) != 2:
            return False, None
        event_id = int(parts[0])
        token_to_verify = parts[1]
    except Exception:
        return False, None

    now = time.time()
    current_day = int(now // 86400)
    for day in [current_day, current_day - 1]:
        message = f"event_daily:{event_id}:{day}".encode("utf-8")
        expected_sig = hmac.new(QR_SECRET_KEY, message, hashlib.sha256).hexdigest()[:12]
        if hmac.compare_digest(expected_sig, token_to_verify):
            return True, event_id

    return False, None

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
) -> dict:
    """
    Validates authentication for incoming requests.
    Supports:
    1. Internal server-to-server calls via X-Internal-Secret or Bearer <INTERNAL_API_SECRET>.
    2. Microsoft Entra ID JWT Bearer tokens (with DEV_MODE fallback for local testing).
    """
    # 1. Check for trusted internal system secret
    if x_internal_secret and hmac.compare_digest(x_internal_secret, INTERNAL_API_SECRET):
        return {
            "email": "system@jemore.it",
            "name": "Internal System",
            "ruolo": "Board",
            "area_lavoro": "IT",
            "is_admin": True,
            "claims": {"ruolo": "Board", "area_lavoro": "IT"}
        }

    # 2. Check for Bearer token credentials
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Autenticazione richiesta. Effettua l'accesso con il tuo account @jemore.it.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = credentials.credentials.strip()

    # 3. Check if Bearer token is the internal secret
    if hmac.compare_digest(token, INTERNAL_API_SECRET):
        return {
            "email": "system@jemore.it",
            "name": "Internal System",
            "ruolo": "Board",
            "area_lavoro": "IT",
            "is_admin": True,
            "claims": {"ruolo": "Board", "area_lavoro": "IT"}
        }

    # 4. In DEV_MODE:
    if DEV_MODE:
        try:
            # Decode payload without verifying signature for local dev
            payload = jwt.decode(token, options={"verify_signature": False, "verify_exp": False})
            email = payload.get("preferred_username") or payload.get("email") or payload.get("upn")
            name = payload.get("name", "Dev User")
            return {
                "email": (email or "dev.user@jemore.it").lower().strip(),
                "name": name,
                "claims": payload
            }
        except Exception:
            clean_email = token.lower().strip()
            if "@" not in clean_email:
                clean_email = f"{clean_email}@jemore.it"
            return {
                "email": clean_email,
                "name": token.title(),
                "claims": {}
            }

    # 5. PRODUCTION MODE: Full JWKS validation
    try:
        unverified_header = jwt.get_unverified_header(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token format: {e}")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Token header missing 'kid'")

    jwks = await get_microsoft_jwks()
    
    # Find matching key in JWKS
    rsa_key = {}
    for key in jwks:
        if key.get("kid") == kid:
            rsa_key = {
                "kty": key.get("kty"),
                "kid": key.get("kid"),
                "use": key.get("use"),
                "n": key.get("n"),
                "e": key.get("e")
            }
            break

    if not rsa_key:
        raise HTTPException(status_code=401, detail="Could not find matching public key in JWKS")

    try:
        from jwt import PyJWK
        jwk = PyJWK(rsa_key)
        
        payload = jwt.decode(
            token,
            jwk.key,
            algorithms=["RS256"],
            options={"verify_aud": False}
        )
        
        email = payload.get("preferred_username") or payload.get("email") or payload.get("upn")
        if not email:
            raise HTTPException(status_code=401, detail="Token is missing email field")
            
        return {
            "email": email.lower().strip(),
            "name": payload.get("name", ""),
            "claims": payload
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTClaimsError as e:
        raise HTTPException(status_code=401, detail=f"Incorrect claims: {e}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")

def is_admin_or_it_manager(user: dict, db = None) -> bool:
    """
    Checks if user has administrator or IT Manager privileges.
    Guarantees Joachim Chiebuka full Super-Admin rights.
    """
    if user.get("is_admin"):
        return True

    email = (user.get("email") or "").lower().strip()
    name = (user.get("name") or "").lower().strip()
    claims = user.get("claims") or {}
    ruolo = str(claims.get("ruolo") or user.get("ruolo") or "").lower().strip()
    area_lavoro = str(claims.get("area_lavoro") or user.get("area_lavoro") or "").lower().strip()

    # 1. Super-admin: Joachim Chiebuka (IT Manager)
    if "joachim" in email or "joachim" in name:
        return True
    if "manager" in ruolo or "it" in area_lavoro or "it" in ruolo:
        return True
    if any(k in ruolo for k in ["board", "responsabile", "presidente", "tesoriere", "segretario"]):
        return True
    if any(k in area_lavoro for k in ["board", "responsabile"]):
        return True
    if email in ["board@jemore.it", "responsabili@jemore.it"]:
        return True

    # 2. Check against database role if db session provided
    if db is not None:
        try:
            import models
            socio = db.query(models.Socio).filter(models.Socio.email.ilike(email)).first()
            if socio:
                s_ruolo = (socio.ruolo or "").lower().strip()
                s_area = (socio.area_lavoro or "").lower().strip()
                if "it" in s_area or "it" in s_ruolo or "manager" in s_ruolo:
                    return True
                if any(k in s_ruolo for k in ["board", "responsabile", "presidente", "tesoriere", "segretario"]):
                    return True
                if any(k in s_area for k in ["board", "responsabile"]):
                    return True
        except Exception:
            pass

    return False

async def require_admin_or_it_manager(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    FastAPI dependency that enforces administrative or IT Manager privileges.
    Checks user claims and association database records.
    """
    from database import SessionLocal
    db = SessionLocal()
    try:
        if not is_admin_or_it_manager(current_user, db):
            raise HTTPException(
                status_code=403,
                detail="Accesso negato: operazione riservata al Board e IT Manager (Joachim Chiebuka)."
            )
        return current_user
    finally:
        db.close()
