"""Adaptador de monitorização oficial e exclusivo de leitura para o Proxmox VE."""
import logging
from typing import Dict, Any, List, Optional
import httpx

from app.config import settings
from app.integrations.base import BaseAdapter
from app.schemas import ProxmoxNode, ProxmoxVM, ProxmoxSummaryData

logger = logging.getLogger("jarvis.integrations.proxmox")


class ProxmoxAdapter(BaseAdapter):
    """Adaptador de leitura assíncrono para a API oficial do Proxmox VE (PVE API2)."""

    def __init__(self):
        super().__init__(name="Proxmox VE")
        self.url = (settings.PROXMOX_URL or "").rstrip("/")
        self.token_id = settings.PROXMOX_TOKEN_ID or ""
        self.token_secret = settings.PROXMOX_TOKEN_SECRET or ""
        self.verify_ssl = settings.PROXMOX_VERIFY_SSL
        self.timeout = settings.PROXMOX_TIMEOUT_SECONDS

    def is_configured(self) -> bool:
        """Verifica se a integração do Proxmox está ativa e com token preenchido."""
        return bool(settings.PROXMOX_ENABLED and self.url and self.token_id and self.token_secret)

    def _get_headers(self) -> Dict[str, str]:
        """Gera o cabeçalho oficial de autenticação PVEAPIToken."""
        return {
            "Authorization": f"PVEAPIToken={self.token_id}={self.token_secret}",
            "Accept": "application/json"
        }

    async def health_check(self) -> Dict[str, Any]:
        """Verifica se a API do Proxmox está online através do endpoint /api2/json/version."""
        if not self.is_configured():
            return {"configured": False, "status": "disabled", "message": "Integração Proxmox desativada"}

        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.get(f"{self.url}/api2/json/version", headers=self._get_headers())
                if res.status_code == 200:
                    ver_data = res.json().get("data", {})
                    release = ver_data.get("release", "unknown")
                    return {"configured": True, "status": "operational", "message": f"PVE {release} OK"}
                return {"configured": True, "status": "error", "message": f"HTTP {res.status_code}"}
        except Exception as e:
            logger.warning(f"Falha de ligação ao Proxmox VE: {str(e)}")
            return {"configured": True, "status": "unreachable", "message": "Proxmox inacessível"}

    async def get_nodes(self) -> List[ProxmoxNode]:
        """Obtém a lista de nós do cluster com utilização de CPU e memória."""
        if not self.is_configured():
            return []

        nodes: List[ProxmoxNode] = []
        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.get(f"{self.url}/api2/json/nodes", headers=self._get_headers())
                if res.status_code == 200:
                    raw_nodes = res.json().get("data", [])
                    for n in raw_nodes:
                        nodes.append(ProxmoxNode(
                            node=n.get("node", "unknown"),
                            status=n.get("status", "unknown"),
                            cpu=round(float(n.get("cpu", 0.0)) * 100, 1),
                            maxcpu=int(n.get("maxcpu", 0)),
                            mem=int(n.get("mem", 0)),
                            maxmem=int(n.get("maxmem", 0)),
                            uptime=int(n.get("uptime", 0))
                        ))
        except Exception as e:
            logger.error(f"Erro ao listar nós do Proxmox: {str(e)}")

        return nodes

    async def get_resources_vms(self) -> List[ProxmoxVM]:
        """Obtém todas as máquinas virtuais (QEMU) e containers (LXC) do cluster."""
        if not self.is_configured():
            return []

        vms: List[ProxmoxVM] = []
        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.get(f"{self.url}/api2/json/cluster/resources?type=vm", headers=self._get_headers())
                if res.status_code == 200:
                    raw_res = res.json().get("data", [])
                    for item in raw_res:
                        vms.append(ProxmoxVM(
                            vmid=int(item.get("vmid", 0)),
                            name=item.get("name", f"VM-{item.get('vmid')}"),
                            status=item.get("status", "unknown"),
                            type=item.get("type", "qemu"),
                            cpu=round(float(item.get("cpu", 0.0)) * 100, 1),
                            mem=int(item.get("mem", 0)),
                            maxmem=int(item.get("maxmem", 0)),
                            node=item.get("node", "unknown")
                        ))
        except Exception as e:
            logger.error(f"Erro ao obter recursos de VMs do Proxmox: {str(e)}")

        return vms

    async def get_summary(self) -> ProxmoxSummaryData:
        """Devolve resumo agregado com nós, métricas globais de CPU/RAM e contagem de VMs."""
        if not self.is_configured():
            return ProxmoxSummaryData(configured=False, status="disabled")

        nodes = await self.get_nodes()
        if not nodes:
            health = await self.health_check()
            return ProxmoxSummaryData(
                configured=True,
                status=health["status"]
            )

        vms = await self.get_resources_vms()

        nodes_online = sum(1 for n in nodes if n.status == "online")
        total_mem = sum(n.maxmem for n in nodes)
        used_mem = sum(n.mem for n in nodes)
        avg_cpu = round(sum(n.cpu for n in nodes) / max(len(nodes), 1), 1)

        ram_used_gb = round(used_mem / (1024 ** 3), 1)
        ram_total_gb = round(total_mem / (1024 ** 3), 1)
        ram_percent = round((used_mem / total_mem) * 100, 1) if total_mem > 0 else 0.0

        vms_running = sum(1 for vm in vms if vm.status == "running")

        return ProxmoxSummaryData(
            configured=True,
            status="operational",
            cluster_name="Proxmox Homelab",
            nodes_online=nodes_online,
            total_nodes=len(nodes),
            cpu_usage_percent=avg_cpu,
            ram_used_gb=ram_used_gb,
            ram_total_gb=ram_total_gb,
            ram_usage_percent=ram_percent,
            vms_running=vms_running,
            total_vms=len(vms),
            nodes=nodes,
            vms=vms
        )


proxmox_adapter = ProxmoxAdapter()

