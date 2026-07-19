from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.user import User
from app.dependencies import get_current_user
from app.schemas.user import UserResponse, UserCreate, UserUpdate
from app.utils import get_password_hash

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type == "M":
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if current_user.user_type == "SA":
        result = await db.execute(select(User).order_by(User.id))
    else: # Admin
        result = await db.execute(
            select(User).where(User.parent_id == current_user.id).order_by(User.id)
        )
    return result.scalars().all()

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type != "SA":
        raise HTTPException(status_code=403, detail="Only Super Admin can create users")
    
    # Check if email exists
    email_check = await db.execute(select(User).where(User.email == user_data.email))
    if email_check.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        user_type=user_data.user_type,
        parent_id=user_data.parent_id if user_data.user_type == "M" else None
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type != "SA":
        raise HTTPException(status_code=403, detail="Only Super Admin can update users")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_data.email and user_data.email != user.email:
        email_check = await db.execute(select(User).where(User.email == user_data.email))
        if email_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
        user.email = user_data.email

    if user_data.name:
        user.name = user_data.name

    if user_data.user_type:
        user.user_type = user_data.user_type

    if user_data.parent_id is not None:
        user.parent_id = user_data.parent_id if user.user_type == "M" else None

    if user_data.password:
        user.password_hash = get_password_hash(user_data.password)

    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_type != "SA":
        raise HTTPException(status_code=403, detail="Only Super Admin can delete users")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)
    await db.commit()
