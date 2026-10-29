/**
 * Gestor da Interface HUD 2D e Renderização dos Painéis
 */
import type {
  DemoStatusData,
  JarvisCommand,
  HomeSummaryData,
  ProxmoxSummaryData,
  DnsSummaryData,
  ServiceHealthItem
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
    const tabs = ['home', 'proxmox', 'network', 'services', 'commands'];
    tabs.forEach((tab) => {
      const btn = document.getElementById(`btn-tab-${tab}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.switchTab(tab);
        });
      }
    });
  }

  public switchTab(tab: string) {
    this.currentTab = tab;
    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    this.render();
  }

  public setConnectionState(status: 'online' | 'offline' | 'error') {
    if (status === 'online') {
      this.connStatus.textContent = 'ONLINE (REST)';
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
    servicesData?: ServiceHealthItem[] | null
  ) {
    this.demoData = demoData;
    this.commands = commands;
    if (homeData !== undefined) this.homeData = homeData;
    if (pveData !== undefined) this.pveData = pveData;
    if (dnsData !== undefined) this.dnsData = dnsData;
    if (servicesData !== undefined) this.servicesData = servicesData;
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
        
        <div style="margin-top: 14px; font-weight: bold; color: var(--color-primary-cyan); font-size: 0.8rem;">
          ENTIDADES AUTORIZADAS:
        </div>

        ${entities.length === 0 ? '<p class="data-label" style="margin-top: 6px;">Nenhuma entidade na allowlist autorizada.</p>' : ''}

        ${entities.map(e => `
          <div class="data-row">
            <div>
              <div style="font-weight: 600; color: #fff;">${e.name}</div>
              <div style="font-size: 0.7rem; color: var(--color-text-dim);">${e.id}</div>
            </div>
            <button class="entity-btn action-entity-btn" data-entity-id="${e.id}" data-entity-domain="${e.type}" data-current-state="${e.state}">
              ${e.state.toUpperCase()}
            </button>
          </div>
        `).join('')}
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

