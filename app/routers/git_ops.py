import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from app.dependencies import get_current_session
from app.session_store import SessionData
from app.services import git_service

router = APIRouter(prefix="/api/git", tags=["git"])


class BranchRequest(BaseModel):
    change_ids: list[str]
    branch_name: Optional[str] = None


@router.post("/branch")
async def create_branch(
    body: BranchRequest,
    session: SessionData = Depends(get_current_session),
):
    if not session.owner or not session.repo or not session.branch:
        raise HTTPException(400, "No repo selected in session")

    selected = [c for c in session.changes if c.get("id") in body.change_ids]
    if not selected:
        raise HTTPException(400, "No changes selected")

    async def event_stream():
        async for event in git_service.prepare_branch(
            session=session,
            selected_changes=selected,
            branch_name=body.branch_name,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/diff")
async def get_diff(session: SessionData = Depends(get_current_session)):
    if not session.clone_dir or not session.pending_branch:
        raise HTTPException(400, "No branch prepared yet")
    diff_text = await git_service.get_diff(session)
    return {"diff": diff_text, "branch_name": session.pending_branch}


@router.post("/push")
async def push_branch(session: SessionData = Depends(get_current_session)):
    if not session.pending_branch or not session.clone_dir:
        raise HTTPException(400, "No branch prepared to push")
    push_url = await git_service.push_branch(session)
    return {"push_url": push_url, "branch_name": session.pending_branch}
