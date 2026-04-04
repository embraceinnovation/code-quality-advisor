from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import get_current_session
from app.session_store import SessionData

router = APIRouter(prefix="/api/changes", tags=["changes"])


class SelectionRequest(BaseModel):
    change_ids: list[str]


@router.get("")
async def get_changes(session: SessionData = Depends(get_current_session)):
    sorted_changes = sorted(
        session.changes,
        key=lambda c: (c.get("file_path", ""), c.get("line_number", 0)),
    )
    return {
        "changes": sorted_changes,
        "total": len(sorted_changes),
        "selected_ids": session.selected_change_ids,
    }


@router.post("/selection")
async def save_selection(
    body: SelectionRequest,
    session: SessionData = Depends(get_current_session),
):
    session.selected_change_ids = body.change_ids
    return {"saved": len(body.change_ids)}
