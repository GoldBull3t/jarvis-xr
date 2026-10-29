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
  ClimateActionParams,
  CoverActionParams,
  MediaPlayerActionParams,
  ProxmoxSummaryData,
  DnsSummaryData,
  ServiceHealthItem
} from '../types';

export class JarvisApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = '/api';

    // Suporta passagem de token diretamente na URL (ex: https://.../?key=minha_chave ou #token=minha_chave)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get('key') || urlParams.get('token') || urlParams.get('api_key');
      if (urlKey) {
        localStorage.setItem('jarvis_api_key', urlKey);
        // Remove a chave visível da barra de URL
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch {}

    this.apiKey = localStorage.getItem('jarvis_api_key') || 'jarvis-dev-insecure-key-replace-in-production';
  }

  public setApiKey(key: string) {
    this.apiKey = key.trim();
    if (this.apiKey) {
      localStorage.setItem('jarvis_api_key', this.apiKey);
    } else {
      localStorage.removeItem('jarvis_api_key');
    }
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public hasCustomApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey !== 'jarvis-dev-insecure-key-replace-in-production');
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey && this.apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Executa pedido HTTP centralizado com deteção de erro 401 e emissão de eventos
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {})
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('jarvis-auth-error', {
        detail: { status: 401, path }
      }));
      throw new Error(`401 Unauthorized: Chave de autenticação inválida ou ausente para ${path}`);
    }

    if (!res.ok) {
      throw new Error(`Erro HTTP ${res.status} ao consultar ${path}`);
    }

    const json: APIResponse<T> = await res.json();
    if (json.status !== 'ok') {
      throw new Error(json.error || `Erro na API ao consultar ${path}`);
    }

    return json.data;
  }

  /**
   * Consulta o estado de saúde do backend (sem autenticação)
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
    return this.request<SystemStatusData>('/status');
  }

  /**
   * Obtém dados de demonstração estruturados
   */
  public async getDemoStatus(): Promise<DemoStatusData> {
    return this.request<DemoStatusData>('/status/demo');
  }

  /**
   * Obtém o catálogo determinístico de comandos de voz
   */
  public async getCommands(): Promise<JarvisCommand[]> {
    return this.request<JarvisCommand[]>('/commands');
  }

  /**
   * Obtém resumo agregado real do Home Assistant
   */
  public async getHomeSummary(): Promise<HomeSummaryData> {
    return this.request<HomeSummaryData>('/home/summary');
  }

  /**
   * Obtém lista de entidades autorizadas do Home Assistant
   */
  public async getHomeEntities(): Promise<EntityState[]> {
    return this.request<EntityState[]>('/home/entities');
  }

  /**
   * Aciona uma luz autorizada no Home Assistant
   */
  public async actionLight(entityId: string, action: string = 'toggle', brightness?: number): Promise<ActionExecutionResult> {
    return this.request<ActionExecutionResult>('/home/actions/light', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, action, brightness })
    });
  }

  /**
   * Aciona um interruptor ou tomada autorizada no Home Assistant
   */
  public async actionSwitch(entityId: string, action: string = 'toggle'): Promise<ActionExecutionResult> {
    return this.request<ActionExecutionResult>('/home/actions/switch', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, action })
    });
  }

  /**
   * Controla termostato ou ar condicionado autorizado (Fase Avançada)
   */
  public async actionClimate(params: ClimateActionParams): Promise<ActionExecutionResult> {
    return this.request<ActionExecutionResult>('/home/actions/climate', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * Controla estores ou cortinas elétricas autorizadas
   */
  public async actionCover(params: CoverActionParams): Promise<ActionExecutionResult> {
    return this.request<ActionExecutionResult>('/home/actions/cover', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * Controla reprodutor multimédia autorizado
   */
  public async actionMediaPlayer(params: MediaPlayerActionParams): Promise<ActionExecutionResult> {
    return this.request<ActionExecutionResult>('/home/actions/media_player', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * Devolve o URL da API para carregar snapshot JPEG de uma câmara de segurança
   */
  public getCameraSnapshotUrl(entityId: string): string {
    return `${this.baseUrl}/home/camera/${entityId}/snapshot`;
  }

  /**
   * Obtém resumo consolidado do Proxmox VE
   */
  public async getProxmoxSummary(): Promise<ProxmoxSummaryData> {
    return this.request<ProxmoxSummaryData>('/proxmox/summary');
  }

  /**
   * Obtém resumo de proteção DNS (Pi-hole / AdGuard)
   */
  public async getDnsSummary(): Promise<DnsSummaryData> {
    return this.request<DnsSummaryData>('/dns/summary');
  }

  /**
   * Obtém estado da lista de serviços monitorizados
   */
  public async getServices(): Promise<ServiceHealthItem[]> {
    return this.request<ServiceHealthItem[]>('/services');
  }

  /**
   * Executa ação segura de ciclo de vida (start, shutdown, reboot) em VM autorizada no Proxmox
   */
  public async actionProxmoxVm(vmid: number, action: 'start' | 'shutdown' | 'reboot', confirmed: boolean = false): Promise<ActionExecutionResult> {
    return this.request<ActionExecutionResult>('/proxmox/actions/vm', {
      method: 'POST',
      body: JSON.stringify({ vmid, action, confirmed })
    });
  }

  /**
   * Notifica o Home Assistant da entrada/saída de imersão no Meta Quest 3S
   */
  public async sendPresence(active: boolean): Promise<void> {
    try {
      await this.request('/home/presence', {
        method: 'POST',
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
    return this.request<CommandExecuteResult>('/commands/execute', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }
}

export const api = new JarvisApiClient();
