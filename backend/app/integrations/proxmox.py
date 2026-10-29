"""Adaptador de monitorização oficial e exclusivo de leitura para o Proxmox VE."""
import logging
from typing import Dict, Any, List, Optional
import httpx

from app.config import settings
from app.integrations.base import BaseAdapter
from app.schemas import (
    ProxmoxNode,
    ProxmoxVM,
    ProxmoxSummaryData,
    ProxmoxStorageItem,
    ProxmoxBackupStatus,
    ActionExecutionResult
)

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
        """Gera o cabeçalho oficial de autenticação PVEAPIToken com normalização inteligente de realm."""
        token_id = self.token_id.strip()
        # Normaliza caso haja duplicidade acidental de realms (ex: user@pve@pam!token)
        if "@" in token_id and "!" in token_id:
            user_part, token_name = token_id.split("!", 1)
            parts = user_part.split("@")
            if len(parts) > 2:
                # Se 'pve' está nos realms, o realm oficial do Proxmox VE é pve (onde os API tokens são criados)
                realm = "pve" if "pve" in parts[1:] else parts[1]
                token_id = f"{parts[0]}@{realm}!{token_name}"

        return {
            "Authorization": f"PVEAPIToken={token_id}={self.token_secret.strip()}",
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
        allowed_vmids = settings.allowed_proxmox_vmids

        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.get(f"{self.url}/api2/json/cluster/resources?type=vm", headers=self._get_headers())
                if res.status_code == 200:
                    raw_res = res.json().get("data", [])
                    for item in raw_res:
                        vmid = int(item.get("vmid", 0))
                        vm_type = item.get("type", "qemu")
                        # Se a lista de VMIDs permitidos estiver vazia, todas são visíveis mas não acionáveis
                        # Se estiver definida, apenas as listadas são acionáveis
                        is_manageable = vmid in allowed_vmids if allowed_vmids else False

                        vms.append(ProxmoxVM(
                            vmid=vmid,
                            name=item.get("name", f"VM-{vmid}"),
                            status=item.get("status", "unknown"),
                            type=vm_type,
                            cpu=round(float(item.get("cpu", 0.0)) * 100, 1),
                            mem=int(item.get("mem", 0)),
                            maxmem=int(item.get("maxmem", 0)),
                            node=item.get("node", "unknown"),
                            is_manageable=is_manageable
                        ))
        except Exception as e:
            logger.error(f"Erro ao obter recursos de VMs do Proxmox: {str(e)}")

        return vms

    async def get_storage(self) -> List[ProxmoxStorageItem]:
        """Obtém o estado e capacidade de todos os pools de armazenamento (ZFS, LVM, Ceph, NFS, PBS)."""
        if not self.is_configured():
            return []

        items: List[ProxmoxStorageItem] = []
        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                # 1. Consulta prioritária em cluster/resources para obter métricas ativas de disco
                res = await client.get(f"{self.url}/api2/json/cluster/resources?type=storage", headers=self._get_headers())
                if res.status_code == 200:
                    raw_data = res.json().get("data", [])
                    for s in raw_data:
                        total = float(s.get("maxdisk", 0))
                        used = float(s.get("disk", 0))
                        used_gb = round(used / (1024 ** 3), 1)
                        total_gb = round(total / (1024 ** 3), 1)
                        pct = round((used / total * 100), 1) if total > 0 else 0.0

                        items.append(ProxmoxStorageItem(
                            storage=s.get("storage", "unknown"),
                            type=s.get("plugintype", s.get("type", "storage")),
                            used_gb=used_gb,
                            total_gb=total_gb,
                            percent=pct
                        ))

                # 2. Se cluster/resources não devolveu dados detalhados, tenta /storage
                if not items:
                    res_std = await client.get(f"{self.url}/api2/json/storage", headers=self._get_headers())
                    if res_std.status_code == 200:
                        for s in res_std.json().get("data", []):
                            total = float(s.get("total", 0))
                            used = float(s.get("used", 0))
                            used_gb = round(used / (1024 ** 3), 1)
                            total_gb = round(total / (1024 ** 3), 1)
                            pct = round((used / total * 100), 1) if total > 0 else 0.0
                            items.append(ProxmoxStorageItem(
                                storage=s.get("storage", "unknown"),
                                type=s.get("type", "dir"),
                                used_gb=used_gb,
                                total_gb=total_gb,
                                percent=pct
                            ))
        except Exception as e:
            logger.error(f"Erro ao consultar pools de armazenamento do Proxmox: {str(e)}")

        return items

    async def get_backup_status(self) -> ProxmoxBackupStatus:
        """Obtém o estado da última tarefa de backup (vzdump) do cluster."""
        if not self.is_configured():
            return ProxmoxBackupStatus(status="unknown", message="Proxmox desativado")

        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.get(f"{self.url}/api2/json/cluster/tasks", headers=self._get_headers())
                if res.status_code == 200:
                    tasks = res.json().get("data", [])
                    # Filtra tarefas de backup (type == "vzdump")
                    vzdump_tasks = [t for t in tasks if t.get("type") == "vzdump"]
                    if vzdump_tasks:
                        last_task = vzdump_tasks[0]
                        status_str = last_task.get("status", "unknown")
                        is_ok = status_str == "OK"
                        end_time = last_task.get("endtime") or last_task.get("starttime")

                        return ProxmoxBackupStatus(
                            last_backup_time=str(end_time),
                            status="ok" if is_ok else "error",
                            message=f"Último backup: {'Sucesso (OK)' if is_ok else status_str}"
                        )
                return ProxmoxBackupStatus(status="ok", message="Sem registos de erro de backup")
        except Exception as e:
            logger.warning(f"Erro ao verificar tarefas de backup: {str(e)}")
            return ProxmoxBackupStatus(status="unknown", message=str(e)[:50])

    async def control_vm(self, vmid: int, action: str, confirmed: bool = False) -> ActionExecutionResult:
        """
        Executa ações de ciclo de vida seguras numa VM/LXC autorizada.
        Ações permitidas: 'start', 'shutdown' (desligar limpo por ACPI) e 'reboot'.
        """
        if not self.is_configured():
            return ActionExecutionResult(success=False, entity_id=str(vmid), new_state="unknown", message="Proxmox não configurado")

        allowed_vmids = settings.allowed_proxmox_vmids
        if allowed_vmids and vmid not in allowed_vmids:
            return ActionExecutionResult(
                success=False,
                entity_id=str(vmid),
                new_state="unauthorized",
                message=f"A VM/LXC {vmid} não está autorizada em PROXMOX_ALLOWED_VMIDS"
            )

        if action not in ["start", "shutdown", "reboot"]:
            return ActionExecutionResult(
                success=False,
                entity_id=str(vmid),
                new_state="invalid_action",
                message=f"Ação '{action}' inválida. Use apenas start, shutdown ou reboot"
            )

        if not confirmed and action in ["shutdown", "reboot"]:
            return ActionExecutionResult(
                success=False,
                entity_id=str(vmid),
                new_state="requires_confirmation",
                message=f"Confirma que pretendes executar '{action}' na máquina virtual {vmid}?"
            )

        # Localiza o nó onde a VM está a residir
        vms = await self.get_resources_vms()
        target_vm = next((v for v in vms if v.vmid == vmid), None)
        if not target_vm:
            return ActionExecutionResult(success=False, entity_id=str(vmid), new_state="not_found", message=f"VM {vmid} não encontrada no cluster")

        vm_type = "lxc" if target_vm.type == "lxc" else "qemu"
        api_path = f"{self.url}/api2/json/nodes/{target_vm.node}/{vm_type}/{vmid}/status/{action}"

        try:
            async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
                res = await client.post(api_path, headers=self._get_headers())
                if res.status_code == 200:
                    action_pt = "iniciada" if action == "start" else ("a desligar" if action == "shutdown" else "a reiniciar")
                    return ActionExecutionResult(
                        success=True,
                        entity_id=str(vmid),
                        new_state=action,
                        message=f"Máquina virtual {vmid} ({target_vm.name}) {action_pt} com sucesso."
                    )
                return ActionExecutionResult(
                    success=False,
                    entity_id=str(vmid),
                    new_state="error",
                    message=f"Proxmox HTTP {res.status_code}: {res.text[:80]}"
                )
        except Exception as e:
            logger.error(f"Erro ao executar '{action}' na VM {vmid}: {str(e)}")
            return ActionExecutionResult(success=False, entity_id=str(vmid), new_state="error", message=f"Falha de rede: {str(e)}")

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
        storage_pools = await self.get_storage()
        backup_status = await self.get_backup_status()

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
            vms=vms,
            storage_pools=storage_pools,
            backup_status=backup_status
        )


proxmox_adapter = ProxmoxAdapter()
pve_adapter = proxmox_adapter

