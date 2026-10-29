"""Testes unitários e de integração das rotas do backend."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)
VALID_AUTH_HEADER = {"Authorization": f"Bearer {settings.JARVIS_API_KEY}"}
INVALID_AUTH_HEADER = {"Authorization": "Bearer token-invalido-errado"}


def test_health_endpoint():
    """Valida se o healthcheck público responde 200 OK sem necessidade de autenticação."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"]["service"] == "jarvis-xr-backend"
    assert data["data"]["status"] == "healthy"
    assert "timestamp" in data


def test_status_endpoint_unauthorized():
    """Valida rejeição com 401 quando o token não é fornecido ou é incorreto."""
    # Sem header
    res1 = client.get("/api/status")
    assert res1.status_code == 401
    
    # Com token inválido
    res2 = client.get("/api/status", headers=INVALID_AUTH_HEADER)
    assert res2.status_code == 401


def test_status_endpoint_authorized():
    """Valida resposta do estado do sistema com token válido."""
    response = client.get("/api/status", headers=VALID_AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "overall_status" in data["data"]
    assert "integrations" in data["data"]
    assert isinstance(data["data"]["integrations"], list)


def test_demo_status_endpoint():
    """Valida se os dados de demonstração da Fase 2 são estruturados e explicitamente rotulados."""
    response = client.get("/api/status/demo", headers=VALID_AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"]["is_mock"] is True
    assert "[DEMO/MOCK DATA — FASE 2]" in data["data"]["label"]
    assert "home" in data["data"]
    assert "proxmox" in data["data"]
    assert "dns" in data["data"]
    assert "services" in data["data"]


def test_commands_catalog():
    """Valida listagem do catálogo determinístico de comandos."""
    response = client.get("/api/commands", headers=VALID_AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    commands = data["data"]
    assert len(commands) >= 5
    ids = [c["id"] for c in commands]
    assert "cmd_show_home" in ids
    assert "cmd_show_proxmox" in ids
    assert "cmd_show_network" in ids


def test_command_execution_phrase_match():
    """Valida que uma frase falada é mapeada deterministamente para a ação correta."""
    payload = {
        "raw_phrase": "JARVIS, mostra os servidores por favor"
    }
    response = client.post("/api/commands/execute", json=payload, headers=VALID_AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"]["command_id"] == "cmd_show_proxmox"
    assert data["data"]["ui_action"] == "open_panel_proxmox"
    assert "Servidores Proxmox" in data["data"]["spoken_feedback"]


def test_unknown_command_deterministic_fallback():
    """Valida que comandos desconhecidos não produzem alucinações e devolvem ajuda."""
    payload = {
        "raw_phrase": "JARVIS, conta uma piada ou faz um poema"
    }
    response = client.post("/api/commands/execute", json=payload, headers=VALID_AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert "não reconhecido" in data["error"]
    assert data["data"]["ui_action"] == "show_help"


def test_command_turn_on_light_phrase():
    """Valida mapeamento da frase de ligar luz."""
    payload = {"raw_phrase": "JARVIS por favor liga a luz do escritorio"}
    response = client.post("/api/commands/execute", json=payload, headers=VALID_AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"]["command_id"] == "cmd_light_office_on"


def test_command_close_panels_phrase():
    """Valida comando de recolher painéis holográficos."""
    payload = {"raw_phrase": "JARVIS fecha os paineis"}
    response = client.post("/api/commands/execute", json=payload, headers=VALID_AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"]["command_id"] == "cmd_close_panels"
    assert data["data"]["ui_action"] == "close_all_panels"


def test_command_stop_listening_phrase():
    """Valida comando de terminar escuta."""
    payload = {"raw_phrase": "para de ouvir"}
    response = client.post("/api/commands/execute", json=payload, headers=VALID_AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["data"]["command_id"] == "cmd_stop_listening"
    assert data["data"]["ui_action"] == "stop_listening"


