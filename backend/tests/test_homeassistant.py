"""Testes unitários e de integração do módulo Home Assistant (Fase 4)."""
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)
AUTH_HEADER = {"Authorization": f"Bearer {settings.JARVIS_API_KEY}"}


def test_home_summary_when_disabled():
    """Valida se o resumo responde graciosamente quando o Home Assistant não está configurado."""
    with patch("app.integrations.homeassistant.ha_adapter.is_configured", return_value=False):
        response = client.get("/api/home/summary", headers=AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["data"]["configured"] is False
        assert data["data"]["status"] == "disabled"


def test_action_light_unauthorized_entity():
    """Valida que tentar controlar uma entidade fora da allowlist devolve estritamente 403 Forbidden."""
    payload = {
        "entity_id": "light.quarto_proibido_nao_autorizado",
        "action": "toggle"
    }
    response = client.post("/api/home/actions/light", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 403
    assert "não está na allowlist" in response.json()["detail"]


def test_action_switch_unauthorized_entity():
    """Valida que tentar controlar um switch fora da allowlist devolve 403 Forbidden."""
    payload = {
        "entity_id": "switch.disjuntor_geral_proibido",
        "action": "on"
    }
    response = client.post("/api/home/actions/switch", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 403
    assert "não está na allowlist" in response.json()["detail"]


def test_action_scene_unauthorized_entity():
    """Valida que tentar ativar uma cena fora da allowlist devolve 403 Forbidden."""
    payload = {
        "entity_id": "scene.cena_desconhecida"
    }
    response = client.post("/api/home/actions/scene", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 403
    assert "não está na allowlist" in response.json()["detail"]


@pytest.mark.asyncio
async def test_control_light_authorized_success():
    """Valida o fluxo de controlo de luz autorizada com mock de resposta do Home Assistant."""
    with patch("app.integrations.homeassistant.ha_adapter._is_entity_authorized", return_value=True), \
         patch("app.integrations.homeassistant.ha_adapter.is_configured", return_value=True), \
         patch("httpx.AsyncClient.post") as mock_post, \
         patch("httpx.AsyncClient.get") as mock_get:

        # Mock da chamada do serviço de luz
        mock_post.return_value.status_code = 200
        mock_post.return_value.json = lambda: [{"entity_id": "light.escritorio", "state": "on"}]

        # Mock da chamada de verificação de estado
        mock_get.return_value.status_code = 200
        mock_get.return_value.json = lambda: {"entity_id": "light.escritorio", "state": "on"}

        payload = {
            "entity_id": "light.escritorio",
            "action": "on",
            "brightness": 200
        }
        response = client.post("/api/home/actions/light", json=payload, headers=AUTH_HEADER)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["data"]["success"] is True
        assert data["data"]["entity_id"] == "light.escritorio"
        assert data["data"]["new_state"] == "on"

