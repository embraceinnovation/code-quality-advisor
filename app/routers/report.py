import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.dependencies import get_current_session
from app.session_store import SessionData
from app.services.claude_analyzer import generate_report
from app.services.pdf_renderer import render_pdf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/report", tags=["report"])


@router.post("/generate")
async def generate_report_endpoint(session: SessionData = Depends(get_current_session)):
    if not session.changes:
        raise HTTPException(400, "No analysis results to generate report from")
    if not session.llm_api_key:
        raise HTTPException(400, "No AI model API key found in session — please restart from Step 3")
    try:
        markdown = await generate_report(session)
    except Exception as e:
        logger.exception("Report generation failed")
        raise HTTPException(500, f"Report generation failed: {str(e)}")
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


@router.get("/download-pdf")
async def download_report_pdf(session: SessionData = Depends(get_current_session)):
    if not session.report_markdown:
        raise HTTPException(400, "Report not generated yet")
    filename = f"cqa-report-{session.repo or 'project'}.pdf"
    try:
        pdf_bytes = render_pdf(session.report_markdown, title=f"Code Quality Report — {session.repo or 'project'}")
    except Exception as e:
        logger.exception("PDF rendering failed")
        raise HTTPException(500, f"PDF rendering failed: {str(e)}")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
