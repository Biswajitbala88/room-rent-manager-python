from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app.routers import auth, profile, tenants, invoices, dashboard, electricity, rooms, users, sync
from app.config import settings

app = FastAPI(title="Room Rent Manager API")

# Mount uploads directory
uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

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
app.include_router(rooms.router)
app.include_router(users.router)
app.include_router(sync.router)

@app.get("/")
async def root():
    return {"message": "Welcome to Room Rent Manager API"}

