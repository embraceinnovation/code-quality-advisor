import base64
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import httpx

from app.config import get_settings
from app.session_store import (
    SessionData,
    create_session,
    delete_session,
    get_session,
    encrypt_token,
)

router = APIRouter(prefix="/api/oauth", tags=["auth"])

COOKIE_NAME = "cqa_session"
COOKIE_TTL = 60 * 60 * 24 * 30  # 30 days


# ── PAT validation helpers ─────────────────────────────────────────────────────

async def _validate_github(pat: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {pat}", "Accept": "application/vnd.github+json"},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid GitHub token — check scopes include 'repo' and 'read:user'")
    u = resp.json()
    return {
        "username": u["login"],
        "display_name": u.get("name") or u["login"],
        "avatar_url": u.get("avatar_url", ""),
    }


async def _validate_gitlab(pat: str, base_url: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{base_url}/api/v4/user",
            headers={"PRIVATE-TOKEN": pat},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid GitLab token — check scopes include 'api' and 'read_user'")
    u = resp.json()
    return {
        "username": u["username"],
        "display_name": u.get("name") or u["username"],
        "avatar_url": u.get("avatar_url", ""),
    }


async def _validate_bitbucket(email: str, api_token: str) -> dict:
    """Validate a Bitbucket API token (replaces deprecated app passwords).
    Basic auth uses email:token; workspace slug is derived from /user response."""
    creds = base64.b64encode(f"{email}:{api_token}".encode()).decode()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.bitbucket.org/2.0/user",
            headers={"Authorization": f"Basic {creds}"},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid Bitbucket credentials — check your email address and API token scopes")
    u = resp.json()
    # nickname is the workspace slug used in API URL paths (e.g. /repositories/{nickname}/)
    workspace_slug = u.get("nickname") or u.get("username", "")
    return {
        "username": email,           # stored as session.username — used in Basic auth header
        "workspace": workspace_slug, # stored as session.workspace — used in API URL paths
        "display_name": u.get("display_name", email),
        "avatar_url": u.get("links", {}).get("avatar", {}).get("href", ""),
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    provider: str      # github | gitlab | bitbucket
    pat: str           # PAT for GitHub/GitLab; app password for Bitbucket
    username: str = "" # Required for Bitbucket


@router.post("/login")
async def login(body: LoginRequest):
    settings = get_settings()

    if body.provider == "github":
        user_info = await _validate_github(body.pat)
        raw_token = body.pat
        workspace = ""

    elif body.provider == "gitlab":
        user_info = await _validate_gitlab(body.pat, settings.gitlab_base_url)
        raw_token = body.pat
        workspace = ""

    elif body.provider == "bitbucket":
        if not body.username.strip():
            raise HTTPException(400, "Atlassian email address is required for Bitbucket")
        user_info = await _validate_bitbucket(body.username.strip(), body.pat)
        raw_token = body.pat
        workspace = user_info["workspace"]  # derived from /user response (nickname)

    else:
        raise HTTPException(400, f"Unknown provider: {body.provider}")

    session = SessionData(
        provider=body.provider,
        encrypted_token=encrypt_token(raw_token, settings.secret_key),
        username=user_info["username"],
        avatar_url=user_info["avatar_url"],
        display_name=user_info["display_name"],
        workspace=workspace,
    )
    session_id = create_session(session)

    resp = JSONResponse({
        "authenticated": True,
        "provider": body.provider,
        "username": user_info["username"],
        "display_name": user_info["display_name"],
        "avatar_url": user_info["avatar_url"],
    })
    resp.set_cookie(COOKIE_NAME, session_id, httponly=True, samesite="lax", max_age=COOKIE_TTL)
    return resp


@router.get("/me")
async def get_me(request: Request):
    session_id = request.cookies.get(COOKIE_NAME)
    if not session_id:
        return {"authenticated": False}
    session = get_session(session_id)
    if not session:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "provider": session.provider,
        "username": session.username,
        "display_name": session.display_name,
        "avatar_url": session.avatar_url,
    }


@router.post("/logout")
async def logout(request: Request):
    session_id = request.cookies.get(COOKIE_NAME)
    if session_id:
        delete_session(session_id)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE_NAME)
    return resp
