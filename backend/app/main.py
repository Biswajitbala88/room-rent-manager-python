from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, profile, tenants, invoices, dashboard, electricity
from app.config import settings

app = FastAPI(title="Room Rent Manager API")

origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(tenants.router)
app.include_router(invoices.router)
app.include_router(dashboard.router)
app.include_router(electricity.router)

@app.get("/")
async def root():
    return {"message": "Welcome to Room Rent Manager API"}
