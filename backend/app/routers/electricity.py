from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from app.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.models.invoice import Invoice
from app.dependencies import get_current_user
from app.schemas.electricity import ElectricityReportResponse

router = APIRouter(prefix="/api/electricity", tags=["electricity"])

@router.get("/", response_model=ElectricityReportResponse)
async def get_electricity_report(
    month: Optional[str] = None,
    tenant_id: Optional[int] = None,
    room_no: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Invoice).join(Tenant).options(joinedload(Invoice.tenant))
    if current_user.user_type != "SA":
        owner_id = current_user.parent_id if current_user.user_type == "M" else current_user.id
        query = query.where(Tenant.parent_id == owner_id)

    if month:
        query = query.where(Invoice.month == month)
    if tenant_id:
        query = query.where(Invoice.tenant_id == tenant_id)
    if room_no:
        query = query.where(Invoice.room_no.ilike(f"%{room_no}%"))

    query = query.where(Invoice.is_excluded == False)

    # Aggregates
    agg_query = select(
        func.sum(Invoice.electricity_units).label("total_units"),
        func.sum(Invoice.electricity_charge).label("total_cost"),
        func.count(Invoice.id).label("total_items")
    ).select_from(query.subquery())
    
    agg_res = await db.execute(agg_query)
    agg_row = agg_res.one_or_none()
    
    total_units = agg_row.total_units or 0 if agg_row else 0
    total_cost = agg_row.total_cost or 0.0 if agg_row else 0.0
    total_items = agg_row.total_items or 0 if agg_row else 0

    # Paginate
    offset = (page - 1) * limit
    paginated_query = query.order_by(Invoice.month.desc(), Invoice.id.desc()).offset(offset).limit(limit)
    
    items_res = await db.execute(paginated_query)
    items = items_res.scalars().all()

    return ElectricityReportResponse(
        items=items,
        total_units=int(total_units),
        total_cost=float(total_cost),
        total_items=total_items,
        page=page,
        limit=limit
    )
