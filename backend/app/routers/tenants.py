from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.dependencies import get_current_user
from app.schemas.tenant import TenantResponse, TenantCreate, TenantUpdate
from app.schemas.transaction import TransactionResponse
from app.services.tenant_service import TenantService

router = APIRouter(prefix="/api/tenants", tags=["tenants"])

@router.get("/", response_model=List[TenantResponse])
async def list_tenants(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await TenantService.get_tenants(db, current_user)

@router.post("/", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    tenant_data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await TenantService.create_tenant(db, tenant_data, current_user)

@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tenant = await TenantService.get_tenant(db, tenant_id, current_user)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant

@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    tenant_data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await TenantService.update_tenant(db, tenant_id, tenant_data, current_user)

@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await TenantService.delete_tenant(db, tenant_id, current_user)

@router.post("/{tenant_id}/upload-aadhaar", response_model=TenantResponse)
async def upload_aadhaar(
    tenant_id: int,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await TenantService.upload_aadhaar(db, tenant_id, files, current_user)

@router.get("/{tenant_id}/transactions", response_model=List[TransactionResponse])
async def get_tenant_transactions(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await TenantService.get_tenant_transactions(db, tenant_id, current_user)
