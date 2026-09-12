import os
from dotenv import load_dotenv

load_dotenv()  # pulls GROQ_API_KEY, VISION_SECRET_KEY, etc. from .env

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _resolve_database_uri():
    """Render's Postgres "Internal/External Database URL" is handed to the
    app via the DATABASE_URL env var. Render (and Heroku-style hosts) still
    hand out that URL with the old `postgres://` scheme, but SQLAlchemy 1.4+
    / psycopg2 require `postgresql://` — so rewrite it if needed. Falls back
    to a local sqlite file when DATABASE_URL isn't set (local dev)."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        return "sqlite:///" + os.path.join(BASE_DIR, "vision.db")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    SECRET_KEY = os.environ.get("VISION_SECRET_KEY", "vision-dev-secret-key-change-me")
    SQLALCHEMY_DATABASE_URI = _resolve_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Render's Postgres drops idle connections; recycle/pre-ping so long-lived
    # gunicorn workers don't hand out a dead connection after a period of
    # inactivity (this shows up as "SSL connection has been closed unexpectedly").
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }

    UPLOAD_FOLDER = os.path.join(BASE_DIR, "static", "uploads")
    PROFILE_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, "profile")
    SHOTS_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, "shots")
    VIDEOS_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, "videos")

    ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
    ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "webm"}

    MAX_CONTENT_LENGTH = 64 * 1024 * 1024  # 64 MB max upload