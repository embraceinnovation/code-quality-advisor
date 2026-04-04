import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import oauth, repos, scan, changes, git_ops, report

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Periodic session purge every hour
    async def _purge_loop():
        from app.session_store import purge_expired
        while True:
            await asyncio.sleep(3600)
            n = purge_expired()
            if n:
                logger.info(f"Purged {n} expired session(s)")

    task = asyncio.create_task(_purge_loop())
    yield
    task.cancel()


app = FastAPI(
    title="Code Quality Advisor",
    description="AI-powered code quality analysis and improvement tool",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(oauth.router)
app.include_router(repos.router)
app.include_router(scan.router)
app.include_router(changes.router)
app.include_router(git_ops.router)
app.include_router(report.router)

# Serve built React app — must be mounted last as catch-all
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
