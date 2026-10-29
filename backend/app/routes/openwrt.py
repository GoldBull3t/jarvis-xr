"""Rotas da API dedicadas ao router OpenWrt (NanoPi R3S Gateway)."""
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.schemas import APIResponse, OpenWrtSummaryData
from app.integrations.openwrt import openwrt_adapter

router = APIRouter(prefix="/openwrt", tags=["OpenWrt Gateway"])


@router.get("/summary", response_model=APIResponse)
async def get_openwrt_summary(_: str = Depends(verify_api_key)):
    """Obtém o resumo em tempo real da largura de banda WAN, carga de CPU, RAM e temperatura do NanoPi R3S."""
    summary: OpenWrtSummaryData = await openwrt_adapter.get_summary()
    return APIResponse(status="ok", data=summary)


@router.get("/interfaces", response_model=APIResponse)
async def get_openwrt_interfaces(_: str = Depends(verify_api_key)):
    """Obtém as estatísticas de tráfego de todas as interfaces físicas e lógicas (eth0, eth1, wan, br-lan)."""
    summary: OpenWrtSummaryData = await openwrt_adapter.get_summary()
    return APIResponse(status="ok", data=summary.interfaces)

