"""Schemas Pydantic para validação e serialização de dados do JARVIS XR."""
from datetime import datetime, timezone
from typing import Any, Optional, List, Dict
from pydantic import BaseModel, Field


def utc_now() -> datetime:
    """Retorna timestamp UTC atual com fuso horário explícito."""
    return datetime.now(timezone.utc)


class APIResponse(BaseModel):
    """Estrutura normalizada e previsível de resposta da API."""
    status: str = Field(default="ok", description="Status da resposta: 'ok' ou 'error'")
    data: Optional[Any] = Field(default=None, description="Dados da resposta")
    error: Optional[str] = Field(default=None, description="Mensagem de erro estruturada")
    timestamp: datetime = Field(default_factory=utc_now, description="Carimbo de data/hora UTC")


class HealthData(BaseModel):
    service: str = "jarvis-xr-backend"
    version: str = "0.1.0"
    status: str = "healthy"
    environment: str


class IntegrationStatus(BaseModel):
    name: str
    enabled: bool
    configured: bool
    status: str  # "operational", "disabled", "error", "unreachable"
    details: Optional[str] = None


class SystemStatusData(BaseModel):
    overall_status: str  # "operational", "degraded", "critical"
    integrations: List[IntegrationStatus]
    active_services_count: int
    uptime_seconds: float


class CommandDefinition(BaseModel):
    id: str
    phrases: List[str]
    description: str
    category: str
    requires_confirmation: bool = False


class CommandExecuteRequest(BaseModel):
    command_id: Optional[str] = None
    raw_phrase: Optional[str] = None
    confirmed: bool = False


class CommandExecuteResult(BaseModel):
    command_id: str
    action_executed: str
    spoken_feedback: str
    ui_action: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


# --- SCHEMAS ESPECÍFICOS DO HOME ASSISTANT (FASE 4) ---

class EntityState(BaseModel):
    """Representação de estado normalizado de uma entidade autorizada."""
    entity_id: str
    state: str
    friendly_name: str
    domain: str
    attributes: Dict[str, Any] = Field(default_factory=dict)
    last_updated: Optional[str] = None


class HomeSummaryData(BaseModel):
    """Resumo agregado do Home Assistant."""
    configured: bool
    status: str  # "operational", "disabled", "unreachable"
    temperature_celsius: Optional[float] = None
    humidity_percent: Optional[float] = None
    lights_on: int = 0
    total_lights: int = 0
    switches_on: int = 0
    total_switches: int = 0
    authorized_entities: List[EntityState] = Field(default_factory=list)


class ActionLightRequest(BaseModel):
    entity_id: str = Field(description="ID da entidade authorized (ex: light.escritorio)")
    action: str = Field(default="toggle", description="Ação permitida: 'on', 'off' ou 'toggle'")
    brightness: Optional[int] = Field(default=None, ge=0, le=255, description="Brilho entre 0 e 255")


class ActionSwitchRequest(BaseModel):
    entity_id: str = Field(description="ID do switch autorizado (ex: switch.tomada_servidor)")
    action: str = Field(default="toggle", description="Ação permitida: 'on', 'off' ou 'toggle'")


class ActionSceneRequest(BaseModel):
    entity_id: str = Field(description="ID da cena autorizada (ex: scene.modo_cinema)")


class ActionExecutionResult(BaseModel):
    success: bool
    entity_id: str
    new_state: str
    message: str


# --- SCHEMAS ESPECÍFICOS DO PROXMOX VE (FASE 5) ---

class ProxmoxNode(BaseModel):
    node: str
    status: str
    cpu: float
    maxcpu: int
    mem: int
    maxmem: int
    uptime: int


class ProxmoxVM(BaseModel):
    vmid: int
    name: str
    status: str
    type: str  # "qemu" ou "lxc"
    cpu: float
    mem: int
    maxmem: int
    node: str


class ProxmoxSummaryData(BaseModel):
    configured: bool
    status: str  # "operational", "disabled", "unreachable"
    cluster_name: str = "cluster"
    nodes_online: int = 0
    total_nodes: int = 0
    cpu_usage_percent: float = 0.0
    ram_used_gb: float = 0.0
    ram_total_gb: float = 0.0
    ram_usage_percent: float = 0.0
    vms_running: int = 0
    total_vms: int = 0
    nodes: List[ProxmoxNode] = Field(default_factory=list)
    vms: List[ProxmoxVM] = Field(default_factory=list)


# --- SCHEMAS DE DNS (PI-HOLE / ADGUARD) (FASE 5) ---

class DnsSummaryData(BaseModel):
    configured: bool
    provider: str  # "pihole", "adguard", "none"
    status: str    # "operational", "disabled", "unreachable"
    queries_today: int = 0
    blocked_today: int = 0
    block_percentage: float = 0.0
    clients_active: int = 0


# --- SCHEMAS DE SERVIÇOS DO HOMELAB (FASE 5) ---

class ServiceHealthItem(BaseModel):
    name: str
    url: str
    status: str  # "online", "offline", "degraded"
    latency_ms: Optional[int] = None
    last_checked: str
    error_message: Optional[str] = None

