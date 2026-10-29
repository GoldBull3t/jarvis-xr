"""Testes unitários e de integração dos módulos Proxmox VE, DNS e Serviços (Fase 5)."""
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)
AUTH_HEADER = {"Authorization": f"Bearer {settings.JARVIS_API_KEY}"}


def test_proxmox_summary_when_disabled():
    """Valida se o Proxmox responde graciosamente quando desativado em .env."""
    with patch("app.integrations.proxmox.proxmox_adapter.is_configured", return_value=False):
        response = client.get("/api/proxmox/summary", headers=AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["data"]["configured"] is False
        assert data["data"]["status"] == "disabled"


def test_proxmox_summary_mocked_success():
    """Valida o cálculo consolidado de métricas (CPU, RAM, VMs) com mock da API Proxmox."""
    fake_nodes = [
        {"node": "pve1", "status": "online", "cpu": 0.15, "maxcpu": 8, "mem": 16 * 1024**3, "maxmem": 32 * 1024**3, "uptime": 10000}
    ]
    fake_vms = [
        {"vmid": 101, "name": "home-assistant", "status": "running", "type": "qemu", "cpu": 0.05, "mem": 4 * 1024**3, "maxmem": 4 * 1024**3, "node": "pve1"},
        {"vmid": 102, "name": "jarvis-xr", "status": "running", "type": "qemu", "cpu": 0.04, "mem": 2 * 1024**3, "maxmem": 2 * 1024**3, "node": "pve1"}
    ]

    with patch("app.integrations.proxmox.proxmox_adapter.is_configured", return_value=True), \
         patch("httpx.AsyncClient.get") as mock_get:

        def get_side_effect(url, **kwargs):
            mock_res = AsyncMock()
            mock_res.status_code = 200
            if "nodes" in url:
                mock_res.json = lambda: {"data": fake_nodes}
            elif "resources" in url:
                mock_res.json = lambda: {"data": fake_vms}
            return mock_res

        mock_get.side_effect = get_side_effect

        response = client.get("/api/proxmox/summary", headers=AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        pve = data["data"]
        assert pve["configured"] is True
        assert pve["nodes_online"] == 1
        assert pve["vms_running"] == 2
        assert pve["cpu_usage_percent"] == 15.0
        assert pve["ram_used_gb"] == 16.0
        assert pve["ram_total_gb"] == 32.0


def test_dns_summary_when_disabled():
    """Valida resposta do DNS quando configurado como 'none'."""
    with patch("app.integrations.dns.dns_adapter.is_configured", return_value=False):
        response = client.get("/api/dns/summary", headers=AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["data"]["configured"] is False


def test_pihole_mocked_success():
    """Valida normalização das métricas do Pi-hole."""
    fake_pihole = {
        "status": "enabled",
        "dns_queries_today": 25000,
        "ads_blocked_today": 5000,
        "ads_percentage_today": 20.0,
        "unique_clients": 12
    }

    with patch.object(settings, "DNS_PROVIDER", "pihole"), \
         patch("app.integrations.dns.dns_adapter.is_configured", return_value=True), \
         patch("httpx.AsyncClient.get") as mock_get:

        mock_get.return_value.status_code = 200
        mock_get.return_value.json = lambda: fake_pihole

        response = client.get("/api/dns/summary", headers=AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        dns = data["data"]
        assert dns["configured"] is True
        assert dns["queries_today"] == 25000
        assert dns["blocked_today"] == 5000
        assert dns["block_percentage"] == 20.0
        assert dns["clients_active"] == 12


def test_services_healthcheck_empty_or_mocked():
    """Valida o endpoint de serviços sem disparar SSRF."""
    response = client.get("/api/services", headers=AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert isinstance(data["data"], list)

