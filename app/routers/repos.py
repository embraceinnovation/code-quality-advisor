from fastapi import APIRouter, Depends, HTTPException, Request
from app.dependencies import get_current_session
from app.session_store import SessionData
from app.services import github_client, gitlab_client, bitbucket_client

router = APIRouter(prefix="/api/repos", tags=["repos"])


def _client(session: SessionData):
    if session.provider == "github":
        return github_client
    if session.provider == "gitlab":
        return gitlab_client
    if session.provider == "bitbucket":
        return bitbucket_client
    raise HTTPException(400, f"Unknown provider: {session.provider}")


@router.get("")
async def list_repos(session: SessionData = Depends(get_current_session)):
    repos = await _client(session).list_repos(session)
    return {"repos": repos}


@router.get("/{owner}/{repo}/branches")
async def list_branches(
    owner: str,
    repo: str,
    session: SessionData = Depends(get_current_session),
):
    branches = await _client(session).list_branches(session, owner, repo)
    session.owner = owner
    session.repo = repo
    return {"branches": branches}
