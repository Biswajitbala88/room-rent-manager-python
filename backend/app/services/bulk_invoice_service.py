from typing import List, Optional
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.room import Room
from app.models.tenant import Tenant
from app.models.invoice import Invoice
from app.models.bulk_invoice import BulkInvoiceOperation, BulkInvoiceOperationItem
from app.schemas.invoice import InvoiceCreate
from app.schemas.bulk_invoice import BulkInvoiceRoomInput
from app.services.invoice_service import InvoiceService


class BulkInvoiceService:
    """Orchestrates creating one invoice per room via the existing InvoiceService —
    it never recalculates billing/meter-reading logic itself."""

    @staticmethod
    def _owner_id(current_user: User) -> int:
        return current_user.parent_id if current_user.user_type == "M" else current_user.id

    @staticmethod
    def _apply_ownership_scope(query, current_user: User):
        if current_user.user_type != "SA":
            query = query.where(BulkInvoiceOperation.requested_by == current_user.id)
        return query

    @staticmethod
    async def create_operation(
        db: AsyncSession, current_user: User, month: str, rooms: List[BulkInvoiceRoomInput]
    ) -> BulkInvoiceOperation:
        if not month:
            raise HTTPException(status_code=400, detail="Invoice month is required")
        if not rooms:
            raise HTTPException(status_code=400, detail="At least one room must be selected")

        # De-duplicate in case the same room was submitted twice in one request.
        reading_by_room_id = {}
        for r in rooms:
            reading_by_room_id[r.room_id] = r.current_reading
        room_ids = list(reading_by_room_id.keys())

        room_query = select(Room).where(Room.id.in_(room_ids))
        if current_user.user_type != "SA":
            room_query = room_query.where(Room.parent_id == BulkInvoiceService._owner_id(current_user))
        result = await db.execute(room_query)
        found_rooms = {r.id: r for r in result.scalars().all()}

        operation = BulkInvoiceOperation(
            status="pending",
            month=month,
            requested_by=current_user.id,
            total_count=len(room_ids),
        )
        db.add(operation)
        await db.flush()

        skipped = 0
        failed = 0
        for room_id in room_ids:
            reading = reading_by_room_id[room_id]
            room = found_rooms.get(room_id)

            if not room:
                db.add(BulkInvoiceOperationItem(
                    operation_id=operation.id, room_id=room_id, current_reading=reading,
                    status="failed", error_message="Room not found or access denied",
                ))
                failed += 1
                continue

            tenant_result = await db.execute(select(Tenant).where(
                Tenant.room_no == room.room_no,
                Tenant.parent_id == room.parent_id,
                Tenant.status == "active",
            ))
            tenant = tenant_result.scalar_one_or_none()

            if not tenant:
                db.add(BulkInvoiceOperationItem(
                    operation_id=operation.id, room_id=room.id, room_no=room.room_no, current_reading=reading,
                    status="failed", error_message="No active tenant assigned to this room",
                ))
                failed += 1
                continue

            # Uniqueness is per tenant+month (DB-enforced), not room+month — a room can
            # legitimately get two invoices in one month across a tenant changeover.
            existing = await db.execute(select(Invoice.id).where(Invoice.tenant_id == tenant.id, Invoice.month == month))
            if existing.scalar_one_or_none():
                db.add(BulkInvoiceOperationItem(
                    operation_id=operation.id, room_id=room.id, room_no=room.room_no, tenant_id=tenant.id,
                    current_reading=reading, status="skipped_duplicate",
                    error_message=f"An invoice already exists for Room {room.room_no} in {month}",
                ))
                skipped += 1
                continue

            db.add(BulkInvoiceOperationItem(
                operation_id=operation.id, room_id=room.id, room_no=room.room_no, tenant_id=tenant.id,
                current_reading=reading, status="pending",
            ))

        operation.skipped_count = skipped
        operation.failed_count = failed
        await db.commit()

        return await BulkInvoiceService.get_operation(db, operation.id, current_user)

    @staticmethod
    async def get_operation(db: AsyncSession, operation_id: int, current_user: User) -> Optional[BulkInvoiceOperation]:
        query = select(BulkInvoiceOperation).where(BulkInvoiceOperation.id == operation_id).options(
            selectinload(BulkInvoiceOperation.items)
        )
        query = BulkInvoiceService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_operations(db: AsyncSession, current_user: User) -> List[BulkInvoiceOperation]:
        query = select(BulkInvoiceOperation).options(selectinload(BulkInvoiceOperation.items))
        query = BulkInvoiceService._apply_ownership_scope(query, current_user)
        query = query.order_by(BulkInvoiceOperation.created_at.desc()).limit(10)
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def _process_item(item_id: int, month: str, current_user_id: int) -> str:
        """Process exactly one room's invoice in its own DB session, and return its
        final status. Giving each item its own session (rather than sharing one across
        the whole batch) means a hard failure in one room's create_invoice call — even
        something as low-level as a driver/transaction error — can never leave the
        session in a state that corrupts processing of the *other* rooms."""
        async with AsyncSessionLocal() as db:
            item = await db.get(BulkInvoiceOperationItem, item_id)
            current_user = await db.get(User, current_user_id)
            try:
                previous_reading = await InvoiceService.get_last_units(db, item.room_no, month, current_user)
                if item.current_reading < previous_reading:
                    raise ValueError(
                        f"Current reading ({item.current_reading}) cannot be lower than "
                        f"the previous reading ({previous_reading})"
                    )

                tenant = await db.get(Tenant, item.tenant_id)
                if not tenant:
                    raise ValueError("Tenant no longer exists")
                water_charge = float(tenant.water_charge) if tenant.is_water_charge else 0.0

                invoice_data = InvoiceCreate(
                    tenant_id=item.tenant_id,
                    month=month,
                    current_reading=item.current_reading,
                    water_charge=water_charge,
                    received_amount=0,
                    is_excluded=False,
                    is_closer=False,
                )
                # Reuses the exact same billing/chaining logic as the single-invoice flow.
                invoice = await InvoiceService.create_invoice(db, invoice_data, current_user)

                item.status = "completed"
                item.invoice_id = invoice.id
                await db.commit()
                return "completed"
            except IntegrityError:
                await db.rollback()
                item = await db.get(BulkInvoiceOperationItem, item_id)
                item.status = "skipped_duplicate"
                item.error_message = "An invoice for this tenant and month was created concurrently"
                await db.commit()
                return "skipped_duplicate"
            except Exception as exc:
                await db.rollback()
                item = await db.get(BulkInvoiceOperationItem, item_id)
                item.status = "failed"
                item.error_message = str(exc)[:2000]
                await db.commit()
                return "failed"

    @staticmethod
    async def process_operation(operation_id: int, current_user_id: int) -> None:
        """The 'background job'. Runs after the HTTP response is sent (FastAPI
        BackgroundTasks) — mirrors the async-work-with-a-DB-log pattern already
        used by sync_service.py."""
        async with AsyncSessionLocal() as db:
            operation = await db.get(BulkInvoiceOperation, operation_id)
            if not operation:
                return
            month = operation.month

            current_user = await db.get(User, current_user_id)
            if not current_user:
                operation.status = "failed"
                operation.finished_at = datetime.now(timezone.utc)
                await db.commit()
                return

            operation.status = "processing"
            await db.commit()

            result = await db.execute(select(BulkInvoiceOperationItem.id).where(
                BulkInvoiceOperationItem.operation_id == operation_id,
                BulkInvoiceOperationItem.status == "pending",
            ))
            item_ids = list(result.scalars().all())

        # Each item is fully independent — one room's failure never stops the rest.
        outcomes = {"completed": 0, "failed": 0, "skipped_duplicate": 0}
        for item_id in item_ids:
            outcome = await BulkInvoiceService._process_item(item_id, month, current_user_id)
            outcomes[outcome] = outcomes.get(outcome, 0) + 1

        async with AsyncSessionLocal() as db:
            operation = await db.get(BulkInvoiceOperation, operation_id)
            operation.completed_count += outcomes["completed"]
            operation.failed_count += outcomes["failed"]
            operation.skipped_count += outcomes["skipped_duplicate"]

            if operation.completed_count == 0 and operation.total_count > 0:
                operation.status = "failed"
            elif operation.failed_count == 0 and operation.skipped_count == 0:
                operation.status = "completed"
            else:
                operation.status = "partially_completed"
            operation.finished_at = datetime.now(timezone.utc)
            await db.commit()
