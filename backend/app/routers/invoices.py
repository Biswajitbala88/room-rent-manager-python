from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.dependencies import get_current_user
from app.schemas.invoice import InvoiceResponse, InvoiceCreate, InvoiceUpdate, AddPayment, WalletAdjustmentRequest
from app.schemas.bulk_invoice import BulkInvoiceCreateRequest, BulkInvoiceOperationResponse
from app.services.invoice_service import InvoiceService
from app.services.bulk_invoice_service import BulkInvoiceService
from app.services.pdf_service import PDFService

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

@router.get("/", response_model=List[InvoiceResponse])
async def list_invoices(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await InvoiceService.get_invoices(db, current_user)

@router.post("/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    invoice_data: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        return await InvoiceService.create_invoice(db, invoice_data, current_user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="An invoice already exists for this tenant and month")

# Bulk routes are declared before /{invoice_id} so "bulk" is never accidentally
# considered for that int-typed path parameter.
@router.post("/bulk", response_model=BulkInvoiceOperationResponse, status_code=status.HTTP_201_CREATED)
async def create_bulk_invoices(
    request: BulkInvoiceCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    operation = await BulkInvoiceService.create_operation(db, current_user, request.month, request.rooms)
    background_tasks.add_task(BulkInvoiceService.process_operation, operation.id, current_user.id)
    return operation

@router.get("/bulk", response_model=List[BulkInvoiceOperationResponse])
async def list_bulk_invoice_operations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await BulkInvoiceService.list_operations(db, current_user)

@router.get("/bulk/{operation_id}", response_model=BulkInvoiceOperationResponse)
async def get_bulk_invoice_operation(
    operation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    operation = await BulkInvoiceService.get_operation(db, operation_id, current_user)
    if not operation:
        raise HTTPException(status_code=404, detail="Bulk operation not found")
    return operation

@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    invoice = await InvoiceService.get_invoice(db, invoice_id, current_user)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice

@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: int,
    invoice_data: InvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        return await InvoiceService.update_invoice(db, invoice_id, invoice_data, current_user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="An invoice already exists for this tenant and month")

@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await InvoiceService.delete_invoice(db, invoice_id, current_user)

@router.post("/{invoice_id}/add-payment", response_model=InvoiceResponse)
async def add_payment(
    invoice_id: int,
    payment_data: AddPayment,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await InvoiceService.add_payment(db, invoice_id, payment_data, current_user)

@router.post("/{invoice_id}/wallet-adjust", response_model=InvoiceResponse)
async def adjust_invoice_wallet(
    invoice_id: int,
    adjustment_data: WalletAdjustmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type not in ["SA", "A"]:
        raise HTTPException(status_code=403, detail="Permission denied. Only Admins can apply wallet adjustments.")
    from decimal import Decimal
    return await InvoiceService.adjust_invoice_wallet(db, invoice_id, Decimal(str(adjustment_data.amount)), current_user)


@router.get("/last-units/{room_no}/{month}")
async def get_last_units(
    room_no: str,
    month: str,
    exclude_invoice_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    units = await InvoiceService.get_last_units(db, room_no, month, current_user, exclude_invoice_id)
    return {"last_units": units}

@router.get("/due/{tenant_id}", response_model=List[InvoiceResponse])
async def get_due_invoices(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await InvoiceService.get_due_invoices(db, tenant_id, current_user)

@router.get("/{invoice_id}/download")
async def download_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    invoice = await InvoiceService.get_invoice(db, invoice_id, current_user)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    tenant = invoice.tenant
    owner = tenant.owner if tenant else current_user

    pdf_bytes = PDFService.generate_invoice_pdf(invoice, tenant, owner)
    filename = PDFService.invoice_filename(invoice, tenant)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
