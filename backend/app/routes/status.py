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
    demo_payload = {
        "is_mock": True,
        "label": "[DEMO/MOCK DATA — FASE 2]",
        "home": {
            "temperature_celsius": 21.4,
            "humidity_percent": 55,
            "lights_on": 2,
            "total_lights": 6,
            "entities": [
                {"id": "light.escritorio", "name": "Luz Escritório", "state": "on", "type": "light"},
                {"id": "light.sala", "name": "Luz da Sala", "state": "off", "type": "light"},
                {"id": "switch.tomada_servidor", "name": "Tomada Homelab", "state": "on", "type": "switch"}
            ]
        },
        "proxmox": {
            "cluster_name": "homelab-pve",
            "nodes_online": 1,
            "total_nodes": 1,
            "cpu_usage_percent": 18.5,
            "ram_usage_percent": 42.0,
            "ram_used_gb": 13.4,
            "ram_total_gb": 32.0,
            "vms_running": 4,
            "total_vms": 5,
            "vms": [
                {"vmid": 100, "name": "pve-gateway", "status": "running", "cpu": 4.2, "mem_mb": 1024},
                {"vmid": 101, "name": "home-assistant", "status": "running", "cpu": 6.8, "mem_mb": 4096},
                {"vmid": 102, "name": "jarvis-xr-vm", "status": "running", "cpu": 5.1, "mem_mb": 2048},
                {"vmid": 103, "name": "media-stack", "status": "running", "cpu": 2.4, "mem_mb": 6144}
            ]
        },
        "dns": {
            "provider": "Pi-hole [DEMO]",
            "status": "enabled",
            "queries_today": 42180,
            "blocked_today": 9480,
            "block_percentage": 22.48,
            "clients_active": 18
        },
        "services": [
            {"name": "Proxmox WebUI", "url": "https://192.168.1.100:8006", "status": "online", "latency_ms": 3},
            {"name": "Home Assistant", "url": "http://192.168.1.110:8123", "status": "online", "latency_ms": 5},
            {"name": "Pi-hole Admin", "url": "http://192.168.1.120", "status": "online", "latency_ms": 2},
            {"name": "NAS Storage", "url": "http://192.168.1.130", "status": "online", "latency_ms": 4}
        ]
    }
    return APIResponse(status="ok", data=demo_payload)

