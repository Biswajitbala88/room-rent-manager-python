from pydantic import BaseModel
from datetime import date, datetime

class TransactionBase(BaseModel):
    amount: float
    payment_mode: str | None = None
    payment_date: date | None = None

class TransactionCreate(TransactionBase):
    invoice_id: int | None = None

class TransactionResponse(TransactionBase):
    id: int
    tenant_id: int
    invoice_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
