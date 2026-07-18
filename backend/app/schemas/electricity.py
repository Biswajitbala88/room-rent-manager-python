from pydantic import BaseModel
from typing import List
from app.schemas.invoice import InvoiceResponse

class ElectricityReportResponse(BaseModel):
    items: List[InvoiceResponse]
    total_units: int
    total_cost: float
    total_items: int
    page: int
    limit: int
