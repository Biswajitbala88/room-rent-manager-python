from pydantic import BaseModel
from datetime import datetime
from app.schemas.tenant import TenantResponse

class InvoiceBase(BaseModel):
    tenant_id: int
    month: str # YYYY-MM
    electricity_units: int = 0
    previous_reading: int = 0
    current_reading: int = 0
    water_charge: float = 0.0
    received_amount: float = 0.0
    is_excluded: bool = False
    is_closer: bool = False
    advance_applied: float = 0.0

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceUpdate(InvoiceBase):
    pass


class InvoiceResponse(InvoiceBase):
    id: int
    room_no: str | None = None
    electricity_charge: float
    rent_amount: float
    total_amount: float
    status: str
    created_at: datetime
    updated_at: datetime
    
    tenant: TenantResponse | None = None

    model_config = {"from_attributes": True}

class AddPayment(BaseModel):
    amount: float
    payment_mode: str
    payment_date: str # YYYY-MM-DD
