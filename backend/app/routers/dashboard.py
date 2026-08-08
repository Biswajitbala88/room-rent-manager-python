from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.models.invoice import Invoice
from app.dependencies import get_current_user
from app.schemas.dashboard import DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    month: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tenant_query = select(Tenant)
    invoice_query = select(Invoice).where(Invoice.month == month, Invoice.is_excluded == False)
    
    if current_user.user_type != "SA":
        owner_id = current_user.parent_id if current_user.user_type == "M" else current_user.id
        tenant_query = tenant_query.where(Tenant.parent_id == owner_id)
        invoice_query = invoice_query.join(Tenant).where(Tenant.parent_id == owner_id)

    # 1. Tenants stats
    total_sub = tenant_query.subquery()
    total_tenants_res = await db.execute(select(func.count()).select_from(total_sub))
    total_tenants = total_tenants_res.scalar_one() or 0

    active_sub = tenant_query.where(Tenant.status == "active").subquery()
    active_tenants_res = await db.execute(select(func.count()).select_from(active_sub))
    active_tenants = active_tenants_res.scalar_one() or 0

    # 2. Invoice stats for the selected month
    pending_sub = invoice_query.where(Invoice.status == "unpaid").subquery()
    pending_invoices_res = await db.execute(select(func.count()).select_from(pending_sub))
    pending_invoices_count = pending_invoices_res.scalar_one() or 0

    due_sub = invoice_query.where(Invoice.status == "unpaid").subquery()
    due_amount_res = await db.execute(select(func.sum(due_sub.c.total_amount - due_sub.c.received_amount)).select_from(due_sub))
    due_amount = due_amount_res.scalar_one() or 0.0

    received_sub = invoice_query.subquery()
    received_amount_res = await db.execute(select(func.sum(received_sub.c.received_amount)).select_from(received_sub))
    received_amount = received_amount_res.scalar_one() or 0.0

    return DashboardSummary(
        pending_invoices_count=pending_invoices_count,
        due_amount=float(due_amount),
        received_amount=float(received_amount),
        total_tenants=total_tenants,
        active_tenants=active_tenants
    )
