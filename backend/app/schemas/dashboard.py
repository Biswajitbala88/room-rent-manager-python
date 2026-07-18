from pydantic import BaseModel

class DashboardSummary(BaseModel):
    pending_invoices_count: int
    due_amount: float
    received_amount: float
    total_tenants: int
    active_tenants: int
