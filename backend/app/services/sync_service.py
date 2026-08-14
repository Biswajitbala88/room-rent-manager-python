import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.database import engine as local_engine, AsyncSessionLocal, Base
from app.models.sync_log import SyncLog
# Imported so Base.metadata.tables is populated for every table this module
# looks up dynamically by name, regardless of what else has already loaded.
from app.models.user import User  # noqa: F401
from app.models.room import Room  # noqa: F401
from app.models.tenant import Tenant  # noqa: F401
from app.models.invoice import Invoice  # noqa: F401
from app.models.transaction import Transaction  # noqa: F401

logger = logging.getLogger("sync")

# Dependency order matters: a table may only be synced after every table it has a
# foreign key into has already been synced. `users` is self-referential
# (parent_id -> users.id) so it gets special two-pass handling in _sync_users.
TABLE_ORDER = ["users", "rooms", "tenants", "invoices", "transactions"]


class SyncError(Exception):
    pass


async def _clear_local_tables(conn) -> None:
    """Empty the local copies before re-inserting from remote. This is what makes
    repeated syncs safe/idempotent: rather than merging row-by-row (which can still
    collide on unique constraints like email when local and remote have diverged,
    e.g. stale local seed data reusing an email under a different id), each sync
    makes the local tables an exact mirror of remote.

    Uses DELETE rather than TRUNCATE: TRUNCATE needs an ACCESS EXCLUSIVE lock, which
    would block on (and deadlock against) any other request whose FastAPI dependency
    session still has an open read transaction on these tables (e.g. the auth
    dependency's own `users` lookup for this very request) for as long as the request
    is in flight. DELETE only takes row-level locks and is MVCC-compatible with
    concurrent readers, so it can't block on itself like that. Deletes go in reverse
    dependency order so no FK is ever violated."""
    for table_name in reversed(TABLE_ORDER):
        await conn.execute(text(f"DELETE FROM {table_name}"))


async def _reset_sequence(conn, table_name: str) -> None:
    await conn.execute(
        text(
            f"SELECT setval(pg_get_serial_sequence(:table, 'id'), "
            f"COALESCE((SELECT MAX(id) FROM {table_name}), 1))"
        ).bindparams(table=table_name)
    )


async def _fetch_remote_rows(remote_conn, table_name: str) -> list[dict]:
    table = Base.metadata.tables[table_name]
    result = await remote_conn.execute(select(table))
    return [dict(row._mapping) for row in result.fetchall()]


async def _upsert_rows(local_conn, table_name: str, rows: list[dict]) -> None:
    if not rows:
        return
    table = Base.metadata.tables[table_name]
    stmt = pg_insert(table).values(rows)
    update_cols = {c.name: stmt.excluded[c.name] for c in table.columns if c.name != "id"}
    stmt = stmt.on_conflict_do_update(index_elements=["id"], set_=update_cols)
    await local_conn.execute(stmt)


async def _sync_users(remote_conn, local_conn) -> int:
    """Two-pass sync: insert every user with parent_id temporarily NULL (so the
    self-referential FK can never fail regardless of row order), then backfill
    the real parent_id values once every row exists."""
    rows = await _fetch_remote_rows(remote_conn, "users")
    if not rows:
        return 0

    table = Base.metadata.tables["users"]
    pass1_rows = [{**row, "parent_id": None} for row in rows]
    stmt = pg_insert(table).values(pass1_rows)
    update_cols = {c.name: stmt.excluded[c.name] for c in table.columns if c.name not in ("id", "parent_id")}
    stmt = stmt.on_conflict_do_update(index_elements=["id"], set_=update_cols)
    await local_conn.execute(stmt)

    for row in rows:
        if row["parent_id"] is not None:
            await local_conn.execute(
                table.update().where(table.c.id == row["id"]).values(parent_id=row["parent_id"])
            )

    await _reset_sequence(local_conn, "users")
    return len(rows)


async def _sync_table(remote_conn, local_conn, table_name: str) -> int:
    rows = await _fetch_remote_rows(remote_conn, table_name)
    await _upsert_rows(local_conn, table_name, rows)
    if rows:
        await _reset_sequence(local_conn, table_name)
    return len(rows)


async def _create_log(triggered_by: Optional[int]) -> int:
    async with AsyncSessionLocal() as session:
        log = SyncLog(status="running", triggered_by=triggered_by)
        session.add(log)
        await session.commit()
        await session.refresh(log)
        return log.id


async def _finalize_log(log_id: int, status: str, summary: Optional[dict] = None, error: Optional[str] = None) -> None:
    async with AsyncSessionLocal() as session:
        log = await session.get(SyncLog, log_id)
        if not log:
            return
        log.status = status
        log.finished_at = datetime.now(timezone.utc)
        if summary is not None:
            log.summary = json.dumps(summary)
        if error is not None:
            log.error_message = error[:4000]
        await session.commit()


async def run_sync(triggered_by_user_id: Optional[int]) -> dict:
    """Copy data remote -> local only. The remote connection is put into a
    READ ONLY transaction so Postgres itself rejects any accidental write,
    and every local write happens in one transaction so a failure rolls back
    cleanly instead of leaving the local DB half-synced."""
    if not settings.REMOTE_DATABASE_URL:
        raise SyncError("REMOTE_DATABASE_URL is not configured")

    log_id = await _create_log(triggered_by_user_id)
    logger.info("sync started (log_id=%s, triggered_by=%s)", log_id, triggered_by_user_id)

    summary: dict = {}
    remote_engine = create_async_engine(settings.REMOTE_DATABASE_URL, echo=False)
    try:
        async with remote_engine.connect() as remote_conn:
            async with remote_conn.begin():
                await remote_conn.execute(text("SET TRANSACTION READ ONLY"))

                async with local_engine.begin() as local_conn:
                    await _clear_local_tables(local_conn)
                    summary["users"] = await _sync_users(remote_conn, local_conn)
                    for table_name in TABLE_ORDER[1:]:
                        summary[table_name] = await _sync_table(remote_conn, local_conn, table_name)

        logger.info("sync completed (log_id=%s): %s", log_id, summary)
        await _finalize_log(log_id, "success", summary=summary)
        return {"status": "success", "summary": summary}
    except Exception as exc:
        logger.exception("sync failed (log_id=%s)", log_id)
        await _finalize_log(log_id, "failed", summary=summary, error=str(exc))
        raise SyncError(str(exc)) from exc
    finally:
        await remote_engine.dispose()
