from pydantic import BaseModel
from datetime import datetime

class BulkInvoiceRoomInput(BaseModel):
    room_id: int
    current_reading: int

class BulkInvoiceCreateRequest(BaseModel):
    month: str  # YYYY-MM
    rooms: list[BulkInvoiceRoomInput]

class BulkInvoiceItemResponse(BaseModel):
    id: int
    room_id: int | None = None
    room_no: str | None = None
    tenant_id: int | None = None
    current_reading: int | None = None
    status: str
    invoice_id: int | None = None
    error_message: str | None = None

    model_config = {"from_attributes": True}

class BulkInvoiceOperationResponse(BaseModel):
    id: int
    month: str
    status: str
    total_count: int
    completed_count: int
    failed_count: int
    skipped_count: int
    created_at: datetime
    finished_at: datetime | None = None
    items: list[BulkInvoiceItemResponse] = []

    model_config = {"from_attributes": True}
