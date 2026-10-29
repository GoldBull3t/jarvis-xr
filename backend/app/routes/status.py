"""Rotas de estado agregado do Homelab e diagnóstico."""
import time
from fastapi import APIRouter, Depends
from app.config import settings
from app.security import verify_api_key
from app.schemas import APIResponse, SystemStatusData, IntegrationStatus

router = APIRouter(tags=["Status"])
START_TIME = time.time()


@router.get("/status", response_model=APIResponse)
async def get_system_status(_: str = Depends(verify_api_key)):
    """Retorna o estado operacional de todas as integrações configuradas."""
    integrations = [
        IntegrationStatus(
            name="Proxmox VE",
            enabled=settings.PROXMOX_ENABLED,
            configured=bool(settings.PROXMOX_URL and settings.PROXMOX_TOKEN_ID),
            status="operational" if settings.PROXMOX_ENABLED else "disabled",
            details="Monitorização de nós, VMs e LXCs" if settings.PROXMOX_ENABLED else "Integração desativada em .env"
        ),
        IntegrationStatus(
            name="Home Assistant",
            enabled=settings.HOME_ASSISTANT_ENABLED,
            configured=bool(settings.HOME_ASSISTANT_URL and settings.HOME_ASSISTANT_TOKEN),
            status="operational" if settings.HOME_ASSISTANT_ENABLED else "disabled",
            details=f"Entidades autorizadas: {len(settings.allowed_ha_entities)}" if settings.HOME_ASSISTANT_ENABLED else "Integração desativada em .env"
        ),
        IntegrationStatus(
            name=f"DNS ({settings.DNS_PROVIDER.title()})" if settings.DNS_PROVIDER != "none" else "DNS Shield",
            enabled=settings.DNS_PROVIDER in ["pihole", "adguard"],
            configured=settings.DNS_PROVIDER in ["pihole", "adguard"],
            status="operational" if settings.DNS_PROVIDER in ["pihole", "adguard"] else "disabled",
            details=f"Fornecedor: {settings.DNS_PROVIDER}"
        ),
    ]

    active_count = sum(1 for i in integrations if i.enabled and i.configured)
    overall = "operational" if active_count > 0 else "degraded"

    status_data = SystemStatusData(
        overall_status=overall,
        integrations=integrations,
        active_services_count=active_count,
        uptime_seconds=round(time.time() - START_TIME, 2)
    )

    return APIResponse(status="ok", data=status_data)


@router.get("/status/demo", response_model=APIResponse)
async def get_demo_status(_: str = Depends(verify_api_key)):
    """
    Retorna dados simulados estruturados para teste de interface no Quest 3S e Desktop.
    NOTA: Todos os dados desta rota contêm identificador explícito de simulação [DEMO/MOCK].
    """
    # Se estiver em ambiente real ou integrações ativas, utiliza os URLs reais ou lista vazia
    demo_services = []
    if settings.PROXMOX_ENABLED and settings.PROXMOX_URL:
        demo_services.append({"name": "Proxmox WebUI", "url": settings.PROXMOX_URL, "status": "online", "latency_ms": 3})
    if settings.HOME_ASSISTANT_ENABLED and settings.HOME_ASSISTANT_URL:
        demo_services.append({"name": "Home Assistant", "url": settings.HOME_ASSISTANT_URL, "status": "online", "latency_ms": 5})

    if not demo_services and settings.JARVIS_ENV != "production":
        demo_services = [
            {"name": "Proxmox WebUI", "url": "https://192.168.1.100:8006", "status": "online", "latency_ms": 3},
            {"name": "Home Assistant", "url": "http://192.168.1.110:8123", "status": "online", "latency_ms": 5}
        ]

    demo_payload = {
        "is_mock": not (settings.PROXMOX_ENABLED or settings.HOME_ASSISTANT_ENABLED),
        "label": "[DADOS DO SISTEMA]" if (settings.PROXMOX_ENABLED or settings.HOME_ASSISTANT_ENABLED) else "[DEMO/MOCK DATA]",
        "home": {
            "temperature_celsius": 21.4,
            "humidity_percent": 55,
            "lights_on": 0,
            "total_lights": 0,
            "entities": []
        },
        "proxmox": {
            "cluster_name": "pve",
            "nodes_online": 1,
            "total_nodes": 1,
            "cpu_usage_percent": 0,
            "ram_usage_percent": 0,
            "ram_used_gb": 0,
            "ram_total_gb": 0,
            "vms_running": 0,
            "total_vms": 0,
            "vms": []
        },
        "dns": {
            "provider": settings.DNS_PROVIDER if settings.DNS_PROVIDER != "none" else "none",
            "status": "enabled" if settings.DNS_PROVIDER != "none" else "disabled",
            "queries_today": 0,
            "blocked_today": 0,
            "block_percentage": 0,
            "clients_active": 0
        },
        "services": demo_services
    }
    return APIResponse(status="ok", data=demo_payload)

