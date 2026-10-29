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
        """Procura apenas os serviços da allowlist configurada em settings.monitored_services."""
        services_spec = settings.monitored_services
        results: List[ServiceHealthItem] = []

        if not services_spec:
            return results

        now_iso = datetime.now(timezone.utc).isoformat()

        async with httpx.AsyncClient(verify=False, timeout=2.5) as client:
            for s in services_spec:
                name = s.get("name", "Serviço")
                url = s.get("url", "")
                if not url:
                    continue

                start = time.perf_counter()
                try:
                    res = await client.get(url)
                    latency = round((time.perf_counter() - start) * 1000)
                    is_ok = res.status_code < 400
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

