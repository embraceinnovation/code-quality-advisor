import asyncio
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.dependencies import get_current_session
from app.session_store import SessionData
from app.services.claude_analyzer import _call_llm
from app.services import github_client, gitlab_client, bitbucket_client

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


_VALIDATE_SYSTEM_PROMPT = """You are a senior software engineer reviewing a proposed code fix.
Given the original file content and a specific fix (issue + recommendation + line number), assess whether the fix is correct and safe.

Respond ONLY with valid JSON in this exact format:
{"verdict": "safe"|"risky"|"reject", "reason": "<max 200 chars explaining your verdict>"}

Verdict guide:
  safe   = fix is correct, addresses the issue, no side effects
  risky  = fix may be correct but could have unintended consequences, needs human review
  reject = fix is wrong, incomplete, would break code, or makes things worse"""


def _provider_client(session: SessionData):
    if session.provider == "github":
        return github_client
    if session.provider == "gitlab":
        return gitlab_client
    return bitbucket_client


@router.post("/validate-fixes")
async def validate_fixes(
    body: SelectionRequest,
    session: SessionData = Depends(get_current_session),
):
    selected = [c for c in session.changes if c["id"] in body.change_ids]
    by_file: dict[str, list] = {}
    for c in selected:
        by_file.setdefault(c["file_path"], []).append(c)

    async def stream():
        yield f"data: {json.dumps({'event': 'start', 'total': len(selected)})}\n\n"

        semaphore = asyncio.Semaphore(2)

        async def validate_one(change: dict, file_content: str) -> dict:
            async with semaphore:
                user_msg = (
                    f"File: {change['file_path']}\n"
                    f"Line: {change.get('line_number', '?')}\n"
                    f"Issue: {change['issue']}\n"
                    f"Recommendation: {change['recommendation']}\n\n"
                    f"File content:\n```\n{file_content[:8000]}\n```"
                )
                try:
                    raw = await _call_llm(
                        session.llm_provider, session.llm_model,
                        session.llm_api_key, _VALIDATE_SYSTEM_PROMPT,
                        user_msg, 256,
                    )
                    result = json.loads(raw.strip())
                    verdict = result.get("verdict", "risky")
                    reason = result.get("reason", "")
                except Exception as e:
                    verdict = "risky"
                    reason = f"Could not validate: {str(e)[:100]}"
                return {
                    "event": "result",
                    "id": change["id"],
                    "verdict": verdict,
                    "reason": reason,
                }

        client = _provider_client(session)
        file_cache: dict[str, str] = {}

        for file_path, changes in by_file.items():
            try:
                content = await client.get_file_content(
                    session, session.owner, session.repo, session.branch, file_path
                )
                file_cache[file_path] = content or ""
            except Exception:
                file_cache[file_path] = ""

        tasks = [
            asyncio.create_task(validate_one(c, file_cache.get(c["file_path"], "")))
            for c in selected
        ]

        for coro in asyncio.as_completed(tasks):
            result = await coro
            yield f"data: {json.dumps(result)}\n\n"

        yield f"data: {json.dumps({'event': 'complete'})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/selection")
async def save_selection(
    body: SelectionRequest,
    session: SessionData = Depends(get_current_session),
):
    session.selected_change_ids = body.change_ids
    return {"saved": len(body.change_ids)}
