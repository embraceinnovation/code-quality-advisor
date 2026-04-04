from fastapi import HTTPException, Request, Depends

from app.config import get_settings, Settings
from app.session_store import SessionData, decrypt_token, get_session

COOKIE_NAME = "cqa_session"


def get_current_session(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SessionData:
    """
    FastAPI dependency — resolves session from cookie, decrypts the PAT,
    and injects it as session.access_token for downstream use.
    Raises 401 if missing or expired.
    """
    session_id = request.cookies.get(COOKIE_NAME)
    if not session_id:
        raise HTTPException(401, "Not authenticated")
    session = get_session(session_id)
    if not session:
        raise HTTPException(401, "Session expired — please sign in again")

    # Decrypt PAT into the runtime field so all clients can use session.access_token
    session.access_token = decrypt_token(session.encrypted_token, settings.secret_key)
    return session
