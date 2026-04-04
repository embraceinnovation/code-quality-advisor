import base64
import hashlib
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

from cryptography.fernet import Fernet


# ── Encryption helpers ─────────────────────────────────────────────────────────

def _fernet(secret_key: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode()).digest())
    return Fernet(key)


def encrypt_token(token: str, secret_key: str) -> str:
    return _fernet(secret_key).encrypt(token.encode()).decode()


def decrypt_token(encrypted: str, secret_key: str) -> str:
    return _fernet(secret_key).decrypt(encrypted.encode()).decode()


# ── Session data ───────────────────────────────────────────────────────────────

SESSION_TTL_DAYS = 30
SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60


@dataclass
class SessionData:
    provider: str
    encrypted_token: str      # Fernet-encrypted PAT / app-password — never plaintext at rest
    username: str
    avatar_url: str
    display_name: str
    expires_at: float = field(default_factory=lambda: time.time() + SESSION_TTL_SECONDS)

    # Repo selection
    owner: str = ""
    repo: str = ""
    branch: str = ""

    # Provider-specific identifiers
    repo_id: str = ""       # GitLab numeric project ID
    workspace: str = ""     # Bitbucket username (needed for Basic auth)

    # Scan results
    file_tree: list = field(default_factory=list)
    detected_frameworks: list = field(default_factory=list)
    selected_frameworks: list = field(default_factory=list)

    # Analysis results
    changes: list = field(default_factory=list)
    selected_change_ids: list = field(default_factory=list)

    # LLM config (set at analysis time)
    llm_provider: str = "groq"
    llm_model: str = "llama-3.3-70b-versatile"
    llm_api_key: str = ""

    # Git ops state
    clone_dir: str = ""
    pending_branch: str = ""
    commit_sha: str = ""
    diff_summary: str = ""

    # Report
    report_markdown: str = ""

    # Runtime only — decrypted by the get_current_session dependency, never stored
    access_token: str = field(default="", compare=False, repr=False)

    def is_expired(self) -> bool:
        return time.time() > self.expires_at

    def get_token(self, secret_key: str) -> str:
        """Decrypt and return the raw access token."""
        return decrypt_token(self.encrypted_token, secret_key)


# ── Module-level stores ────────────────────────────────────────────────────────

_sessions: dict[str, SessionData] = {}


def create_session(data: SessionData) -> str:
    session_id = secrets.token_urlsafe(32)
    _sessions[session_id] = data
    return session_id


def get_session(session_id: str) -> Optional[SessionData]:
    session = _sessions.get(session_id)
    if session and session.is_expired():
        del _sessions[session_id]
        return None
    return session


def delete_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def purge_expired() -> int:
    """Remove all expired sessions. Called from lifespan cleanup."""
    expired = [sid for sid, s in _sessions.items() if s.is_expired()]
    for sid in expired:
        del _sessions[sid]
    return len(expired)


def all_session_ids() -> list[str]:
    return list(_sessions.keys())
