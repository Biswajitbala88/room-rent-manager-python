from pydantic import BaseModel
from datetime import datetime

class RoomBase(BaseModel):
    room_no: str
    rent_amount: float
    description: str | None = None
    status: str = "vacant"

class RoomCreate(RoomBase):
    parent_id: int | None = None

class RoomUpdate(BaseModel):
    room_no: str | None = None
    rent_amount: float | None = None
    description: str | None = None
    status: str | None = None
    parent_id: int | None = None

class RoomResponse(RoomBase):
    id: int
    parent_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
