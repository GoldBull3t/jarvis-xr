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
    """Representação de estado normalizado de uma entidade autorizada do Home Assistant."""
    entity_id: str
    state: str
    friendly_name: str
    domain: str
    area_name: Optional[str] = None
    device_class: Optional[str] = None
    icon: Optional[str] = None
    unit_of_measurement: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)
    last_updated: Optional[str] = None


class HomeSummaryData(BaseModel):
    """Resumo agregado do Home Assistant com suporte multi-domínio completo."""
    configured: bool
    status: str  # "operational", "disabled", "unreachable"
    discovery_mode: str = "all"
    active_url_used: Optional[str] = None
    primary_url: Optional[str] = None
    fallback_url: Optional[str] = None
    temperature_celsius: Optional[float] = None
    humidity_percent: Optional[float] = None
    power_consumption_watts: Optional[float] = None
    energy_consumption_kwh: Optional[float] = None
    lights_on: int = 0
    total_lights: int = 0
    switches_on: int = 0
    total_switches: int = 0
    covers_open: int = 0
    total_covers: int = 0
    media_players_active: int = 0
    total_media_players: int = 0
    binary_sensors_alert: int = 0
    total_binary_sensors: int = 0
    cameras_count: int = 0
    scenes_count: int = 0
    climates_count: int = 0
    domains_summary: Dict[str, int] = Field(default_factory=dict)
    areas: List[str] = Field(default_factory=list)
    authorized_entities: List[EntityState] = Field(default_factory=list)
    low_battery_devices: List[Dict[str, Any]] = Field(default_factory=list)
    low_battery_count: int = 0
    open_perimeters: List[str] = Field(default_factory=list)


class ActionLightRequest(BaseModel):
    entity_id: str = Field(description="ID da entidade (ex: light.escritorio)")
    action: str = Field(default="toggle", description="Ação permitida: 'on', 'off' ou 'toggle'")
    brightness: Optional[int] = Field(default=None, ge=0, le=255, description="Brilho entre 0 e 255")
    color_temp: Optional[int] = Field(default=None, description="Mireds de temperatura de cor")
    rgb_color: Optional[List[int]] = Field(default=None, description="Lista [R, G, B]")


class ActionSwitchRequest(BaseModel):
    entity_id: str = Field(description="ID do switch/tomada (ex: switch.tomada_servidor)")
    action: str = Field(default="toggle", description="Ação permitida: 'on', 'off' ou 'toggle'")


class ActionClimateRequest(BaseModel):
    entity_id: str = Field(description="ID do termostato/AC (ex: climate.ac_escritorio)")
    action: str = Field(default="set_temperature", description="Ação: 'set_temperature', 'set_hvac_mode' ou 'set_fan_mode'")
    temperature: Optional[float] = Field(default=None, description="Temperatura alvo em °C")
    hvac_mode: Optional[str] = Field(default=None, description="Modo: 'heat', 'cool', 'fan_only', 'auto', 'off'")
    fan_mode: Optional[str] = Field(default=None, description="Modo de ventilador")


class ActionCoverRequest(BaseModel):
    entity_id: str = Field(description="ID do estore/cortina (ex: cover.estore_sala)")
    action: str = Field(default="toggle", description="Ação: 'open', 'close', 'stop', 'toggle', 'set_position'")
    position: Optional[int] = Field(default=None, ge=0, le=100, description="Posição de 0 a 100%")


class ActionMediaPlayerRequest(BaseModel):
    entity_id: str = Field(description="ID do media player (ex: media_player.sala_tv)")
    action: str = Field(default="play_pause", description="Ação: 'play', 'pause', 'play_pause', 'next', 'previous', 'volume_set', 'mute'")
    volume_level: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Volume entre 0.0 e 1.0")


class ActionSceneRequest(BaseModel):
    entity_id: str = Field(description="ID da cena autorizada (ex: scene.modo_cinema)")


class ActionScriptRequest(BaseModel):
    entity_id: str = Field(description="ID do script (ex: script.ligar_tv)")
    variables: Optional[Dict[str, Any]] = Field(default=None, description="Variáveis opcionais para o script")


class ActionLockRequest(BaseModel):
    entity_id: str = Field(description="ID da fechadura (ex: lock.porta_principal)")
    action: str = Field(default="lock", description="Ação: 'lock' ou 'unlock'")
    code: Optional[str] = Field(default=None, description="Código PIN de segurança se exigido")


class ActionFanRequest(BaseModel):
    entity_id: str = Field(description="ID da ventoinha (ex: fan.quarto)")
    action: str = Field(default="toggle", description="Ação: 'turn_on', 'turn_off', 'toggle', 'set_percentage'")
    percentage: Optional[int] = Field(default=None, ge=0, le=100, description="Velocidade de 0 a 100%")


class ActionVacuumRequest(BaseModel):
    entity_id: str = Field(description="ID do aspirador (ex: vacuum.aspirador_sala)")
    action: str = Field(default="start", description="Ação: 'start', 'pause', 'stop', 'return_to_base'")


class ActionAutomationRequest(BaseModel):
    entity_id: str = Field(description="ID da automação (ex: automation.luzes_noite)")
    action: str = Field(default="trigger", description="Ação: 'trigger', 'turn_on', 'turn_off'")


class ActionGenericEntityRequest(BaseModel):
    entity_id: str
    domain: str
    service: str
    service_data: Optional[Dict[str, Any]] = Field(default=None)


class CameraEntityInfo(BaseModel):
    entity_id: str
    friendly_name: str
    state: str
    area_name: Optional[str] = None


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
    ip_address: Optional[str] = None
    is_manageable: bool = False


class ProxmoxStorageItem(BaseModel):
    storage: str
    type: str
    used_gb: float
    total_gb: float
    percent: float


class ProxmoxBackupStatus(BaseModel):
    last_backup_time: Optional[str] = None
    status: str = "unknown"  # "ok", "error", "running", "unknown"
    message: str = "Nenhum registo recente"


class ProxmoxVMActionRequest(BaseModel):
    vmid: int = Field(description="ID da máquina virtual ou container")
    action: str = Field(description="Ação permitida: 'start', 'shutdown' ou 'reboot'")
    confirmed: bool = Field(default=False, description="Confirmação explícita da operação")


class PresenceUpdateRequest(BaseModel):
    active: bool = Field(description="Indica se o utilizador está imerso em VR/AR")
    device: str = Field(default="Meta Quest 3S", description="Identificador do dispositivo")


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
    total_disk_read_mbs: float = 0.0
    total_disk_write_mbs: float = 0.0
    total_net_in_mbs: float = 0.0
    total_net_out_mbs: float = 0.0
    iops: int = 0
    nodes: List[ProxmoxNode] = Field(default_factory=list)
    vms: List[ProxmoxVM] = Field(default_factory=list)
    storage_pools: List[ProxmoxStorageItem] = Field(default_factory=list)
    backup_status: Optional[ProxmoxBackupStatus] = None
    disks: List[Dict[str, Any]] = Field(default_factory=list)


# --- SCHEMAS DE DNS (PI-HOLE / ADGUARD) (FASE 5) ---

class DnsSummaryData(BaseModel):
    configured: bool
    provider: str  # "pihole", "adguard", "none"
    status: str    # "operational", "disabled", "unreachable"
    queries_today: int = 0
    blocked_today: int = 0
    block_percentage: float = 0.0
    clients_active: int = 0
    avg_processing_time_ms: float = 0.0
    top_blocked_domains: List[Dict[str, Any]] = Field(default_factory=list)
    top_queried_domains: List[Dict[str, Any]] = Field(default_factory=list)
    top_clients: List[Dict[str, Any]] = Field(default_factory=list)
    total_rules_count: int = 0
    active_filters_count: int = 0
    dns_rewrites_count: int = 0


# --- SCHEMAS OPENWRT / NANOPI R3S ---

class OpenWrtInterfaceStats(BaseModel):
    name: str
    up: bool = True
    ip: Optional[str] = None
    mac: Optional[str] = None
    rx_bytes: int = 0
    tx_bytes: int = 0
    rx_rate_mbps: float = 0.0
    tx_rate_mbps: float = 0.0


class OpenWrtSummaryData(BaseModel):
    configured: bool
    status: str = "disabled"  # "operational", "disabled", "unreachable"
    model: str = "FriendlyElec NanoPi R3S"
    hostname: str = "OpenWrt"
    kernel_version: Optional[str] = None
    firmware_version: Optional[str] = None
    uptime_seconds: int = 0
    soc_temperature_celsius: Optional[float] = None
    load_avg: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    ram_used_mb: float = 0.0
    ram_total_mb: float = 0.0
    ram_usage_percent: float = 0.0
    wan_download_mbps: float = 0.0
    wan_upload_mbps: float = 0.0
    wan_ip: Optional[str] = None
    wan_gateway: Optional[str] = None
    dhcp_leases_count: int = 0
    active_connections_count: int = 0
    interfaces: List[OpenWrtInterfaceStats] = Field(default_factory=list)


# --- SCHEMAS DE TELEMETRIA DO HEADSET / WEBXR ---

class HeadsetTelemetry(BaseModel):
    battery_level: Optional[float] = None
    is_charging: Optional[bool] = None
    fps: Optional[float] = None
    frame_time_ms: Optional[float] = None
    controller_battery_left: Optional[float] = None
    controller_battery_right: Optional[float] = None


# --- SCHEMAS DE SERVIÇOS DO HOMELAB (FASE 5) ---

class ServiceHealthItem(BaseModel):
    name: str
    url: str
    status: str  # "online", "offline", "degraded"
    latency_ms: Optional[int] = None
    last_checked: str
    error_message: Optional[str] = None


# --- SCHEMAS DE DIAGNÓSTICO DO HOMELAB (PILAR 4) ---

class DiagnosticCheckItem(BaseModel):
    service: str
    status: str  # "ok", "warning", "error", "disabled"
    latency_ms: Optional[float] = None
    endpoint: Optional[str] = None
    message: str
    details: Optional[Dict[str, Any]] = None


class FullDiagnosticsData(BaseModel):
    timestamp: datetime = Field(default_factory=utc_now)
    all_healthy: bool
    checks: List[DiagnosticCheckItem]
    system_info: Dict[str, Any]

