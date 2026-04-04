# Vercel serverless entry point
# Mangum wraps FastAPI (ASGI) for Lambda-compatible runtimes.
# lifespan="off" because serverless functions don't support startup/shutdown events.
from mangum import Mangum
from app.main import app

handler = Mangum(app, lifespan="off")
