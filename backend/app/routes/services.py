"""Rotas da API dedicadas à verificação de disponibilidade de serviços."""
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.schemas import APIResponse
from app.integrations.healthchecker import health_checker

router = APIRouter(prefix="/services", tags=["Services Health"])


@router.get("", response_model=APIResponse)
async def get_monitored_services(_: str = Depends(verify_api_key)):
    """Executa a verificação de saúde exclusivamente sobre a allowlist de serviços configurada."""
    results = await health_checker.check_all_services()
    return APIResponse(status="ok", data=results)

