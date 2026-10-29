"""Rotas da API dedicadas à monitorização do Proxmox VE."""
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.schemas import APIResponse, ProxmoxSummaryData
from app.integrations.proxmox import proxmox_adapter

router = APIRouter(prefix="/proxmox", tags=["Proxmox VE"])


@router.get("/summary", response_model=APIResponse)
async def get_proxmox_summary(_: str = Depends(verify_api_key)):
    """Obtém resumo consolidado do Proxmox VE com CPU, RAM, nós e contagem de VMs."""
    summary: ProxmoxSummaryData = await proxmox_adapter.get_summary()
    return APIResponse(status="ok", data=summary)


@router.get("/nodes", response_model=APIResponse)
async def get_proxmox_nodes(_: str = Depends(verify_api_key)):
    """Lista todos os nós do cluster Proxmox VE."""
    nodes = await proxmox_adapter.get_nodes()
    return APIResponse(status="ok", data=nodes)


@router.get("/resources", response_model=APIResponse)
async def get_proxmox_resources(_: str = Depends(verify_api_key)):
    """Lista todas as máquinas virtuais (QEMU) e containers (LXC)."""
    vms = await proxmox_adapter.get_resources_vms()
    return APIResponse(status="ok", data=vms)

