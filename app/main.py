import logging
import os
import shutil
import stat
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers import oauth, repos, scan, changes, git_ops, report

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    clone_dir = settings.git_clone_base_dir
    # Clean up any leftover clone dirs from prior crashes
    def _force_remove(func, path, _exc):
        os.chmod(path, stat.S_IWRITE)
        func(path)
    if os.path.exists(clone_dir):
        shutil.rmtree(clone_dir, onerror=_force_remove)
    os.makedirs(clone_dir, exist_ok=True)
    logger.info(f"Clone workspace ready: {clone_dir}")

    # Periodic session purge every hour
    async def _purge_loop():
        import asyncio
        from app.session_store import purge_expired
        while True:
            await asyncio.sleep(3600)
            n = purge_expired()
            if n:
                logger.info(f"Purged {n} expired session(s)")

    import asyncio
    task = asyncio.create_task(_purge_loop())
    yield
    task.cancel()
    shutil.rmtree(clone_dir, ignore_errors=True)


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
