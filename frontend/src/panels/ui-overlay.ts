/**
 * Gestor da Interface HUD 2D e Renderização dos Painéis
 */
import { api } from '../api/client';
import { soundFX } from '../scene/audio-fx';
import type {
  DemoStatusData,
  JarvisCommand,
  HomeSummaryData,
  ProxmoxSummaryData,
  DnsSummaryData,
  ServiceHealthItem,
  FullDiagnosticsData
} from '../types';

export class UiOverlayManager {
  private mainPanel: HTMLElement;
  private connStatus: HTMLElement;
  private voiceStatus: HTMLElement;
  private voiceTranscript: HTMLElement;
  private systemIndicator: HTMLElement;

  private currentTab: string = 'home';
  private demoData: DemoStatusData | null = null;
  private homeData: HomeSummaryData | null = null;
  private pveData: ProxmoxSummaryData | null = null;
  private dnsData: DnsSummaryData | null = null;
  private servicesData: ServiceHealthItem[] | null = null;
  private diagnosticsData: FullDiagnosticsData | null = null;
  private commands: JarvisCommand[] = [];

  constructor() {
    this.mainPanel = document.getElementById('hud-main-panel')!;
    this.connStatus = document.getElementById('conn-status')!;
    this.voiceStatus = document.getElementById('voice-status')!;
    this.voiceTranscript = document.getElementById('voice-transcript')!;
    this.systemIndicator = document.getElementById('system-status-indicator')!;

    this.bindEvents();
  }

  private bindEvents() {
    const tabs = ['home', 'proxmox', 'network', 'services', 'diagnostics', 'commands'];
    tabs.forEach((tab) => {
      const btn = document.getElementById(`btn-tab-${tab}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.switchTab(tab);
        });
      }
    });

    // Controlos do Modal de Chave API
    const btnConfigKey = document.getElementById('btn-config-key');
    const btnCloseModal = document.getElementById('btn-close-modal-key');
    const btnSaveKey = document.getElementById('btn-save-key');
    const btnClearKey = document.getElementById('btn-clear-key');
    const inputKey = document.getElementById('input-api-key') as HTMLInputElement | null;

    if (btnConfigKey) {
      btnConfigKey.addEventListener('click', () => this.openApiKeyModal());
    }
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => this.closeApiKeyModal());
    }
    if (btnSaveKey && inputKey) {
      btnSaveKey.addEventListener('click', () => {
        api.setApiKey(inputKey.value);
        this.updateKeyIndicator();
        this.closeApiKeyModal();
        window.dispatchEvent(new CustomEvent('jarvis-reload-data'));
      });
    }
    if (btnClearKey && inputKey) {
      btnClearKey.addEventListener('click', () => {
        api.setApiKey('');
        inputKey.value = '';
        this.updateKeyIndicator();
        this.closeApiKeyModal();
        window.dispatchEvent(new CustomEvent('jarvis-reload-data'));
      });
    }

    this.updateKeyIndicator();
  }

  public updateKeyIndicator() {
    const indicator = document.getElementById('api-key-indicator');
    if (indicator) {
      const key = api.getApiKey();
      if (!key || key === 'jarvis-dev-insecure-key-replace-in-production') {
        indicator.textContent = 'PADRÃO / VAZIO';
        indicator.style.color = '#ffb700';
      } else {
        indicator.textContent = 'PERSONALIZADO';
        indicator.style.color = '#00ff9d';
      }
    }
  }

  public openApiKeyModal() {
    const modal = document.getElementById('modal-api-key');
    const inputKey = document.getElementById('input-api-key') as HTMLInputElement | null;
    if (modal) modal.style.display = 'flex';
    if (inputKey) inputKey.value = api.getApiKey();
  }

  public closeApiKeyModal() {
    const modal = document.getElementById('modal-api-key');
    if (modal) modal.style.display = 'none';
  }

  public switchTab(tab: string) {
    this.currentTab = tab;
    soundFX.playClick();
    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    this.render();
  }

  public setConnectionState(status: 'online' | 'offline' | 'error') {
    if (status === 'online') {
      this.connStatus.textContent = 'ONLINE (SSE/REST)';
      this.connStatus.style.color = '#00ff9d';
      this.systemIndicator.className = 'status-pulse-dot';
    } else {
      this.connStatus.textContent = 'DESLIGADO';
      this.connStatus.style.color = '#ff3366';
      this.systemIndicator.className = 'status-pulse-dot error';
    }
  }

  public setVoiceFeedback(text: string, isListening: boolean = false) {
    this.voiceTranscript.textContent = text;
    this.voiceStatus.textContent = isListening ? 'A OUVIR...' : 'PRONTO';
    this.voiceStatus.style.color = isListening ? '#00ff9d' : '#00e5ff';
  }

  public updateData(
    demoData: DemoStatusData,
    commands: JarvisCommand[],
    homeData?: HomeSummaryData | null,
    pveData?: ProxmoxSummaryData | null,
    dnsData?: DnsSummaryData | null,
    servicesData?: ServiceHealthItem[] | null,
    diagnosticsData?: FullDiagnosticsData | null
  ) {
    this.demoData = demoData;
    this.commands = commands;
    if (homeData !== undefined) this.homeData = homeData;
    if (pveData !== undefined) this.pveData = pveData;
    if (dnsData !== undefined) this.dnsData = dnsData;
    if (servicesData !== undefined) this.servicesData = servicesData;
    if (diagnosticsData !== undefined) this.diagnosticsData = diagnosticsData;
    this.render();
  }

  public render() {
    if (!this.demoData) {
      this.mainPanel.innerHTML = `
        <div class="panel-card">
          <div class="panel-title">A CARREGAR DADOS...</div>
          <p class="data-label">A estabelecer comunicação com o backend...</p>
        </div>
      `;
      return;
    }

    switch (this.currentTab) {
      case 'home':
        this.renderHome();
        break;
      case 'proxmox':
        this.renderProxmox();
        break;
      case 'network':
        this.renderNetwork();
        break;
      case 'services':
        this.renderServices();
        break;
      case 'diagnostics':
        this.renderDiagnostics();
        break;
      case 'commands':
        this.renderCommands();
        break;
      default:
        this.renderHome();
    }
  }

  private renderHome() {
    const isReal = this.homeData && this.homeData.configured && this.homeData.status === 'operational';
    const temp = isReal ? (this.homeData!.temperature_celsius ?? 'N/D') : this.demoData!.home.temperature_celsius;
    const hum = isReal ? (this.homeData!.humidity_percent ?? 'N/D') : this.demoData!.home.humidity_percent;
    const lightsOn = isReal ? this.homeData!.lights_on : this.demoData!.home.lights_on;
    const totalLights = isReal ? this.homeData!.total_lights : this.demoData!.home.total_lights;
    const coversOpen = isReal ? (this.homeData!.covers_open ?? 0) : 0;
    const totalCovers = isReal ? (this.homeData!.total_covers ?? 0) : 0;
    const mediaActive = isReal ? (this.homeData!.media_players_active ?? 0) : 0;
    const totalMedia = isReal ? (this.homeData!.total_media_players ?? 0) : 0;
    const activeUrl = isReal && this.homeData!.active_url_used ? this.homeData!.active_url_used : '';

    const entities = isReal
      ? this.homeData!.authorized_entities.map(e => ({
          id: e.entity_id,
          name: e.friendly_name,
          state: e.state,
          type: e.domain
        }))
      : this.demoData!.home.entities;

    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>DOMÓTICA // HOME ASSISTANT</span>
          <span class="badge-demo" style="${isReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : ''}">
            ${isReal ? 'INTEGRAÇÃO REAL' : 'DEMO'}
          </span>
        </div>
        ${activeUrl ? `
        <div style="font-size: 0.7rem; color: var(--color-text-dim); margin-bottom: 8px;">
          Ligado via: <span style="color: var(--color-primary-cyan);">${activeUrl}</span>
        </div>` : ''}
        <div class="data-row">
          <span class="data-label">Temperatura Ambiente:</span>
          <span class="data-value">${temp} °C</span>
        </div>
        <div class="data-row">
          <span class="data-label">Humidade Relativa:</span>
          <span class="data-value">${hum} %</span>
        </div>
        <div class="data-row">
          <span class="data-label">Luzes Ligadas:</span>
          <span class="data-value">${lightsOn} de ${totalLights}</span>
        </div>
        ${totalCovers > 0 ? `
        <div class="data-row">
          <span class="data-label">Estores Abertos:</span>
          <span class="data-value">${coversOpen} de ${totalCovers}</span>
        </div>` : ''}
        ${totalMedia > 0 ? `
        <div class="data-row">
          <span class="data-label">Multimédia Ativo:</span>
          <span class="data-value">${mediaActive} de ${totalMedia}</span>
        </div>` : ''}
        
        <div style="margin-top: 14px; font-weight: bold; color: var(--color-primary-cyan); font-size: 0.8rem;">
          DISPOSITIVOS AUTORIZADOS:
        </div>

        ${entities.length === 0 ? '<p class="data-label" style="margin-top: 6px;">Nenhuma entidade encontrada.</p>' : ''}

        ${entities.map(e => {
          let btnLabel = e.state.toUpperCase();
          if (e.type === 'cover') {
            btnLabel = e.state === 'open' ? 'FECHAR' : 'ABRIR';
          } else if (e.type === 'media_player') {
            btnLabel = (e.state === 'playing' || e.state === 'on') ? 'PAUSAR' : 'REPRODUZIR';
          } else if (e.type === 'camera') {
            btnLabel = '📷 SNAPSHOT';
          } else if (e.type === 'climate') {
            btnLabel = 'HVAC';
          }
          return `
          <div class="data-row">
            <div>
              <div style="font-weight: 600; color: #fff;">${e.name}</div>
              <div style="font-size: 0.7rem; color: var(--color-text-dim);">${e.id} [${e.type.toUpperCase()}]</div>
            </div>
            <button class="entity-btn action-entity-btn" data-entity-id="${e.id}" data-entity-domain="${e.type}" data-current-state="${e.state}">
              ${btnLabel}
            </button>
          </div>
          `;
        }).join('')}
      </div>
    `;

    // Interatividade de alternância ligada a eventos reais
    this.mainPanel.querySelectorAll('.action-entity-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const target = ev.target as HTMLButtonElement;
        const entityId = target.getAttribute('data-entity-id')!;
        const domain = target.getAttribute('data-entity-domain')!;
        const customEvent = new CustomEvent('jarvis-action-entity', {
          detail: { entityId, domain }
        });
        window.dispatchEvent(customEvent);
      });
    });
  }

  private renderProxmox() {
    const isReal = this.pveData && this.pveData.configured && this.pveData.status === 'operational';
    const cluster = isReal ? this.pveData!.cluster_name : this.demoData!.proxmox.cluster_name;
    const nodesOnline = isReal ? this.pveData!.nodes_online : this.demoData!.proxmox.nodes_online;
    const totalNodes = isReal ? this.pveData!.total_nodes : this.demoData!.proxmox.total_nodes;
    const cpu = isReal ? this.pveData!.cpu_usage_percent : this.demoData!.proxmox.cpu_usage_percent;
    const ramUsed = isReal ? this.pveData!.ram_used_gb : this.demoData!.proxmox.ram_used_gb;
    const ramTotal = isReal ? this.pveData!.ram_total_gb : this.demoData!.proxmox.ram_total_gb;
    const ramPercent = isReal ? this.pveData!.ram_usage_percent : this.demoData!.proxmox.ram_usage_percent;

    const vms = isReal
      ? this.pveData!.vms.map(v => ({
          vmid: v.vmid,
          name: v.name,
          status: v.status,
          cpu: v.cpu,
          type: v.type
        }))
      : this.demoData!.proxmox.vms.map(v => ({ ...v, type: 'qemu' }));

    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>VIRTUALIZAÇÃO // PROXMOX VE</span>
          <span class="badge-demo" style="${isReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : ''}">
            ${isReal ? 'PROXMOX REAL' : 'DEMO'}
          </span>
        </div>
        <div class="data-row">
          <span class="data-label">Cluster / Host:</span>
          <span class="data-value">${cluster}</span>
        </div>
        <div class="data-row">
          <span class="data-label">Nós Ativos:</span>
          <span class="data-value">${nodesOnline} / ${totalNodes}</span>
        </div>

        <div class="data-row" style="margin-top: 10px;">
          <span class="data-label">Utilização CPU Host:</span>
          <span class="data-value">${cpu} %</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${Math.min(cpu, 100)}%"></div>
        </div>

        <div class="data-row">
          <span class="data-label">Memória RAM:</span>
          <span class="data-value">${ramUsed} GB / ${ramTotal} GB (${ramPercent}%)</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${Math.min(ramPercent, 100)}%"></div>
        </div>

        ${isReal && this.pveData!.storage_pools && this.pveData!.storage_pools.length > 0 ? `
          <div style="margin-top: 14px; font-weight: bold; color: var(--color-primary-cyan); font-size: 0.8rem;">
            POOLS DE ARMAZENAMENTO (STORAGE):
          </div>
          ${this.pveData!.storage_pools.map(s => `
            <div class="data-row" style="padding: 4px 0;">
              <span class="data-label">${s.storage} (${s.type}):</span>
              <span class="data-value">${s.used_gb} GB / ${s.total_gb} GB (${s.percent}%)</span>
            </div>
            <div class="progress-bar-container" style="height: 4px; margin-bottom: 6px;">
              <div class="progress-bar-fill" style="width: ${Math.min(s.percent, 100)}%"></div>
            </div>
          `).join('')}
        ` : ''}

        ${isReal && this.pveData!.backup_status ? `
          <div class="data-row" style="margin-top: 8px;">
            <span class="data-label">Estado de Backup:</span>
            <span class="data-value" style="color: ${this.pveData!.backup_status.status === 'ok' ? '#00ff9d' : '#ffb700'}">
              ${this.pveData!.backup_status.message}
            </span>
          </div>
        ` : ''}

        <div style="margin-top: 14px; font-weight: bold; color: var(--color-primary-cyan); font-size: 0.8rem;">
          MÁQUINAS VIRTUAIS & CONTAINERS:
        </div>

        ${vms.length === 0 ? '<p class="data-label" style="margin-top: 6px;">Nenhuma VM/LXC encontrada no Proxmox.</p>' : ''}

        ${vms.map(vm => `
          <div class="data-row" style="flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px 0;">
            <div style="display: flex; justify-content: space-between; width: 100%;">
              <span class="data-label">[${vm.vmid}] ${vm.name} <small style="color:#7da5c2">(${vm.type.toUpperCase()})</small></span>
              <span class="data-value" style="color: ${vm.status === 'running' ? '#00ff9d' : '#ff3366'}">
                ${vm.status.toUpperCase()} (${vm.cpu}% CPU)
              </span>
            </div>
            ${isReal && (vm as any).is_manageable ? `
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                ${vm.status !== 'running' ? `
                  <button class="entity-btn action-vm-btn" data-vmid="${vm.vmid}" data-vm-action="start" data-vm-name="${vm.name}" style="background: rgba(0,255,157,0.15); border-color: #00ff9d; color: #00ff9d;">
                    ▶ LIGAR
                  </button>
                ` : `
                  <button class="entity-btn action-vm-btn" data-vmid="${vm.vmid}" data-vm-action="shutdown" data-vm-name="${vm.name}" style="background: rgba(255,51,102,0.15); border-color: #ff3366; color: #ff3366;">
                    ⏻ DESLIGAR
                  </button>
                  <button class="entity-btn action-vm-btn" data-vmid="${vm.vmid}" data-vm-action="reboot" data-vm-name="${vm.name}" style="background: rgba(255,183,0,0.15); border-color: #ffb700; color: #ffb700;">
                    ⟳ REINICIAR
                  </button>
                `}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;

    // Interatividade com ações de VM
    this.mainPanel.querySelectorAll('.action-vm-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const target = ev.target as HTMLButtonElement;
        const vmid = parseInt(target.getAttribute('data-vmid') || '0', 10);
        const action = target.getAttribute('data-vm-action') || '';
        const vmName = target.getAttribute('data-vm-name') || '';

        const customEvent = new CustomEvent('jarvis-action-vm', {
          detail: { vmid, action, vmName }
        });
        window.dispatchEvent(customEvent);
      });
    });
  }

  private renderNetwork() {
    const isReal = this.dnsData && this.dnsData.configured && this.dnsData.status === 'operational';
    const provider = isReal ? `${this.dnsData!.provider.toUpperCase()} [REAL]` : this.demoData!.dns.provider;
    const queries = isReal ? this.dnsData!.queries_today : this.demoData!.dns.queries_today;
    const blocked = isReal ? this.dnsData!.blocked_today : this.demoData!.dns.blocked_today;
    const blockPct = isReal ? this.dnsData!.block_percentage : this.demoData!.dns.block_percentage;
    const clients = isReal ? this.dnsData!.clients_active : this.demoData!.dns.clients_active;

    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>REDE & DNS // ESCUDO DE PROTEÇÃO</span>
          <span class="badge-demo" style="${isReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : ''}">
            ${isReal ? 'DNS REAL' : 'DEMO'}
          </span>
        </div>
        <div class="data-row">
          <span class="data-label">Fornecedor DNS:</span>
          <span class="data-value">${provider}</span>
        </div>
        <div class="data-row">
          <span class="data-label">Estado de Proteção:</span>
          <span class="data-value" style="color: #00ff9d;">OPERACIONAL</span>
        </div>
        <div class="data-row">
          <span class="data-label">Consultas Hoje:</span>
          <span class="data-value">${queries.toLocaleString()}</span>
        </div>
        <div class="data-row">
          <span class="data-label">Ameaças / Anúncios Bloqueados:</span>
          <span class="data-value" style="color: #00e5ff;">${blocked.toLocaleString()} (${blockPct}%)</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${Math.min(blockPct * 2, 100)}%"></div>
        </div>
        <div class="data-row">
          <span class="data-label">Clientes Conectados:</span>
          <span class="data-value">${clients} dispositivos</span>
        </div>
      </div>
    `;
  }

  private renderServices() {
    const isReal = this.servicesData && this.servicesData.length > 0;
    const list = isReal
      ? this.servicesData!
      : this.demoData!.services.map(s => ({
          name: s.name,
          url: s.url,
          status: s.status,
          latency_ms: s.latency_ms,
          last_checked: new Date().toISOString()
        }));

    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>DISPONIBILIDADE // SERVIÇOS HOMELAB</span>
          <span class="badge-demo" style="${isReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : ''}">
            ${isReal ? 'VERIFICAÇÕES REAIS' : 'DEMO'}
          </span>
        </div>
        <p class="data-label" style="margin-bottom: 12px; font-size: 0.75rem;">
          Allowlist de verificações HTTP ativas com medição de latência.
        </p>

        ${list.map(s => `
          <div class="data-row">
            <div>
              <div style="font-weight: 700; color: #fff;">${s.name}</div>
              <div style="font-size: 0.7rem; color: var(--color-text-dim);">${s.url}</div>
            </div>
            <div style="text-align: right;">
              <div style="color: ${s.status === 'online' ? '#00ff9d' : '#ff3366'}; font-weight: bold;">
                ${s.status.toUpperCase()}
              </div>
              <div style="font-size: 0.7rem; color: var(--color-text-dim);">
                ${s.latency_ms !== null && s.latency_ms !== undefined ? `${s.latency_ms} ms` : 'offline'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderDiagnostics() {
    const diag = this.diagnosticsData;
    if (!diag) {
      this.mainPanel.innerHTML = `
        <div class="panel-card">
          <div class="panel-title">
            <span>DIAGNÓSTICO // HOMELAB</span>
            <span class="badge-demo">EM TESTE</span>
          </div>
          <p class="data-label" style="margin-bottom: 14px;">A recolher métricas de latência e conectividade de todas as integrações...</p>
          <button class="action-btn" id="btn-run-diag" style="padding: 8px 16px;">🩺 EXECUTAR DIAGNÓSTICO AGORA</button>
        </div>
      `;
      const btn = document.getElementById('btn-run-diag');
      if (btn) {
        btn.addEventListener('click', () => {
          soundFX.playClick();
          window.dispatchEvent(new CustomEvent('jarvis-run-diagnostics'));
        });
      }
      return;
    }

    const isAllOk = diag.all_healthy;
    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>CENTRAL DE DIAGNÓSTICO // REDE E LATÊNCIA</span>
          <span class="badge-demo" style="${isAllOk ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : 'color: #ffb700; border-color: #ffb700; background: rgba(255, 183, 0, 0.1);'}">
            ${isAllOk ? '100% OPERACIONAL' : 'VERIFICAÇÃO NECESSÁRIA'}
          </span>
        </div>
        <p class="data-label" style="margin-bottom: 12px; font-size: 0.75rem;">
          Bateria de testes de latência e integridade das integrações locais.
        </p>

        <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;">
          <div class="stat-pill" style="font-size: 0.75rem;">
            <span class="stat-label">AMBIENTE:</span>
            <span class="stat-val" style="color: #00e5ff;">${diag.system_info.environment.toUpperCase()}</span>
          </div>
          <div class="stat-pill" style="font-size: 0.75rem;">
            <span class="stat-label">AUTENTICAÇÃO:</span>
            <span class="stat-val" style="color: ${diag.system_info.auth_required ? '#00ff9d' : '#ffb700'};">${diag.system_info.auth_required ? 'ATIVA' : 'DESATIVADA'}</span>
          </div>
          <div class="stat-pill" style="font-size: 0.75rem;">
            <span class="stat-label">HOST:</span>
            <span class="stat-val" style="color: #fff;">${diag.system_info.hostname}</span>
          </div>
        </div>

        ${diag.checks.map(c => {
          let color = '#00ff9d';
          let bg = 'rgba(0, 255, 157, 0.15)';
          if (c.status === 'warning') {
            color = '#ffb700';
            bg = 'rgba(255, 183, 0, 0.15)';
          } else if (c.status === 'error') {
            color = '#ff3366';
            bg = 'rgba(255, 51, 102, 0.15)';
          } else if (c.status === 'disabled') {
            color = '#7da5c2';
            bg = 'rgba(125, 165, 194, 0.15)';
          }

          return `
            <div class="data-row" style="flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 0; border-bottom: 1px solid rgba(0, 229, 255, 0.1);">
              <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <span style="font-weight: 700; color: #fff;">${c.service}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                  ${c.latency_ms !== null && c.latency_ms !== undefined ? `
                    <span style="font-size: 0.75rem; color: #00e5ff; font-family: monospace;">⚡ ${c.latency_ms} ms</span>
                  ` : ''}
                  <span class="badge-demo" style="color: ${color}; border-color: ${color}; background: ${bg}; padding: 2px 8px; font-size: 0.65rem;">
                    ${c.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <div style="font-size: 0.75rem; color: var(--color-text-dim);">
                ${c.message}
              </div>
              ${c.endpoint ? `
                <div style="font-size: 0.7rem; color: #00e5ff; font-family: monospace;">
                  ${c.endpoint}
                </div>
              ` : ''}
              ${c.details && c.details.active_url ? `
                <div style="font-size: 0.68rem; color: var(--color-text-dim);">
                  URL Ativo: <span style="color: #00ff9d;">${c.details.active_url}</span> | Fallback: <span style="color: #ffb700;">${c.details.fallback_url || 'Nenhum'}</span>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}

        <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.7rem; color: var(--color-text-dim);">
            Última verificação: ${new Date(diag.timestamp).toLocaleTimeString()}
          </span>
          <button class="action-btn" id="btn-run-diag" style="padding: 6px 14px; font-size: 0.8rem;">
            🩺 REEXECUTAR TESTE
          </button>
        </div>
      </div>
    `;

    const btn = document.getElementById('btn-run-diag');
    if (btn) {
      btn.addEventListener('click', () => {
        soundFX.playClick();
        window.dispatchEvent(new CustomEvent('jarvis-run-diagnostics'));
      });
    }
  }

  private renderCommands() {
    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>CATÁLOGO // COMANDOS DETERMINÍSTICOS</span>
          <span class="badge-demo">SEM IA</span>
        </div>
        <p class="data-label" style="margin-bottom: 12px; font-size: 0.75rem;">
          Clique em qualquer comando para simular a execução imediata ou fale no microfone.
        </p>

        ${this.commands.map(cmd => `
          <div class="data-row" style="flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 0;">
            <div style="display: flex; justify-content: space-between; width: 100%;">
              <span style="color: var(--color-primary-cyan); font-weight: bold;">"${cmd.phrases[0]}"</span>
              <button class="entity-btn test-cmd-btn" data-cmd-id="${cmd.id}">TESTAR</button>
            </div>
            <div style="font-size: 0.75rem; color: var(--color-text-dim);">
              ${cmd.description}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Interatividade para testar comandos
    this.mainPanel.querySelectorAll('.test-cmd-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const target = ev.target as HTMLButtonElement;
        const cmdId = target.getAttribute('data-cmd-id');
        const customEvent = new CustomEvent('jarvis-run-command', { detail: { command_id: cmdId } });
        window.dispatchEvent(customEvent);
      });
    });
  }
}

