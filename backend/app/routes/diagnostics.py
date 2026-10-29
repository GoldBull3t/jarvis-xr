"""Rotas de diagnóstico e verificação avançada do homelab (Pilar 4)."""
import time
import socket
import logging
from typing import List
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.schemas import APIResponse, DiagnosticCheckItem, FullDiagnosticsData
from app.config import settings
from app.integrations.homeassistant import ha_adapter
from app.integrations.proxmox import pve_adapter
from app.integrations.dns import dns_adapter
from app.integrations.openwrt import openwrt_adapter

logger = logging.getLogger("jarvis.routes.diagnostics")
router = APIRouter(prefix="/diagnostics", tags=["Diagnostics"])


@router.get("/full", response_model=APIResponse)
async def get_full_diagnostics(_: str = Depends(verify_api_key)):
    """Executa bateria de diagnósticos simultâneos de rede, latência e integridade das integrações."""
    checks: List[DiagnosticCheckItem] = []
    all_healthy = True

    # 1. Diagnóstico do Proxmox VE
    if settings.PROXMOX_ENABLED:
        t0 = time.perf_counter()
        health = await pve_adapter.health_check()
        lat_ms = round((time.perf_counter() - t0) * 1000, 1)

        is_ok = health.get("status") == "operational"
        if not is_ok:
            all_healthy = False

        checks.append(DiagnosticCheckItem(
            service="Proxmox VE",
            status="ok" if is_ok else "error",
            latency_ms=lat_ms,
            endpoint=settings.PROXMOX_URL,
            message=health.get("message", "Sem resposta"),
            details={"verify_ssl": settings.PROXMOX_VERIFY_SSL}
        ))
    else:
        checks.append(DiagnosticCheckItem(
            service="Proxmox VE",
            status="disabled",
            message="Integração inativa nas configurações"
        ))

    # 2. Diagnóstico do Home Assistant
    if settings.HOME_ASSISTANT_ENABLED:
        t0 = time.perf_counter()
        health = await ha_adapter.health_check()
        lat_ms = round((time.perf_counter() - t0) * 1000, 1)

        is_ok = health.get("status") == "operational"
        if not is_ok:
            all_healthy = False

        checks.append(DiagnosticCheckItem(
            service="Home Assistant",
            status="ok" if is_ok else "error",
            latency_ms=lat_ms,
            endpoint=ha_adapter.active_url or settings.HOME_ASSISTANT_URL,
            message=health.get("message", "Sem resposta"),
            details={
                "active_url": ha_adapter.active_url,
                "fallback_url": settings.HOME_ASSISTANT_FALLBACK_URL,
                "discovery_mode": settings.HOME_ASSISTANT_DISCOVERY_MODE,
                "label": settings.HOME_ASSISTANT_DISCOVERY_LABEL,
                "verify_ssl": settings.HOME_ASSISTANT_VERIFY_SSL
            }
        ))
    else:
        checks.append(DiagnosticCheckItem(
            service="Home Assistant",
            status="disabled",
            message="Integração inativa nas configurações"
        ))

    # 3. Diagnóstico do Fornecedor DNS (Pi-hole / AdGuard)
    if settings.DNS_PROVIDER != "none":
        t0 = time.perf_counter()
        health = await dns_adapter.health_check()
        lat_ms = round((time.perf_counter() - t0) * 1000, 1)

        is_ok = health.get("status") == "operational"
        if not is_ok:
            all_healthy = False

        checks.append(DiagnosticCheckItem(
            service=f"DNS Shield ({settings.DNS_PROVIDER.upper()})",
            status="ok" if is_ok else "error",
            latency_ms=lat_ms,
            endpoint=settings.PIHOLE_URL if settings.DNS_PROVIDER == "pihole" else settings.ADGUARD_URL,
            message=health.get("message", "Sem resposta")
        ))
    else:
        checks.append(DiagnosticCheckItem(
            service="DNS Shield",
            status="disabled",
            message="Nenhum fornecedor de DNS configurado"
        ))

    # 4. Diagnóstico do Router OpenWrt (NanoPi R3S)
    if settings.OPENWRT_ENABLED:
        t0 = time.perf_counter()
        health = await openwrt_adapter.health_check()
        lat_ms = round((time.perf_counter() - t0) * 1000, 1)

        is_ok = health.get("status") == "operational"
        if not is_ok:
            all_healthy = False

        checks.append(DiagnosticCheckItem(
            service="OpenWrt (NanoPi R3S)",
            status="ok" if is_ok else "error",
            latency_ms=lat_ms,
            endpoint=settings.OPENWRT_URL,
            message=health.get("message", "Sem resposta")
        ))
    else:
        checks.append(DiagnosticCheckItem(
            service="OpenWrt (NanoPi R3S)",
            status="disabled",
            message="Integração inativa nas configurações"
        ))

    # 5. Diagnóstico de Resolução de Nomes Local
    t0 = time.perf_counter()
    dns_resolved = False
    try:
        # Testa resolução local de gateway ou domínio
        host_to_test = "ha.bernaslab.top" if "ha.bernaslab.top" in (settings.HOME_ASSISTANT_URL or "") else "localhost"
        socket.gethostbyname(host_to_test)
        dns_resolved = True
        dns_lat = round((time.perf_counter() - t0) * 1000, 1)
        checks.append(DiagnosticCheckItem(
            service="Resolução DNS Interna",
            status="ok",
            latency_ms=dns_lat,
            message=f"Resolução bem-sucedida para '{host_to_test}'"
        ))
    except Exception as e:
        dns_lat = round((time.perf_counter() - t0) * 1000, 1)
        checks.append(DiagnosticCheckItem(
            service="Resolução DNS Interna",
            status="warning",
            latency_ms=dns_lat,
            message=f"Não foi possível resolver nome local: {str(e)[:50]}"
        ))

    system_info = {
        "environment": settings.JARVIS_ENV,
        "auth_required": settings.is_auth_required,
        "cors_origins": settings.cors_origins_list,
        "hostname": socket.gethostname()
    }

    return APIResponse(
        status="ok",
        data=FullDiagnosticsData(
            all_healthy=all_healthy,
            checks=checks,
            system_info=system_info
        )
    )

