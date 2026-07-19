from pydantic import BaseModel
from datetime import date, datetime

class TenantBase(BaseModel):
    name: str
    phone: str | None = None
    room_no: str
    start_date: date | None = None
    rent_amount: float
    status: str = "active"
    is_water_charge: bool = False
    water_charge: float = 0.0
    is_advanced: bool = False

class TenantCreate(TenantBase):
    parent_id: int | None = None
    manager_id: int | None = None

class TenantUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    room_no: str | None = None
    start_date: date | None = None
    rent_amount: float | None = None
    status: str | None = None
    is_water_charge: bool | None = None
    water_charge: float | None = None
    is_advanced: bool | None = None
    parent_id: int | None = None
    manager_id: int | None = None

class TenantResponse(TenantBase):
    id: int
    parent_id: int
    manager_id: int | None = None
    aadhaar_images: list[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
