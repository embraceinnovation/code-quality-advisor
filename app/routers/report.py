from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.dependencies import get_current_session
from app.session_store import SessionData
from app.services.claude_analyzer import generate_report

router = APIRouter(prefix="/api/report", tags=["report"])


@router.post("/generate")
async def generate_report_endpoint(session: SessionData = Depends(get_current_session)):
    if not session.changes:
        raise HTTPException(400, "No analysis results to generate report from")
    markdown = await generate_report(session)
    session.report_markdown = markdown
    return {"markdown": markdown}


@router.get("/download")
async def download_report(session: SessionData = Depends(get_current_session)):
    if not session.report_markdown:
        raise HTTPException(400, "Report not generated yet")
    filename = f"cqa-report-{session.repo or 'project'}.md"
    return Response(
        content=session.report_markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
