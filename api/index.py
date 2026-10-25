import os
import sys
from pathlib import Path

# Add project root and backend directory to sys.path
_ROOT_DIR = Path(__file__).resolve().parent.parent
_BACKEND_DIR = _ROOT_DIR / "backend"
for _p in [str(_ROOT_DIR), str(_BACKEND_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

os.environ["VERCEL"] = "1"

# Export ASGI FastAPI app for Vercel Serverless Functions
from backend.token_server import app  # noqa: F401
