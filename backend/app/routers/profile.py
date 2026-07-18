from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate, PasswordChange
from app.dependencies import get_current_user
from app.utils import verify_password, get_password_hash

router = APIRouter(prefix="/api/auth", tags=["profile"])

@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/me", response_model=UserResponse)
async def update_profile(
    user_data: UserUpdate, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    if user_data.name:
        current_user.name = user_data.name
    if user_data.email:
        current_user.email = user_data.email
    
    await db.commit()
    await db.refresh(current_user)
    return current_user

@router.patch("/me/password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect current password")
    
    current_user.password_hash = get_password_hash(password_data.new_password)
    await db.commit()
    return {"detail": "Password updated successfully"}
