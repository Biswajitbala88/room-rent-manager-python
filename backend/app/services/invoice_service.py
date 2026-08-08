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
        return result.scalars().all()

    @staticmethod
    async def get_invoice(db: AsyncSession, invoice_id: int, current_user: User) -> Optional[Invoice]:
        query = select(Invoice).where(Invoice.id == invoice_id).options(
            selectinload(Invoice.tenant).selectinload(Tenant.owner)
        )
        query = InvoiceService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalar_one_or_none()

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

        electricity_charge = Decimal(str(invoice_data.electricity_units)) * Decimal(str(settings.ELECTRIC_RATE))
        water_charge = Decimal(str(invoice_data.water_charge))
        received_amount = Decimal(str(invoice_data.received_amount))
        total_amount = tenant.rent_amount + electricity_charge + water_charge

        status = "paid" if total_amount <= received_amount else "unpaid"

        new_invoice = Invoice(
            tenant_id=tenant.id,
            room_no=tenant.room_no,
            month=invoice_data.month,
            electricity_units=invoice_data.electricity_units,
            previous_reading=invoice_data.previous_reading,
            current_reading=invoice_data.current_reading,
            electricity_charge=electricity_charge,
            water_charge=water_charge,
            rent_amount=tenant.rent_amount,
            total_amount=total_amount,
            received_amount=received_amount,
            is_excluded=invoice_data.is_excluded,
            status=status
        )

        if invoice_data.is_closer:
            tenant.status = "close"
            # Set room to vacant
            from app.models.room import Room
            room_res = await db.execute(select(Room).where(Room.room_no == tenant.room_no, Room.parent_id == tenant.parent_id))
            room = room_res.scalar_one_or_none()
            if room:
                room.status = "vacant"

            if tenant.is_advanced:
                new_invoice.rent_amount = Decimal("0.00")
                new_invoice.total_amount = electricity_charge + water_charge
                new_invoice.status = "paid" if new_invoice.total_amount <= new_invoice.received_amount else "unpaid"

        db.add(new_invoice)
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

        invoice.tenant_id = invoice_data.tenant_id
        invoice.room_no = tenant.room_no
        invoice.rent_amount = tenant.rent_amount
        invoice.month = invoice_data.month
        invoice.electricity_units = invoice_data.electricity_units
        invoice.previous_reading = invoice_data.previous_reading
        invoice.current_reading = invoice_data.current_reading
        invoice.water_charge = Decimal(str(invoice_data.water_charge))
        invoice.is_excluded = invoice_data.is_excluded
        invoice.received_amount = Decimal(str(invoice_data.received_amount))
        
        invoice.electricity_charge = Decimal(str(invoice.electricity_units)) * Decimal(str(settings.ELECTRIC_RATE))
        invoice.water_charge = Decimal(str(invoice_data.water_charge))
        invoice.total_amount = invoice.rent_amount + invoice.electricity_charge + invoice.water_charge
        invoice.status = "paid" if invoice.total_amount <= Decimal(str(invoice_data.received_amount)) else "unpaid"

        await db.commit()
        await db.refresh(invoice)
        await invoice.awaitable_attrs.tenant
        return invoice

    @staticmethod
    async def delete_invoice(db: AsyncSession, invoice_id: int, current_user: User):
        invoice = await InvoiceService.get_invoice(db, invoice_id, current_user)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        await db.delete(invoice)
        await db.commit()
        return True

    @staticmethod
    async def add_payment(db: AsyncSession, invoice_id: int, payment_data: AddPayment, current_user: User) -> Invoice:
        invoice = await InvoiceService.get_invoice(db, invoice_id, current_user)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

        payment_amount_dec = Decimal(str(payment_data.amount))
        if payment_amount_dec <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

        due_amount = invoice.total_amount - invoice.received_amount
        if payment_amount_dec > due_amount:
            raise HTTPException(status_code=400, detail=f"Payment amount exceeds due amount. Max allowed: {due_amount}")

        invoice.received_amount += payment_amount_dec
        invoice.status = "paid" if invoice.total_amount <= invoice.received_amount else "unpaid"

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
        await invoice.awaitable_attrs.tenant
        return invoice

    @staticmethod
    async def get_last_units(db: AsyncSession, room_no: str, month: str, current_user: User) -> int:
        owner_id = current_user.parent_id if current_user.user_type == "M" else current_user.id
        query = select(Invoice.current_reading).join(Tenant).where(Invoice.room_no == room_no)
        if current_user.user_type != "SA":
            query = query.where(Tenant.parent_id == owner_id)
        
        query = query.where(Invoice.month < month).order_by(Invoice.month.desc()).limit(1)
        result = await db.execute(query)
        val = result.scalar_one_or_none()
        return val if val else 0

    @staticmethod
    async def get_due_invoices(db: AsyncSession, tenant_id: int, current_user: User) -> List[Invoice]:
        query = select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.status == "unpaid", Invoice.is_excluded == False).options(selectinload(Invoice.tenant))
        query = InvoiceService._apply_ownership_scope(query, current_user)
        result = await db.execute(query)
        return result.scalars().all()
