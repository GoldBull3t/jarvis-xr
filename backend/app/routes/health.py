"""Rota de verificação de integridade (Health Check)."""
from fastapi import APIRouter
from app.config import settings
from app.schemas import APIResponse, HealthData

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=APIResponse)
async def get_health():
    """Retorna estado básico do serviço backend sem requerer autenticação."""
    return APIResponse(
        status="ok",
        data=HealthData(
            service="jarvis-xr-backend",
            version="0.1.0",
            status="healthy",
            environment=settings.JARVIS_ENV
        )
    )

