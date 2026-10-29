"""Adaptador de métricas e bloqueio DNS para Pi-hole e AdGuard Home."""
import logging
from typing import Dict, Any, Optional
import httpx

from app.config import settings
from app.integrations.base import BaseAdapter
from app.schemas import DnsSummaryData

logger = logging.getLogger("jarvis.integrations.dns")


class DnsAdapter(BaseAdapter):
    """Adaptador agnóstico de estatísticas de proteção DNS."""

    def __init__(self):
        super().__init__(name="DNS Shield")
        self.provider = settings.DNS_PROVIDER.lower()

    def is_configured(self) -> bool:
        """Verifica se algum fornecedor DNS suportado está ativo."""
        if self.provider == "pihole":
            return bool(settings.PIHOLE_URL)
        elif self.provider == "adguard":
            return bool(settings.ADGUARD_URL and settings.ADGUARD_USERNAME and settings.ADGUARD_PASSWORD)
        return False

    async def health_check(self) -> Dict[str, Any]:
        """Testa conectividade com o servidor DNS configurado."""
        if not self.is_configured():
            return {"configured": False, "status": "disabled", "provider": self.provider}

        summary = await self.get_summary()
        return {"configured": summary.configured, "status": summary.status, "provider": self.provider}

    async def get_summary(self) -> DnsSummaryData:
        """Obtém resumo normalizado de consultas e bloqueios DNS."""
        if not self.is_configured():
            return DnsSummaryData(
                configured=False,
                provider=self.provider,
                status="disabled"
            )

        if self.provider == "pihole":
            return await self._get_pihole_summary()
        elif self.provider == "adguard":
            return await self._get_adguard_summary()

        return DnsSummaryData(configured=False, provider="none", status="disabled")

    async def _get_pihole_summary(self) -> DnsSummaryData:
        """Consulta as estatísticas do Pi-hole."""
        url = (settings.PIHOLE_URL or "").rstrip("/")
        api_url = f"{url}/admin/api.php?summaryRaw"
        if settings.PIHOLE_API_TOKEN:
            api_url += f"&auth={settings.PIHOLE_API_TOKEN}"

        try:
            async with httpx.AsyncClient(timeout=4) as client:
                res = await client.get(api_url)
                if res.status_code == 200:
                    data = res.json()
                    queries = int(data.get("dns_queries_today", 0))
                    blocked = int(data.get("ads_blocked_today", 0))
                    pct = float(data.get("ads_percentage_today", 0.0))
                    clients = int(data.get("unique_clients", 0))

                    return DnsSummaryData(
                        configured=True,
                        provider="pihole",
                        status="operational" if data.get("status") == "enabled" else "degraded",
                        queries_today=queries,
                        blocked_today=blocked,
                        block_percentage=round(pct, 2),
                        clients_active=clients
                    )
                return DnsSummaryData(configured=True, provider="pihole", status="error")
        except Exception as e:
            logger.warning(f"Falha ao consultar Pi-hole: {str(e)}")
            return DnsSummaryData(configured=True, provider="pihole", status="unreachable")

    async def _get_adguard_summary(self) -> DnsSummaryData:
        """Consulta as estatísticas do AdGuard Home via Basic Auth."""
        url = (settings.ADGUARD_URL or "").rstrip("/")
        stats_url = f"{url}/control/stats"
        auth = (settings.ADGUARD_USERNAME or "", settings.ADGUARD_PASSWORD or "")

        try:
            async with httpx.AsyncClient(timeout=4, auth=auth) as client:
                res = await client.get(stats_url)
                if res.status_code == 200:
                    data = res.json()
                    queries = int(data.get("num_dns_queries", 0))
                    blocked = int(data.get("num_blocked_filtering", 0))
                    pct = round((blocked / queries * 100), 2) if queries > 0 else 0.0

                    return DnsSummaryData(
                        configured=True,
                        provider="adguard",
                        status="operational",
                        queries_today=queries,
                        blocked_today=blocked,
                        block_percentage=pct,
                        clients_active=len(data.get("top_clients", []))
                    )
                return DnsSummaryData(configured=True, provider="adguard", status="error")
        except Exception as e:
            logger.warning(f"Falha ao consultar AdGuard Home: {str(e)}")
            return DnsSummaryData(configured=True, provider="adguard", status="unreachable")


dns_adapter = DnsAdapter()

