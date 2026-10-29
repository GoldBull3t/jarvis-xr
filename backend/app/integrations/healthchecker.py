"""Verificador de disponibilidade de serviços internos do Homelab (Anti-SSRF)."""
import time
import logging
from typing import List
from datetime import datetime, timezone
import httpx

from app.config import settings
from app.schemas import ServiceHealthItem

logger = logging.getLogger("jarvis.integrations.healthchecker")


class HealthChecker:
    """Verifica periodicamente a lista segura de serviços HTTP autorizados."""

    @staticmethod
    async def check_all_services() -> List[ServiceHealthItem]:
        """
        Verifica periodicamente a lista segura de serviços HTTP autorizados.
        Se HOMELAB_SERVICES não estiver definido, auto-inclui os nós centrais ativos (Proxmox, Home Assistant, DNS).
        """
        services_spec = list(settings.monitored_services)

        # Se não foram configurados serviços manuais, auto-deteta as integrações ativas
        if not services_spec:
            auto_services = []
            if settings.PROXMOX_ENABLED and settings.PROXMOX_URL:
                auto_services.append({"name": "Proxmox VE WebUI", "url": settings.PROXMOX_URL})
            if settings.HOME_ASSISTANT_ENABLED and settings.HOME_ASSISTANT_URL:
                auto_services.append({"name": "Home Assistant", "url": settings.HOME_ASSISTANT_URL})
            if settings.DNS_PROVIDER == "pihole" and settings.PIHOLE_URL:
                auto_services.append({"name": "Pi-hole Admin", "url": settings.PIHOLE_URL})
            elif settings.DNS_PROVIDER == "adguard" and settings.ADGUARD_URL:
                auto_services.append({"name": "AdGuard Home", "url": settings.ADGUARD_URL})
            services_spec = auto_services

        results: List[ServiceHealthItem] = []
        if not services_spec:
            return results

        now_iso = datetime.now(timezone.utc).isoformat()

        async with httpx.AsyncClient(verify=False, timeout=3.0, follow_redirects=True) as client:
            for s in services_spec:
                name = s.get("name", "Serviço")
                url = s.get("url", "")
                if not url:
                    continue

                start = time.perf_counter()
                try:
                    res = await client.get(url)
                    latency = round((time.perf_counter() - start) * 1000)
                    # Qualquer resposta HTTP (mesmo 401 ou 403 de login) indica que o serviço está operacional
                    is_ok = res.status_code < 500
                    results.append(ServiceHealthItem(
                        name=name,
                        url=url,
                        status="online" if is_ok else "degraded",
                        latency_ms=latency,
                        last_checked=now_iso,
                        error_message=None if is_ok else f"HTTP {res.status_code}"
                    ))
                except Exception as e:
                    results.append(ServiceHealthItem(
                        name=name,
                        url=url,
                        status="offline",
                        latency_ms=None,
                        last_checked=now_iso,
                        error_message=str(e)[:60]
                    ))

        return results


health_checker = HealthChecker()

