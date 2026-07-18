from pydantic import BaseModel, EmailStr
from datetime import datetime

class UserBase(BaseModel):
    name: str
    email: EmailStr

class UserResponse(UserBase):
    id: int
    user_type: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
