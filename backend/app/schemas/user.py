from pydantic import BaseModel, EmailStr
from datetime import datetime

class UserBase(BaseModel):
    name: str
    email: EmailStr

class UserResponse(UserBase):
    id: int
    parent_id: int | None = None
    user_type: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class UserCreate(UserBase):
    password: str
    user_type: str = "A"
    parent_id: int | None = None

class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    user_type: str | None = None
    password: str | None = None
    parent_id: int | None = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
