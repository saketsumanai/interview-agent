"""
Google Cloud Storage (GCS) integration for interview video recording storage.
Uploads candidate video recordings to GCS bucket when configured,
with automatic local filesystem fallback for development or offline mode.
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Base storage directories
BASE_DIR = Path(__file__).parent
if os.getenv("VERCEL") or not os.access(BASE_DIR, os.W_OK):
    DATA_DIR = Path("/tmp") / "data"
else:
    DATA_DIR = BASE_DIR / "data"

RECORDINGS_DIR = DATA_DIR / "recordings"
try:
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    RECORDINGS_DIR = Path("/tmp") / "recordings"
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


def get_gcs_client():
    """
    Attempt to initialize Google Cloud Storage client.
    Returns None if credentials or bucket are not configured.
    """
    bucket_name = os.getenv("GCS_BUCKET_NAME")
    if not bucket_name:
        return None, None

    try:
        from google.cloud import storage

        # If GOOGLE_APPLICATION_CREDENTIALS or GCS_CREDENTIALS_JSON is provided
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if creds_path and Path(creds_path).exists():
            client = storage.Client.from_service_account_json(creds_path)
        else:
            # Fallback to default credentials or anonymous if permitted
            client = storage.Client()

        bucket = client.bucket(bucket_name)
        return client, bucket
    except Exception as e:
        logger.warning(f"GCS client initialization failed (falling back to local storage): {e}")
        return None, None


async def save_recording(
    file_bytes: bytes,
    filename: str,
    content_type: str = "video/webm",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Save interview recording to Google Cloud Storage if available,
    and also maintain local media copy for immediate low-latency streaming playback.

    Returns:
        Dict with storage_type, public_url, local_path, and file_size
    """
    metadata = metadata or {}
    safe_filename = Path(filename).name
    local_path = RECORDINGS_DIR / safe_filename

    # 1. Save local file
    try:
        with open(local_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        logger.error(f"Error saving local recording: {e}")
        raise

    file_size_bytes = len(file_bytes)
    file_size_mb = round(file_size_bytes / (1024 * 1024), 2)
    local_url = f"/recordings/{safe_filename}"

    # 2. Attempt GCS upload if configured
    _client, bucket = get_gcs_client()
    gcs_url = None
    storage_type = "local"

    if bucket:
        try:
            blob_name = f"interviews/{safe_filename}"
            blob = bucket.blob(blob_name)
            blob.upload_from_filename(
                str(local_path),
                content_type=content_type,
            )
            # Set metadata if provided
            if metadata:
                blob.metadata = {k: str(v) for k, v in metadata.items()}
                blob.patch()

            # Attempt to make public or generate public URL
            try:
                gcs_url = blob.public_url
            except Exception:
                gcs_url = f"https://storage.googleapis.com/{bucket.name}/{blob_name}"

            storage_type = "gcs"
            logger.info(f"Uploaded interview recording to GCS: {gcs_url} ({file_size_mb} MB)")
        except Exception as e:
            logger.warning(f"GCS upload failed, using local storage fallback: {e}")
            storage_type = "local"

    return {
        "storage_type": storage_type,
        "filename": safe_filename,
        "url": gcs_url if storage_type == "gcs" else local_url,
        "local_url": local_url,
        "size_mb": file_size_mb,
        "size_bytes": file_size_bytes,
    }


def list_recordings() -> list[Dict[str, Any]]:
    """List all locally available interview video recordings."""
    recordings = []
    for f in RECORDINGS_DIR.glob("*.webm"):
        recordings.append({
            "filename": f.name,
            "url": f"/recordings/{f.name}",
            "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
            "created_at": f.stat().st_mtime,
        })
    for f in RECORDINGS_DIR.glob("*.mp4"):
        recordings.append({
            "filename": f.name,
            "url": f"/recordings/{f.name}",
            "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
            "created_at": f.stat().st_mtime,
        })
    return sorted(recordings, key=lambda x: x["created_at"], reverse=True)
