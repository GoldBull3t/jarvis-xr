"""Rotas da API dedicadas à monitorização do Proxmox VE."""
from fastapi import APIRouter, Depends, HTTPException, status
from app.security import verify_api_key
from app.schemas import (
    APIResponse,
    ProxmoxSummaryData,
    ProxmoxVMActionRequest,
    ActionExecutionResult
)
from app.integrations.proxmox import proxmox_adapter
from app.services.audit import audit_logger

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


@router.get("/storage", response_model=APIResponse)
async def get_proxmox_storage(_: str = Depends(verify_api_key)):
    """Obtém a capacidade e utilização dos pools de armazenamento."""
    storage = await proxmox_adapter.get_storage()
    return APIResponse(status="ok", data=storage)


@router.get("/backups", response_model=APIResponse)
async def get_proxmox_backups(_: str = Depends(verify_api_key)):
    """Obtém o estado e data do último backup do Proxmox."""
    status_data = await proxmox_adapter.get_backup_status()
    return APIResponse(status="ok", data=status_data)


@router.post("/actions/vm", response_model=APIResponse)
async def action_proxmox_vm(
    req: ProxmoxVMActionRequest,
    _: str = Depends(verify_api_key)
):
    """Executa ações seguras de ciclo de vida (start, shutdown, reboot) em VMs autorizadas."""
    result: ActionExecutionResult = await proxmox_adapter.control_vm(
        vmid=req.vmid,
        action=req.action,
        confirmed=req.confirmed
    )

    audit_logger.log(
        event_type="VM_ACTION",
        target=f"VM {req.vmid}",
        action=req.action.upper(),
        actor="webxr_controller",
        confirmed=req.confirmed,
        details=result.message if result.success else f"Falha: {result.message}"
    )

    if not result.success:
        if result.new_state == "unauthorized":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=result.message
            )
        return APIResponse(status="error", error=result.message, data=result)

    return APIResponse(status="ok", data=result)

