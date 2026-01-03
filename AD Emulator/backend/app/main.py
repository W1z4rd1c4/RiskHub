"""AD Emulator - Active Directory Emulator for RiskHub integration testing."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print(f"🚀 AD Emulator starting on port {settings.AD_EMULATOR_PORT}")
    yield
    # Shutdown
    print("👋 AD Emulator shutting down")


app = FastAPI(
    title="AD Emulator API",
    description="Active Directory Emulator for testing RiskHub AD sync integration. "
                "Simulates an external directory service that RiskHub can sync users from.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "ad-emulator"}
