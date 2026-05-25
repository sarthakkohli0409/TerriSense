"""
TerriSense Backend — FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from routers import upload, segment, size, align, diagnose, export_router

logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
logger = logging.getLogger("terrisense")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("TerriSense API starting up")
    yield
    logger.info("TerriSense API shutting down")


app = FastAPI(
    title="TerriSense API",
    description="Pharma commercial deployment planning platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(upload.router,   prefix="/upload",   tags=["Upload"])
app.include_router(segment.router,  prefix="/segment",  tags=["Segmentation"])
app.include_router(size.router,     prefix="/size",     tags=["Sizing"])
app.include_router(align.router,    prefix="/align",    tags=["Alignment"])
app.include_router(diagnose.router, prefix="/diagnose", tags=["Diagnosis"])
app.include_router(export_router.router, prefix="/export", tags=["Export"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "terrisense-api", "version": "1.0.0"}


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__}
    )
