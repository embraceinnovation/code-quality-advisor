# Vercel serverless entry point — imports the FastAPI app
from app.main import app  # noqa: F401 — Vercel picks up `app` from this module
