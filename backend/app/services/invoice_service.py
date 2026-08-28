from typing import List, Optional
from fastapi import HTTPException
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload, selectinload
from datetime import datetime
from decimal import Decimal
from app.models.invoice import Invoice
from app.models.tenant import Tenant
from app.models.user import User
from app.models.transaction import Transaction
from app.schemas.invoice import InvoiceCreate, InvoiceUpdate, AddPayment
from app.config import settings

class InvoiceService:
    @staticmethod
    def _apply_ownership_scope(query, current_user: User):
        if current_user.user_type == "M":
            query = query.join(Tenant).where(Tenant.manager_id == current_user.id)
        elif current_user.user_type == "A":
            query = query.join(Tenant).where(Tenant.parent_id == current_user.id)
        return query

    @staticmethod
    async def get_invoices(db: AsyncSession, current_user: User) -> List[Invoice]:
        query = select(Invoice).options(selectinload(Invoice.tenant))
        query = InvoiceService._apply_ownership_scope(query, current_user)
        query = query.order_by(Invoice.month.desc())
        result = await db.execute(query)
        invoices = result.scalars().all()
        await InvoiceService.populate_wallet_balances(db, invoices)
        return invoices

    @staticmethod
    async def get_invoice(db: AsyncSession, invoice_id: int, current_user: User) -> Optional[Invoice]:
        query = select(Invoice).where(Invoice.id == invoice_id).options(
            selectinload(Invoice.tenant).selectinload(Tenant.owner)
        )
        query = InvoiceService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        invoice = result.scalar_one_or_none()
        if invoice:
            await InvoiceService.populate_wallet_balances(db, [invoice])
        return invoice

    @staticmethod
    async def _get_chained_previous_reading(db: AsyncSession, parent_id: int, room_no: str, month: str, exclude_invoice_id: Optional[int] = None) -> int:
        """The previous reading for a room's invoice is always the current reading of that
        room's most recent invoice before this month (0 if this is the room's first invoice)."""
        if not room_no:
            return 0
        query = select(Invoice.current_reading).join(Tenant, Invoice.tenant_id == Tenant.id).where(
            Invoice.room_no == room_no,
            Tenant.parent_id == parent_id,
            Invoice.month < month
        )
        if exclude_invoice_id is not None:
            query = query.where(Invoice.id != exclude_invoice_id)
        query = query.order_by(Invoice.month.desc()).limit(1)
        result = await db.execute(query)
        val = result.scalar_one_or_none()
        return val if val is not None else 0

    @staticmethod
    async def _rechain_room_invoices(db: AsyncSession, parent_id: int, room_no: str) -> None:
        """Recompute previous_reading/electricity_units/electricity_charge/total_amount/status for
        every invoice of a room, in month order, so each invoice's previous reading always equals
        the prior month's current reading. Needed after any create/edit/delete that could shift the chain."""
        if not room_no:
            return
        query = select(Invoice).join(Tenant, Invoice.tenant_id == Tenant.id).where(
            Invoice.room_no == room_no,
            Tenant.parent_id == parent_id
        ).order_by(Invoice.month.asc())
        result = await db.execute(query)
        invoices = result.scalars().all()

        prev_reading = 0
        for inv in invoices:
            inv.previous_reading = prev_reading
            units = max(0, inv.current_reading - prev_reading)
            inv.electricity_units = units
            inv.electricity_charge = Decimal(units) * Decimal(str(settings.ELECTRIC_RATE))
            inv.total_amount = inv.rent_amount + inv.electricity_charge + inv.water_charge + inv.wifi_charge - inv.advance_applied
            inv.status = "paid" if inv.total_amount <= (inv.received_amount + Decimal(str(inv.wallet_adjustment or 0.0))) else "unpaid"
            prev_reading = inv.current_reading

        await db.commit()

    @staticmethod
    async def create_invoice(db: AsyncSession, invoice_data: InvoiceCreate, current_user: User) -> Invoice:
        tenant_query = select(Tenant).where(Tenant.id == invoice_data.tenant_id)
        if current_user.user_type == "M":
            tenant_query = tenant_query.where(Tenant.manager_id == current_user.id)
        elif current_user.user_type == "A":
            tenant_query = tenant_query.where(Tenant.parent_id == current_user.id)

        tenant = (await db.execute(tenant_query)).scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found or access denied")

        from app.models.room import Room
        room_res = await db.execute(select(Room).where(Room.room_no == tenant.room_no, Room.parent_id == tenant.parent_id))
        room = room_res.scalar_one_or_none()

        water_charge = Decimal(str(invoice_data.water_charge))
        received_amount = Decimal(str(invoice_data.received_amount))

        rent_amount = tenant.rent_amount
        advance_applied = Decimal("0.00")

        if invoice_data.is_closer:
            if tenant.is_advanced or tenant.advance_amount > 0:
                advance_applied = Decimal(str(tenant.advance_amount)) if tenant.advance_amount > 0 else Decimal(str(tenant.rent_amount))

        wifi_charge = Decimal("0.00")
        if tenant.has_wifi:
            wifi_charge = Decimal(str(tenant.wifi_rate))

        # previous_reading/electricity_units/electricity_charge/total_amount/status are placeholders here;
        # _rechain_room_invoices below derives them from the chained meter readings and is authoritative.
        new_invoice = Invoice(
            tenant_id=tenant.id,
            room_id=room.id if room else None,
            room_no=tenant.room_no,
            month=invoice_data.month,
            electricity_units=0,
            previous_reading=0,
            current_reading=invoice_data.current_reading,
            electricity_charge=Decimal("0.00"),
            water_charge=water_charge,
            wifi_charge=wifi_charge,
            rent_amount=rent_amount,
            total_amount=rent_amount + water_charge + wifi_charge - advance_applied,
            received_amount=received_amount,
            is_excluded=invoice_data.is_excluded,
            is_closer=invoice_data.is_closer,
            advance_applied=advance_applied,
            status="unpaid"
        )

        db.add(new_invoice)
        await db.commit()

        await InvoiceService._rechain_room_invoices(db, tenant.parent_id, tenant.room_no)
        await db.refresh(new_invoice)

        # Apply wallet adjustment if requested during creation
        wallet_adj = Decimal(str(getattr(invoice_data, "wallet_adjustment", 0.0)))
        if wallet_adj > 0:
            if not tenant.has_wallet:
                raise HTTPException(status_code=400, detail="Tenant does not have a digital wallet enabled")
            
            # Lock tenant for update
            tenant_lock_query = select(Tenant).where(Tenant.id == tenant.id).with_for_update()
            tenant_locked = (await db.execute(tenant_lock_query)).scalar_one()
            
            if tenant_locked.wallet_balance < wallet_adj:
                raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Available: {tenant_locked.wallet_balance}")
                
            if wallet_adj > new_invoice.total_amount:
                raise HTTPException(status_code=400, detail=f"Wallet adjustment cannot exceed invoice total amount ({new_invoice.total_amount})")
                
            tenant_locked.wallet_balance -= wallet_adj
            new_invoice.wallet_adjustment = wallet_adj
            new_invoice.status = "paid" if new_invoice.total_amount <= (new_invoice.received_amount + Decimal(str(new_invoice.wallet_adjustment or 0.0))) else "unpaid"
            
            from app.models.wallet_transaction import WalletTransaction
            db.add(WalletTransaction(
                tenant_id=tenant.id,
                invoice_id=new_invoice.id,
                amount=wallet_adj,
                transaction_type="debit",
                reason=f"Adjustment for Invoice {new_invoice.month}",
                performed_by=current_user.id,
                running_balance=tenant_locked.wallet_balance
            ))
            await db.commit()
            await db.refresh(new_invoice)

        if new_invoice.is_closer and new_invoice.status == "paid":
            tenant.status = "close"
            if room:
                room.status = "vacant"  # Set room to vacant
            await db.commit()

        if invoice_data.received_amount > 0:
            tx = Transaction(
                tenant_id=tenant.id,
                invoice_id=new_invoice.id,
                amount=Decimal(str(invoice_data.received_amount)),
                payment_mode="Cash" # default mode for initial
            )
            db.add(tx)
            await db.commit()

        await db.refresh(new_invoice)
        await InvoiceService.populate_wallet_balances(db, [new_invoice])
        await new_invoice.awaitable_attrs.tenant
        return new_invoice

    @staticmethod
    async def update_invoice(db: AsyncSession, invoice_id: int, invoice_data: InvoiceUpdate, current_user: User) -> Invoice:
        invoice = await InvoiceService.get_invoice(db, invoice_id, current_user)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

        tenant_query = select(Tenant).where(Tenant.id == invoice_data.tenant_id)
        if current_user.user_type == "M":
            tenant_query = tenant_query.where(Tenant.manager_id == current_user.id)
        elif current_user.user_type == "A":
            tenant_query = tenant_query.where(Tenant.parent_id == current_user.id)
        tenant = (await db.execute(tenant_query)).scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found or access denied")

        old_parent_id = invoice.tenant.parent_id if invoice.tenant else tenant.parent_id
        old_room_no = invoice.room_no

        from app.models.room import Room
        room_res = await db.execute(select(Room).where(Room.room_no == tenant.room_no, Room.parent_id == tenant.parent_id))
        room = room_res.scalar_one_or_none()

        invoice.tenant_id = invoice_data.tenant_id
        invoice.room_id = room.id if room else None
        invoice.room_no = tenant.room_no
        invoice.rent_amount = tenant.rent_amount
        invoice.month = invoice_data.month
        invoice.current_reading = invoice_data.current_reading
        invoice.is_excluded = invoice_data.is_excluded
        invoice.received_amount = Decimal(str(invoice_data.received_amount))
        invoice.water_charge = Decimal(str(invoice_data.water_charge))

        # Preserve or update wifi_charge.
        if invoice.tenant_id != tenant.id:
            invoice.wifi_charge = Decimal(str(tenant.wifi_rate)) if tenant.has_wifi else Decimal("0.00")

        advance_applied = Decimal("0.00")
        if invoice_data.is_closer:
            if tenant.is_advanced or tenant.advance_amount > 0:
                advance_applied = Decimal(str(tenant.advance_amount)) if tenant.advance_amount > 0 else Decimal(str(tenant.rent_amount))

        invoice.is_closer = invoice_data.is_closer
        invoice.advance_applied = advance_applied

        await db.commit()

        # Rechain the (possibly new) room, and the old room too if the tenant/room changed,
        # so previous_reading/electricity_units/total_amount stay consistent everywhere.
        if old_room_no and (old_room_no != tenant.room_no or old_parent_id != tenant.parent_id):
            await InvoiceService._rechain_room_invoices(db, old_parent_id, old_room_no)
        await InvoiceService._rechain_room_invoices(db, tenant.parent_id, tenant.room_no)

        if invoice.is_closer and invoice.status == "paid":
            tenant.status = "close"
            if room:
                room.status = "vacant"  # Set room to vacant
            await db.commit()

        await db.refresh(invoice)
        await InvoiceService.populate_wallet_balances(db, [invoice])
        await invoice.awaitable_attrs.tenant
        return invoice

    @staticmethod
    async def delete_invoice(db: AsyncSession, invoice_id: int, current_user: User):
        invoice = await InvoiceService.get_invoice(db, invoice_id, current_user)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

        parent_id = invoice.tenant.parent_id if invoice.tenant else None
        room_no = invoice.room_no

        await db.delete(invoice)
        await db.commit()

        if parent_id and room_no:
            await InvoiceService._rechain_room_invoices(db, parent_id, room_no)

        return True

    @staticmethod
    async def add_payment(db: AsyncSession, invoice_id: int, payment_data: AddPayment, current_user: User) -> Invoice:
        invoice = await InvoiceService.get_invoice(db, invoice_id, current_user)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

        payment_amount_dec = Decimal(str(payment_data.amount))
        if payment_amount_dec <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

        due_amount = invoice.total_amount - invoice.received_amount - Decimal(str(invoice.wallet_adjustment or 0.0))
        if payment_amount_dec > due_amount:
            raise HTTPException(status_code=400, detail=f"Payment amount exceeds due amount. Max allowed: {due_amount}")

        invoice.received_amount += payment_amount_dec
        invoice.status = "paid" if invoice.total_amount <= (invoice.received_amount + Decimal(str(invoice.wallet_adjustment or 0.0))) else "unpaid"

        if invoice.is_closer and invoice.status == "paid":
            tenant = await invoice.awaitable_attrs.tenant
            tenant.status = "close"
            # Set room to vacant
            from app.models.room import Room
            room_res = await db.execute(select(Room).where(Room.room_no == tenant.room_no, Room.parent_id == tenant.parent_id))
            room = room_res.scalar_one_or_none()
            if room:
                room.status = "vacant"

        payment_date = datetime.strptime(payment_data.payment_date, "%Y-%m-%d").date() if payment_data.payment_date else None

        tx = Transaction(
            tenant_id=invoice.tenant_id,
            invoice_id=invoice.id,
            amount=payment_amount_dec,
            payment_mode=payment_data.payment_mode,
            payment_date=payment_date
        )
        db.add(tx)
        
        await db.commit()
        await db.refresh(invoice)
        await InvoiceService.populate_wallet_balances(db, [invoice])
        await invoice.awaitable_attrs.tenant
        return invoice

    @staticmethod
    async def get_last_units(db: AsyncSession, room_no: str, month: str, current_user: User, exclude_invoice_id: Optional[int] = None) -> int:
        owner_id = current_user.parent_id if current_user.user_type == "M" else current_user.id
        query = select(Invoice.current_reading).join(Tenant).where(Invoice.room_no == room_no)
        if current_user.user_type != "SA":
            query = query.where(Tenant.parent_id == owner_id)

        query = query.where(Invoice.month < month)
        if exclude_invoice_id is not None:
            query = query.where(Invoice.id != exclude_invoice_id)
        query = query.order_by(Invoice.month.desc()).limit(1)
        result = await db.execute(query)
        val = result.scalar_one_or_none()
        return val if val else 0

    @staticmethod
    async def get_due_invoices(db: AsyncSession, tenant_id: int, current_user: User) -> List[Invoice]:
        query = select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.status == "unpaid", Invoice.is_excluded == False).options(selectinload(Invoice.tenant))
        query = InvoiceService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def populate_wallet_balances(db: AsyncSession, invoices: List[Invoice]) -> None:
        if not invoices:
            return
        invoice_ids = [inv.id for inv in invoices if Decimal(str(inv.wallet_adjustment or 0.0)) > 0]
        if not invoice_ids:
            for inv in invoices:
                inv.wallet_balance_before = None
                inv.wallet_balance_after = None
            return
            
        from app.models.wallet_transaction import WalletTransaction
        query = select(WalletTransaction).where(
            WalletTransaction.invoice_id.in_(invoice_ids),
            WalletTransaction.transaction_type == 'debit'
        ).order_by(WalletTransaction.created_at.asc())
        result = await db.execute(query)
        txs = result.scalars().all()
        
        from collections import defaultdict
        txs_by_invoice = defaultdict(list)
        for tx in txs:
            txs_by_invoice[tx.invoice_id].append(tx)
            
        for inv in invoices:
            inv_txs = txs_by_invoice.get(inv.id, [])
            if inv_txs:
                inv.wallet_balance_before = float(inv_txs[0].running_balance + inv_txs[0].amount)
                inv.wallet_balance_after = float(inv_txs[-1].running_balance)
            else:
                inv.wallet_balance_before = None
                inv.wallet_balance_after = None

    @staticmethod
    async def adjust_invoice_wallet(db: AsyncSession, invoice_id: int, adjust_amount: Decimal, current_user: User) -> Invoice:
        invoice = await InvoiceService.get_invoice(db, invoice_id, current_user)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        tenant = invoice.tenant
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant associated with invoice not found")
            
        if not tenant.has_wallet:
            raise HTTPException(status_code=400, detail="Digital Wallet is not enabled for this tenant")
            
        tenant_lock_query = select(Tenant).where(Tenant.id == tenant.id).with_for_update()
        tenant_locked = (await db.execute(tenant_lock_query)).scalar_one()
        
        if tenant_locked.wallet_balance < adjust_amount:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient wallet balance. Available: {tenant_locked.wallet_balance}, Requested: {adjust_amount}"
            )
            
        remaining_due = invoice.total_amount - invoice.received_amount - Decimal(str(invoice.wallet_adjustment or 0.0))
        if adjust_amount > remaining_due:
            raise HTTPException(
                status_code=400, 
                detail=f"Adjustment amount exceeds remaining due amount of {remaining_due}"
            )
            
        if adjust_amount <= 0:
            raise HTTPException(
                status_code=400, 
                detail="Adjustment amount must be greater than zero"
            )
            
        tenant_locked.wallet_balance -= adjust_amount
        invoice.wallet_adjustment = Decimal(str(invoice.wallet_adjustment or 0.0)) + adjust_amount
        invoice.status = "paid" if invoice.total_amount <= (invoice.received_amount + Decimal(str(invoice.wallet_adjustment or 0.0))) else "unpaid"
        
        from app.models.wallet_transaction import WalletTransaction
        wallet_tx = WalletTransaction(
            tenant_id=tenant.id,
            invoice_id=invoice.id,
            amount=adjust_amount,
            transaction_type="debit",
            reason=f"Adjustment for Invoice {invoice.month}",
            performed_by=current_user.id,
            running_balance=tenant_locked.wallet_balance
        )
        db.add(wallet_tx)
        
        if invoice.is_closer and invoice.status == "paid":
            tenant_locked.status = "close"
            from app.models.room import Room
            room_res = await db.execute(select(Room).where(Room.room_no == tenant_locked.room_no, Room.parent_id == tenant_locked.parent_id))
            room = room_res.scalar_one_or_none()
            if room:
                room.status = "vacant"
                
        await db.commit()
        await db.refresh(invoice)
        await InvoiceService.populate_wallet_balances(db, [invoice])
        return invoice

