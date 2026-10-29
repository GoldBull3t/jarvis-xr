/**
 * Definições de tipos TypeScript do JARVIS XR Frontend
 */

export interface APIResponse<T = any> {
  status: 'ok' | 'error';
  data: T;
  error?: string | null;
  timestamp: string;
}

export interface HealthData {
  service: string;
  version: string;
  status: string;
  environment: string;
}

export interface IntegrationStatus {
  name: string;
  enabled: boolean;
  configured: boolean;
  status: 'operational' | 'disabled' | 'error' | 'unreachable';
  details?: string;
}

export interface SystemStatusData {
  overall_status: 'operational' | 'degraded' | 'critical';
  integrations: IntegrationStatus[];
  active_services_count: number;
  uptime_seconds: number;
}

export interface EntityState {
  entity_id: string;
  state: string;
  friendly_name: string;
  domain: string;
  area_name?: string | null;
  device_class?: string | null;
  icon?: string | null;
  unit_of_measurement?: string | null;
  attributes: Record<string, any>;
  last_updated?: string;
}

export interface CameraEntityInfo {
  entity_id: string;
  friendly_name: string;
  state: string;
  area_name?: string | null;
}

export interface HomeSummaryData {
  configured: boolean;
  status: 'operational' | 'disabled' | 'unreachable';
  discovery_mode?: string;
  active_url_used?: string | null;
  primary_url?: string | null;
  fallback_url?: string | null;
  temperature_celsius?: number | null;
  humidity_percent?: number | null;
  power_consumption_watts?: number | null;
  energy_consumption_kwh?: number | null;
  lights_on: number;
  total_lights: number;
  switches_on: number;
  total_switches: number;
  covers_open?: number;
  total_covers?: number;
  media_players_active?: number;
  total_media_players?: number;
  binary_sensors_alert?: number;
  total_binary_sensors?: number;
  cameras_count?: number;
  scenes_count?: number;
  climates_count?: number;
  domains_summary?: Record<string, number>;
  areas?: string[];
  authorized_entities: EntityState[];
}

export interface LightActionParams {
  entity_id: string;
  action: 'on' | 'off' | 'toggle';
  brightness?: number;
  color_temp?: number;
  rgb_color?: number[];
}

export interface ClimateActionParams {
  entity_id: string;
  action: 'set_temperature' | 'set_hvac_mode' | 'set_fan_mode';
  temperature?: number;
  hvac_mode?: string;
  fan_mode?: string;
}

export interface CoverActionParams {
  entity_id: string;
  action: 'open' | 'close' | 'stop' | 'toggle' | 'set_position';
  position?: number;
}

export interface MediaPlayerActionParams {
  entity_id: string;
  action: 'play' | 'pause' | 'play_pause' | 'next' | 'previous' | 'volume_set' | 'mute';
  volume_level?: number;
}

export interface LockActionParams {
  entity_id: string;
  action: 'lock' | 'unlock';
  code?: string;
}

export interface FanActionParams {
  entity_id: string;
  action: 'turn_on' | 'turn_off' | 'toggle' | 'set_percentage';
  percentage?: number;
}

export interface VacuumActionParams {
  entity_id: string;
  action: 'start' | 'pause' | 'stop' | 'return_to_base';
}

export interface AutomationActionParams {
  entity_id: string;
  action: 'trigger' | 'turn_on' | 'turn_off';
}

export interface ActionExecutionResult {
  success: boolean;
  entity_id: string;
  new_state: string;
  message: string;
}

export interface ProxmoxNode {
  node: string;
  status: string;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  uptime: number;
}

export interface ProxmoxVM {
  vmid: number;
  name: string;
  status: string;
  type: string;
  cpu: number;
  mem: number;
  maxmem: number;
  node: string;
  is_manageable?: boolean;
}

export interface ProxmoxStorageItem {
  storage: string;
  type: string;
  used_gb: number;
  total_gb: number;
  percent: number;
}

export interface ProxmoxBackupStatus {
  last_backup_time?: string | null;
  status: string;
  message: string;
}

export interface ProxmoxSummaryData {
  configured: boolean;
  status: 'operational' | 'disabled' | 'unreachable';
  cluster_name: string;
  nodes_online: number;
  total_nodes: number;
  cpu_usage_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_usage_percent: number;
  vms_running: number;
  total_vms: number;
  nodes: ProxmoxNode[];
  vms: ProxmoxVM[];
  storage_pools?: ProxmoxStorageItem[];
  backup_status?: ProxmoxBackupStatus | null;
}

export interface DnsSummaryData {
  configured: boolean;
  provider: string;
  status: 'operational' | 'disabled' | 'unreachable';
  queries_today: number;
  blocked_today: number;
  block_percentage: number;
  clients_active: number;
}

export interface ServiceHealthItem {
  name: string;
  url: string;
  status: 'online' | 'offline' | 'degraded';
  latency_ms?: number | null;
  last_checked: string;
  error_message?: string | null;
}

export interface DemoStatusData {
  is_mock: boolean;
  label: string;
  home: {
    temperature_celsius: number;
    humidity_percent: number;
    lights_on: number;
    total_lights: number;
    entities: Array<{
      id: string;
      name: string;
      state: string;
      type: 'light' | 'switch';
    }>;
  };
  proxmox: {
    cluster_name: string;
    nodes_online: number;
    total_nodes: number;
    cpu_usage_percent: number;
    ram_usage_percent: number;
    ram_used_gb: number;
    ram_total_gb: number;
    vms_running: number;
    total_vms: number;
    vms: Array<{
      vmid: number;
      name: string;
      status: string;
      cpu: number;
      mem_mb: number;
    }>;
  };
  dns: {
    provider: string;
    status: string;
    queries_today: number;
    blocked_today: number;
    block_percentage: number;
    clients_active: number;
  };
  services: Array<{
    name: string;
    url: string;
    status: 'online' | 'offline' | 'degraded';
    latency_ms: number;
  }>;
}

export interface JarvisCommand {
  id: string;
  phrases: string[];
  description: string;
  category: string;
  requires_confirmation: boolean;
}

export interface CommandExecuteResult {
  command_id: string;
  action_executed: string;
  spoken_feedback: string;
  ui_action?: string;
  data?: Record<string, any>;
}

export interface DiagnosticCheckItem {
  service: string;
  status: 'ok' | 'warning' | 'error' | 'disabled';
  latency_ms?: number | null;
  endpoint?: string | null;
  message: string;
  details?: Record<string, any> | null;
}

export interface FullDiagnosticsData {
  timestamp: string;
  all_healthy: boolean;
  checks: DiagnosticCheckItem[];
  system_info: {
    environment: string;
    auth_required: boolean;
    cors_origins: string[];
    hostname: string;
  };
}


