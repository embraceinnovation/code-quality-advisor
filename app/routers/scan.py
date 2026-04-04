import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.dependencies import get_current_session
from app.session_store import SessionData
from app.services import github_client, gitlab_client, bitbucket_client
from app.services.framework_detector import detect_frameworks
from app.services.claude_analyzer import analyze_files

router = APIRouter(prefix="/api/scan", tags=["scan"])


def _client(session: SessionData):
    if session.provider == "github":
        return github_client
    if session.provider == "gitlab":
        return gitlab_client
    return bitbucket_client


class DetectRequest(BaseModel):
    owner: str
    repo: str
    branch: str


class AnalyzeRequest(BaseModel):
    owner: str
    repo: str
    branch: str
    frameworks: list[str]
    file_limit: int = 100
    llm_provider: str = "groq"
    llm_model: str = "llama-3.3-70b-versatile"
    llm_api_key: str = ""


@router.post("/detect-frameworks")
async def detect_frameworks_endpoint(
    body: DetectRequest,
    session: SessionData = Depends(get_current_session),
):
    client = _client(session)
    file_tree = await client.get_file_tree(session, body.owner, body.repo, body.branch)
    frameworks = detect_frameworks(file_tree)

    session.owner = body.owner
    session.repo = body.repo
    session.branch = body.branch
    session.file_tree = file_tree
    session.detected_frameworks = [f.__dict__ for f in frameworks]

    return {
        "detected_frameworks": session.detected_frameworks,
        "file_count": len(file_tree),
    }


@router.post("/analyze")
async def analyze_endpoint(
    body: AnalyzeRequest,
    session: SessionData = Depends(get_current_session),
):
    client = _client(session)

    session.selected_frameworks = body.frameworks
    session.llm_provider = body.llm_provider
    session.llm_model = body.llm_model
    session.llm_api_key = body.llm_api_key
    session.changes = []

    async def event_stream():
        changes_acc = []
        files = [f for f in session.file_tree if f.get("type") == "file"][:body.file_limit]
        total = len(files)
        done = 0

        async for result in analyze_files(client=client, session=session, files=files, frameworks=body.frameworks):
            if result["event"] == "progress":
                done += 1
                changes_acc.extend(result.get("changes", []))
                payload = json.dumps({
                    "event": "progress",
                    "file": result["file"],
                    "done": done,
                    "total": total,
                    "new_changes": result.get("changes", []),
                })
                yield f"data: {payload}\n\n"
            elif result["event"] == "error":
                payload = json.dumps({"event": "error", "file": result["file"], "message": result["message"]})
                yield f"data: {payload}\n\n"

        session.changes = changes_acc
        yield f"data: {json.dumps({'event': 'complete', 'total_changes': len(changes_acc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
