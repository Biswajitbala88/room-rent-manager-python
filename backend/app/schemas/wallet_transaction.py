from pydantic import BaseModel
from datetime import datetime

class WalletTransactionCreate(BaseModel):
    amount: float
    transaction_type: str  # 'credit' or 'debit'
    reason: str | None = None
    reference: str | None = None

class WalletTransactionResponse(BaseModel):
    id: int
    tenant_id: int
    invoice_id: int | None = None
    amount: float
    transaction_type: str
    reason: str | None = None
    reference: str | None = None
    performed_by: int | None = None
    running_balance: float
    created_at: datetime

    model_config = {"from_attributes": True}
