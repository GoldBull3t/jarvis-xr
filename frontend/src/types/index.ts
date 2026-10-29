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
  attributes: Record<string, any>;
  last_updated?: string;
}

export interface HomeSummaryData {
  configured: boolean;
  status: 'operational' | 'disabled' | 'unreachable';
  temperature_celsius?: number | null;
  humidity_percent?: number | null;
  lights_on: number;
  total_lights: number;
  switches_on: number;
  total_switches: number;
  authorized_entities: EntityState[];
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

