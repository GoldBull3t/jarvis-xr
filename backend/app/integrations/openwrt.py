"""Adaptador de telemetria em tempo real para OpenWrt (NanoPi R3S Gateway)."""
import time
import logging
from typing import Dict, Any, Optional, List, Tuple
import httpx

from app.config import settings
from app.integrations.base import BaseAdapter
from app.schemas import OpenWrtSummaryData, OpenWrtInterfaceStats

logger = logging.getLogger("jarvis.integrations.openwrt")


class OpenWrtAdapter(BaseAdapter):
    """Adaptador de comunicação JSON-RPC / ubus para routers OpenWrt."""

    def __init__(self):
        super().__init__(name="OpenWrt Gateway")
        self.session_token: Optional[str] = None
        self.session_expiry: float = 0
        self._prev_wan_stats: Optional[Tuple[int, int, float]] = None  # (rx, tx, time)

    def is_configured(self) -> bool:
        """Verifica se o router OpenWrt está configurado no .env."""
        return bool(settings.OPENWRT_ENABLED and settings.OPENWRT_URL)

    def _get_base_url(self) -> str:
        return (settings.OPENWRT_URL or "http://192.168.1.1").rstrip("/")

    async def _login(self, client: httpx.AsyncClient) -> Optional[str]:
        """Obtém token de sessão ubus via JSON-RPC."""
        now = time.time()
        if self.session_token and now < self.session_expiry:
            return self.session_token

        login_url = f"{self._get_base_url()}/ubus"
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "call",
            "params": [
                "00000000000000000000000000000000",
                "session",
                "login",
                {
                    "username": settings.OPENWRT_USERNAME or "root",
                    "password": settings.OPENWRT_PASSWORD or ""
                }
            ]
        }

        try:
            res = await client.post(login_url, json=payload, timeout=settings.OPENWRT_TIMEOUT_SECONDS)
            if res.status_code == 200:
                data = res.json()
                result = data.get("result", [])
                if len(result) > 1 and isinstance(result[1], dict):
                    token = result[1].get("ubus_rpc_session")
                    if token:
                        self.session_token = token
                        self.session_expiry = now + 300  # 5 minutos de validade
                        return token
        except Exception as e:
            logger.debug(f"Falha no login ubus OpenWrt: {e}")

        # Fallback LuCI RPC
        try:
            luci_url = f"{self._get_base_url()}/cgi-bin/luci/rpc/auth"
            res = await client.post(
                luci_url,
                json={"id": 1, "method": "login", "params": [settings.OPENWRT_USERNAME or "root", settings.OPENWRT_PASSWORD or ""]},
                timeout=settings.OPENWRT_TIMEOUT_SECONDS
            )
            if res.status_code == 200:
                token = res.json().get("result")
                if token:
                    self.session_token = token
                    self.session_expiry = now + 300
                    return token
        except Exception as e:
            logger.debug(f"Falha no login luci/rpc OpenWrt: {e}")

        return None

    async def _ubus_call(self, client: httpx.AsyncClient, token: str, subsystem: str, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Executa chamada genérica RPC ubus."""
        url = f"{self._get_base_url()}/ubus"
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "call",
            "params": [
                token,
                subsystem,
                method,
                params or {}
            ]
        }
        try:
            res = await client.post(url, json=payload, timeout=settings.OPENWRT_TIMEOUT_SECONDS)
            if res.status_code == 200:
                data = res.json()
                result = data.get("result", [])
                if len(result) > 1:
                    return result[1]
                return result[0] if result else None
        except Exception as e:
            logger.debug(f"Erro em ubus_call({subsystem}, {method}): {e}")
        return None

    async def health_check(self) -> Dict[str, Any]:
        """Testa a conectividade com o NanoPi R3S."""
        if not self.is_configured():
            return {"configured": False, "status": "disabled", "message": "OpenWrt inativo em .env"}

        t0 = time.perf_counter()
        async with httpx.AsyncClient(verify=settings.OPENWRT_VERIFY_SSL, timeout=settings.OPENWRT_TIMEOUT_SECONDS) as client:
            try:
                token = await self._login(client)
                lat_ms = round((time.perf_counter() - t0) * 1000, 1)
                if token:
                    return {"configured": True, "status": "operational", "latency_ms": lat_ms, "message": "OpenWrt Ubus autenticado"}
                # Tenta ping HTTP simples na página de login
                res = await client.get(self._get_base_url())
                if res.status_code in [200, 301, 302, 403]:
                    return {"configured": True, "status": "operational", "latency_ms": lat_ms, "message": "OpenWrt online (HTTP)"}
                return {"configured": True, "status": "error", "latency_ms": lat_ms, "message": f"HTTP {res.status_code}"}
            except Exception as e:
                return {"configured": True, "status": "unreachable", "message": str(e)[:60]}

    async def get_summary(self) -> OpenWrtSummaryData:
        """Recolhe a telemetria profunda agregada do NanoPi R3S."""
        if not self.is_configured():
            return OpenWrtSummaryData(configured=False, status="disabled")

        async with httpx.AsyncClient(verify=settings.OPENWRT_VERIFY_SSL, timeout=settings.OPENWRT_TIMEOUT_SECONDS) as client:
            token = await self._login(client)
            if not token:
                # Tenta healthcheck mínimo se não conseguir autenticar
                try:
                    res = await client.get(self._get_base_url())
                    if res.status_code < 500:
                        return OpenWrtSummaryData(
                            configured=True,
                            status="operational",
                            hostname="OpenWrt-NanoPi",
                            model="FriendlyElec NanoPi R3S",
                            wan_download_mbps=0.0,
                            wan_upload_mbps=0.0
                        )
                except Exception:
                    pass
                return OpenWrtSummaryData(configured=True, status="unreachable")

            # 1. Informações do sistema (Load, RAM, Uptime)
            sys_info = await self._ubus_call(client, token, "system", "info") or {}
            board_info = await self._ubus_call(client, token, "system", "board") or {}

            model = board_info.get("model") or "FriendlyElec NanoPi R3S"
            hostname = board_info.get("hostname") or "OpenWrt"
            kernel = board_info.get("kernel")
            release = board_info.get("release", {}).get("description")

            uptime = int(sys_info.get("uptime", 0))
            load_raw = sys_info.get("load", [0, 0, 0])
            # OpenWrt normaliza carga inteira a dividir por 65536
            load_avg = [round(l / 65536.0, 2) if l > 100 else float(l) for l in load_raw]

            mem = sys_info.get("memory", {})
            total_ram_mb = round(mem.get("total", 0) / (1024 * 1024), 1)
            free_ram_mb = round(mem.get("free", 0) / (1024 * 1024), 1)
            buffered_mb = round(mem.get("buffered", 0) / (1024 * 1024), 1)
            shared_mb = round(mem.get("shared", 0) / (1024 * 1024), 1)
            used_ram_mb = max(0.0, round(total_ram_mb - free_ram_mb - buffered_mb, 1)) if total_ram_mb > 0 else 0.0
            ram_pct = round((used_ram_mb / total_ram_mb) * 100, 1) if total_ram_mb > 0 else 0.0

            # 2. Temperatura do SoC Rockchip do NanoPi
            soc_temp = None
            # Em alguns modelos ubus expõe "thermal" ou sys_info["thermal"]
            thermal = await self._ubus_call(client, token, "system", "temperature") or sys_info.get("thermal", {})
            if isinstance(thermal, dict) and "temp" in thermal:
                raw_temp = float(thermal["temp"])
                soc_temp = round(raw_temp / 1000.0, 1) if raw_temp > 200 else round(raw_temp, 1)
            elif isinstance(thermal, (int, float)):
                soc_temp = round(thermal / 1000.0, 1) if thermal > 200 else round(thermal, 1)

            # 3. Interfaces de Rede e Taxa de Tráfego WAN ao vivo (Mbps)
            dev_status = await self._ubus_call(client, token, "network.device", "status") or {}
            wan_status = await self._ubus_call(client, token, "network.interface", "status", {"interface": settings.OPENWRT_WAN_INTERFACE or "wan"}) or {}

            wan_ip = None
            wan_gw = None
            if isinstance(wan_status, dict):
                ipv4 = wan_status.get("ipv4-address", [])
                if ipv4 and isinstance(ipv4, list) and len(ipv4) > 0:
                    wan_ip = ipv4[0].get("address")
                wan_gw = wan_status.get("route", [{}])[0].get("nexthop") if wan_status.get("route") else None

            # interfaces list
            interfaces: List[OpenWrtInterfaceStats] = []
            wan_rx = 0
            wan_tx = 0
            now = time.time()

            wan_if_name = settings.OPENWRT_WAN_INTERFACE or "wan"
            if isinstance(dev_status, dict):
                for dev_name, info in dev_status.items():
                    if not isinstance(info, dict):
                        continue
                    stats = info.get("statistics", {})
                    rx_bytes = int(stats.get("rx_bytes", 0))
                    tx_bytes = int(stats.get("tx_bytes", 0))
                    up = bool(info.get("up", True))

                    if dev_name in ["eth0", "eth1", wan_if_name, "br-lan"]:
                        interfaces.append(OpenWrtInterfaceStats(
                            name=dev_name,
                            up=up,
                            mac=info.get("macaddr"),
                            rx_bytes=rx_bytes,
                            tx_bytes=tx_bytes
                        ))

                    if dev_name == wan_if_name or dev_name == "eth0":
                        wan_rx = rx_bytes
                        wan_tx = tx_bytes

            # Cálculo de throughput instantâneo em Mbps
            wan_down_mbps = 0.0
            wan_up_mbps = 0.0
            if self._prev_wan_stats and (wan_rx > 0 or wan_tx > 0):
                prev_rx, prev_tx, prev_t = self._prev_wan_stats
                dt = max(1.0, now - prev_t)
                if wan_rx >= prev_rx:
                    wan_down_mbps = round(((wan_rx - prev_rx) * 8.0) / (dt * 1_000_000.0), 2)
                if wan_tx >= prev_tx:
                    wan_up_mbps = round(((wan_tx - prev_tx) * 8.0) / (dt * 1_000_000.0), 2)

            if wan_rx > 0 or wan_tx > 0:
                self._prev_wan_stats = (wan_rx, wan_tx, now)

            # 4. Conexões de Firewall e DHCP Leases
            dhcp_count = 0
            conntrack_count = 0
            luci_dhcp = await self._ubus_call(client, token, "luci-rpc", "getDHCPLeases")
            if isinstance(luci_dhcp, dict):
                dhcp_count = len(luci_dhcp.get("dhcp_leases", []))

            conn_info = await self._ubus_call(client, token, "luci-rpc", "getConntrackCount")
            if isinstance(conn_info, dict):
                conntrack_count = int(conn_info.get("count", 0))

            return OpenWrtSummaryData(
                configured=True,
                status="operational",
                model=model,
                hostname=hostname,
                kernel_version=kernel,
                firmware_version=release,
                uptime_seconds=uptime,
                soc_temperature_celsius=soc_temp,
                load_avg=load_avg,
                ram_used_mb=used_ram_mb,
                ram_total_mb=total_ram_mb,
                ram_usage_percent=ram_pct,
                wan_download_mbps=wan_down_mbps,
                wan_upload_mbps=wan_up_mbps,
                wan_ip=wan_ip,
                wan_gateway=wan_gw,
                dhcp_leases_count=dhcp_count,
                active_connections_count=conntrack_count,
                interfaces=interfaces
            )


openwrt_adapter = OpenWrtAdapter()

