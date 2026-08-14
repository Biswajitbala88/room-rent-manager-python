import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.sync_log import SyncLog
from app.services.sync_service import run_sync, SyncError

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _ensure_sync_allowed(current_user: User) -> None:
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=403, detail="Data sync is only available in the local/development environment")
    if current_user.user_type != "SA":
        raise HTTPException(status_code=403, detail="Only a Super Admin can run a data sync")


@router.post("/run")
async def trigger_sync(current_user: User = Depends(get_current_user)):
    _ensure_sync_allowed(current_user)
    try:
        return await run_sync(current_user.id)
    except SyncError as exc:
        raise HTTPException(status_code=500, detail=f"Sync failed: {exc}")


@router.get("/history")
async def sync_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_sync_allowed(current_user)
    result = await db.execute(select(SyncLog).order_by(SyncLog.started_at.desc()).limit(10))
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "status": log.status,
            "summary": json.loads(log.summary) if log.summary else None,
            "error_message": log.error_message,
            "started_at": log.started_at,
            "finished_at": log.finished_at,
        }
        for log in logs
    ]
