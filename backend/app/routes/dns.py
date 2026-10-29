"""Rotas da API dedicadas às estatísticas DNS (Pi-hole / AdGuard Home)."""
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.schemas import APIResponse, DnsSummaryData
from app.integrations.dns import dns_adapter

router = APIRouter(prefix="/dns", tags=["DNS Shield"])


@router.get("/summary", response_model=APIResponse)
async def get_dns_summary(_: str = Depends(verify_api_key)):
    """Obtém resumo de consultas, ameaças e anúncios bloqueados pelo escudo DNS."""
    summary: DnsSummaryData = await dns_adapter.get_summary()
    return APIResponse(status="ok", data=summary)

