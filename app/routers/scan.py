import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.dependencies import get_current_session
from app.session_store import SessionData
from app.services import github_client, gitlab_client, bitbucket_client
from app.services.framework_detector import detect_frameworks
from app.services.claude_analyzer import analyze_files, _call_llm
from app.services.llm_recommender import recommend_llms

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


class ValidateKeyRequest(BaseModel):
    llm_provider: str
    llm_model: str
    llm_api_key: str


@router.post("/validate-key")
async def validate_key(body: ValidateKeyRequest):
    """Make a minimal test call to confirm the API key is valid."""
    try:
        await _call_llm(
            provider=body.llm_provider,
            model=body.llm_model,
            api_key=body.llm_api_key,
            system_prompt="You are a test assistant.",
            user_message="Reply with the single word: ok",
            max_tokens=5,
        )
        return {"valid": True}
    except Exception as e:
        msg = str(e)
        if "401" in msg or "403" in msg or "invalid_api_key" in msg.lower() or "authentication" in msg.lower() or "unauthorized" in msg.lower():
            return {"valid": False, "reason": "Invalid API key — please check and try again."}
        if "429" in msg or "rate" in msg.lower():
            return {"valid": True, "reason": "Key is valid but rate limited — you may experience delays."}
        return {"valid": False, "reason": f"Could not connect to {body.llm_provider}: {msg[:120]}"}


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

    recommendations = recommend_llms([f["id"] for f in session.detected_frameworks])

    return {
        "detected_frameworks": session.detected_frameworks,
        "file_count": len(file_tree),
        "llm_recommendations": recommendations,
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

        # Emit a start event immediately so client knows the stream is alive
        yield f"data: {json.dumps({'event': 'start', 'total': total, 'provider': body.llm_provider, 'model': body.llm_model})}\n\n"

        # Keepalive task — sends a comment every 15s to prevent proxy/platform timeouts
        async def keepalive(queue: asyncio.Queue):
            while True:
                await asyncio.sleep(15)
                await queue.put(": keepalive\n\n")

        ka_queue: asyncio.Queue = asyncio.Queue()
        ka_task = asyncio.create_task(keepalive(ka_queue))

        async for result in analyze_files(client=client, session=session, files=files, frameworks=body.frameworks):
            # Flush any keepalive pings before each result
            while not ka_queue.empty():
                yield ka_queue.get_nowait()
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
            elif result["event"] == "rate_limit":
                payload = json.dumps({
                    "event": "rate_limit",
                    "wait": result["wait"],
                    "file": result.get("file", ""),
                    "attempt": result.get("attempt", 1),
                })
                yield f"data: {payload}\n\n"
            elif result["event"] == "rate_limit_clear":
                yield f"data: {json.dumps({'event': 'rate_limit_clear'})}\n\n"
            elif result["event"] == "scope_info":
                payload = json.dumps({
                    "event": "scope_info",
                    "html_css_included": result["html_css_included"],
                    "message": result["message"],
                })
                yield f"data: {payload}\n\n"
            elif result["event"] == "error":
                payload = json.dumps({"event": "error", "file": result["file"], "message": result["message"]})
                yield f"data: {payload}\n\n"

        ka_task.cancel()
        session.changes = changes_acc
        yield f"data: {json.dumps({'event': 'complete', 'total_changes': len(changes_acc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
