/**
 * Cliente de comunicação HTTP seguro com o Backend JARVIS XR
 */
import type {
  APIResponse,
  HealthData,
  SystemStatusData,
  DemoStatusData,
  JarvisCommand,
  CommandExecuteResult,
  HomeSummaryData,
  EntityState,
  ActionExecutionResult,
  ProxmoxSummaryData,
  DnsSummaryData,
  ServiceHealthItem
} from '../types';

export class JarvisApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = '/api';
    // Em produção o token é obtido da sessão local ou variável de ambiente no build
    this.apiKey = localStorage.getItem('jarvis_api_key') || 'jarvis-dev-insecure-key-replace-in-production';
  }

  public setApiKey(key: string) {
    this.apiKey = key;
    localStorage.setItem('jarvis_api_key', key);
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  /**
   * Consulta o estado de saúde do backend
   */
  public async getHealth(): Promise<HealthData> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new Error(`Falha no Health Check HTTP: ${res.status}`);
    }
    const json: APIResponse<HealthData> = await res.json();
    return json.data;
  }

  /**
   * Obtém o estado operacional dos serviços
   */
  public async getStatus(): Promise<SystemStatusData> {
    const res = await fetch(`${this.baseUrl}/status`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao obter estado HTTP ${res.status}`);
    }
    const json: APIResponse<SystemStatusData> = await res.json();
    return json.data;
  }

  /**
   * Obtém dados de demonstração estruturados da Fase 2
   */
  public async getDemoStatus(): Promise<DemoStatusData> {
    const res = await fetch(`${this.baseUrl}/status/demo`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao obter dados de demonstração HTTP ${res.status}`);
    }
    const json: APIResponse<DemoStatusData> = await res.json();
    return json.data;
  }

  /**
   * Obtém o catálogo determinístico de comandos de voz
   */
  public async getCommands(): Promise<JarvisCommand[]> {
    const res = await fetch(`${this.baseUrl}/commands`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao carregar catálogo de comandos: ${res.status}`);
    }
    const json: APIResponse<JarvisCommand[]> = await res.json();
    return json.data;
  }

  /**
   * Obtém resumo agregado real do Home Assistant (Fase 4)
   */
  public async getHomeSummary(): Promise<HomeSummaryData> {
    const res = await fetch(`${this.baseUrl}/home/summary`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao obter resumo do Home Assistant: ${res.status}`);
    }
    const json: APIResponse<HomeSummaryData> = await res.json();
    return json.data;
  }

  /**
   * Obtém lista de entidades autorizadas do Home Assistant
   */
  public async getHomeEntities(): Promise<EntityState[]> {
    const res = await fetch(`${this.baseUrl}/home/entities`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao obter entidades do Home Assistant: ${res.status}`);
    }
    const json: APIResponse<EntityState[]> = await res.json();
    return json.data;
  }

  /**
   * Aciona uma luz autorizada no Home Assistant
   */
  public async actionLight(entityId: string, action: string = 'toggle', brightness?: number): Promise<ActionExecutionResult> {
    const res = await fetch(`${this.baseUrl}/home/actions/light`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ entity_id: entityId, action, brightness })
    });
    const json: APIResponse<ActionExecutionResult> = await res.json();
    if (json.status !== 'ok') {
      throw new Error(json.error || 'Erro ao acionar luz');
    }
    return json.data;
  }

  /**
   * Aciona um interruptor ou tomada autorizada no Home Assistant
   */
  public async actionSwitch(entityId: string, action: string = 'toggle'): Promise<ActionExecutionResult> {
    const res = await fetch(`${this.baseUrl}/home/actions/switch`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ entity_id: entityId, action })
    });
    const json: APIResponse<ActionExecutionResult> = await res.json();
    if (json.status !== 'ok') {
      throw new Error(json.error || 'Erro ao acionar interruptor');
    }
    return json.data;
  }

  /**
   * Obtém resumo consolidado do Proxmox VE (Fase 5)
   */
  public async getProxmoxSummary(): Promise<ProxmoxSummaryData> {
    const res = await fetch(`${this.baseUrl}/proxmox/summary`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao obter resumo do Proxmox: ${res.status}`);
    }
    const json: APIResponse<ProxmoxSummaryData> = await res.json();
    return json.data;
  }

  /**
   * Obtém resumo de proteção DNS (Pi-hole / AdGuard) (Fase 5)
   */
  public async getDnsSummary(): Promise<DnsSummaryData> {
    const res = await fetch(`${this.baseUrl}/dns/summary`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao obter resumo DNS: ${res.status}`);
    }
    const json: APIResponse<DnsSummaryData> = await res.json();
    return json.data;
  }

  /**
   * Obtém estado da lista de serviços monitorizados (Fase 5)
   */
  public async getServices(): Promise<ServiceHealthItem[]> {
    const res = await fetch(`${this.baseUrl}/services`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Erro ao verificar serviços: ${res.status}`);
    }
    const json: APIResponse<ServiceHealthItem[]> = await res.json();
    return json.data;
  }

  /**
   * Executa ação segura de ciclo de vida (start, shutdown, reboot) em VM autorizada no Proxmox
   */
  public async actionProxmoxVm(vmid: number, action: 'start' | 'shutdown' | 'reboot', confirmed: boolean = false): Promise<ActionExecutionResult> {
    const res = await fetch(`${this.baseUrl}/proxmox/actions/vm`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ vmid, action, confirmed })
    });
    const json: APIResponse<ActionExecutionResult> = await res.json();
    if (json.status !== 'ok') {
      throw new Error(json.error || 'Erro ao executar ação na VM Proxmox');
    }
    return json.data;
  }

  /**
   * Notifica o Home Assistant da entrada/saída de imersão no Meta Quest 3S
   */
  public async sendPresence(active: boolean): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/home/presence`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ active, device: 'Meta Quest 3S' })
      });
    } catch {
      // Ignora falhas de presença sem interromper o utilizador
    }
  }

  /**
   * Executa um comando determinístico por ID ou frase de voz
   */
  public async executeCommand(params: { command_id?: string; raw_phrase?: string }): Promise<CommandExecuteResult> {
    const res = await fetch(`${this.baseUrl}/commands/execute`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params)
    });
    const json: APIResponse<CommandExecuteResult> = await res.json();
    if (json.status !== 'ok') {
      throw new Error(json.error || 'Erro desconhecido ao executar comando');
    }
    return json.data;
  }
}

export const api = new JarvisApiClient();

