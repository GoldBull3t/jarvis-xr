/**
 * Gestor da Interface HUD 2D e Renderização dos Painéis
 */
import { api } from '../api/client';
import { soundFX } from '../scene/audio-fx';
import type {
  DemoStatusData,
  JarvisCommand,
  HomeSummaryData,
  EntityState,
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
  private homeActiveFilter: string = 'all';
  private homeSearchQuery: string = '';
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
    const isConfigured = Boolean(this.homeData && this.homeData.configured);
    const isReal = isConfigured && this.homeData!.status === 'operational';

    if (isConfigured && !isReal) {
      this.mainPanel.innerHTML = `
        <div class="panel-card">
          <div class="panel-title">
            <span>DOMÓTICA // HOME ASSISTANT</span>
            <span class="badge-demo" style="color: #ff3366; border-color: #ff3366; background: rgba(255, 51, 102, 0.15);">
              ${(this.homeData?.status || 'INACESSÍVEL').toUpperCase()}
            </span>
          </div>
          <p class="data-label" style="color: #ffb700; margin-bottom: 12px; font-size: 0.8rem;">
            ⚠️ Não foi possível comunicar com o Home Assistant.
          </p>
          <div style="font-size: 0.75rem; color: var(--color-text-dim); line-height: 1.5; padding: 12px; background: rgba(255, 51, 102, 0.08); border: 1px dashed rgba(255, 51, 102, 0.3); border-radius: 4px; margin-bottom: 14px;">
            <strong>Diagnóstico de Conexão:</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0;">
              <li>Certifique-se de que a porta <code>:8123</code> está incluída no URL: <code>http://192.168.30.180:8123</code>.</li>
              <li>Verifique se o token de longa duração gerado no perfil do Home Assistant está correto.</li>
              <li>Consulte o separador <strong>DIAGNÓSTICO</strong> para testar a conectividade em tempo real.</li>
            </ul>
          </div>
          <button class="action-btn" id="btn-retest-ha" style="padding: 6px 14px; font-size: 0.8rem;">⟳ TESTAR NOVAMENTE</button>
        </div>
      `;
      const btn = document.getElementById('btn-retest-ha');
      if (btn) btn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('jarvis-reload-data')));
      return;
    }

    const temp = isReal ? (this.homeData!.temperature_celsius ?? 'N/D') : (this.demoData?.home?.temperature_celsius ?? 'N/D');
    const hum = isReal ? (this.homeData!.humidity_percent ?? 'N/D') : (this.demoData?.home?.humidity_percent ?? 'N/D');
    const powerW = isReal ? this.homeData!.power_consumption_watts : null;
    const lightsOn = isReal ? this.homeData!.lights_on : (this.demoData?.home?.lights_on ?? 0);
    const totalLights = isReal ? this.homeData!.total_lights : (this.demoData?.home?.total_lights ?? 0);
    const totalSwitches = isReal ? this.homeData!.total_switches : 0;
    const totalCovers = isReal ? (this.homeData!.total_covers ?? 0) : 0;
    const totalMedia = isReal ? (this.homeData!.total_media_players ?? 0) : 0;
    const binaryAlerts = isReal ? (this.homeData!.binary_sensors_alert ?? 0) : 0;
    const totalBinary = isReal ? (this.homeData!.total_binary_sensors ?? 0) : 0;
    const camerasCount = isReal ? (this.homeData!.cameras_count ?? 0) : 0;
    const scenesCount = isReal ? (this.homeData!.scenes_count ?? 0) : 0;
    const climatesCount = isReal ? (this.homeData!.climates_count ?? 0) : 0;
    const activeUrl = isReal && this.homeData!.active_url_used ? this.homeData!.active_url_used : '';
    const rawEntities = isReal ? (this.homeData!.authorized_entities || []) : [];

    // Contagem de sensores normais
    const sensorsCount = rawEntities.filter(e => e.domain === 'sensor').length;

    // Lista de Áreas únicas
    const areasList = isReal && this.homeData!.areas && this.homeData!.areas.length > 0
      ? this.homeData!.areas
      : Array.from(new Set(rawEntities.map(e => e.area_name).filter(Boolean))) as string[];

    // Filtragem de entidades por pesquisa e por categoria
    const query = this.homeSearchQuery.toLowerCase().trim();
    const filteredEntities = rawEntities.filter(ent => {
      // Filtro de Texto
      if (query) {
        const matchName = ent.friendly_name.toLowerCase().includes(query);
        const matchId = ent.entity_id.toLowerCase().includes(query);
        const matchArea = (ent.area_name || '').toLowerCase().includes(query);
        if (!matchName && !matchId && !matchArea) return false;
      }

      // Filtro de Categoria
      if (this.homeActiveFilter === 'all' || this.homeActiveFilter === 'areas') {
        return true;
      }
      if (this.homeActiveFilter === 'scenes') {
        return ent.domain === 'scene' || ent.domain === 'script';
      }
      if (this.homeActiveFilter === 'security') {
        return ent.domain === 'binary_sensor' || ent.domain === 'lock' || ent.domain === 'alarm_control_panel';
      }
      return ent.domain === this.homeActiveFilter;
    });

    const categories = [
      { id: 'all', label: `TODOS (${rawEntities.length})` },
      { id: 'areas', label: `DIVISÕES (${areasList.length})` },
      { id: 'light', label: `LUZES (${totalLights})` },
      { id: 'switch', label: `TOMADAS (${totalSwitches})` },
      { id: 'climate', label: `CLIMA (${climatesCount})` },
      { id: 'security', label: `SEGURANÇA (${totalBinary})` },
      { id: 'sensor', label: `SENSORES (${sensorsCount})` },
      { id: 'scenes', label: `CENAS (${scenesCount})` },
      { id: 'cover', label: `ESTORES (${totalCovers})` },
      { id: 'media_player', label: `MULTIMÉDIA (${totalMedia})` },
      { id: 'camera', label: `CÂMARAS (${camerasCount})` }
    ];

    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>DOMÓTICA // HOME ASSISTANT TOTAL</span>
          <span class="badge-demo" style="${isReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : ''}">
            ${isReal ? 'INTEGRAÇÃO TOTAL REAL' : 'DEMO'}
          </span>
        </div>

        ${activeUrl ? `
        <div style="font-size: 0.7rem; color: var(--color-text-dim); margin-bottom: 8px;">
          Ligado via: <span style="color: var(--color-primary-cyan);">${activeUrl}</span>
        </div>` : ''}

        <!-- Resumo Rápido Holográfico de Topo -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 12px; background: rgba(0, 229, 255, 0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(0, 229, 255, 0.15);">
          <div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">TEMPERATURA</div>
            <div style="font-weight: bold; color: var(--color-primary-cyan); font-size: 0.9rem;">${temp} °C</div>
          </div>
          <div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">HUMIDADE</div>
            <div style="font-weight: bold; color: #fff; font-size: 0.9rem;">${hum} %</div>
          </div>
          ${(powerW !== null && powerW !== undefined) ? `
          <div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">POTÊNCIA ATIVA</div>
            <div style="font-weight: bold; color: #ffb700; font-size: 0.9rem;">${powerW.toFixed(0)} W</div>
          </div>` : ''}
          <div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">LUZES ATIVAS</div>
            <div style="font-weight: bold; color: #00ff9d; font-size: 0.9rem;">${lightsOn} / ${totalLights}</div>
          </div>
          <div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">SEGURANÇA</div>
            <div style="font-weight: bold; font-size: 0.85rem; color: ${binaryAlerts > 0 ? '#ff3366' : '#00ff9d'};">
              ${binaryAlerts > 0 ? `⚠️ ${binaryAlerts} ALERTA(S)` : '🟢 SEGURA'}
            </div>
          </div>
        </div>

        <!-- Barra de Pesquisa e Filtros de Categoria -->
        <div style="margin-bottom: 10px;">
          <input 
            type="text" 
            id="ha-search-input" 
            placeholder="🔍 Filtrar dispositivos, divisões ou tipos..." 
            value="${this.homeSearchQuery}"
            style="width: 100%; box-sizing: border-box; background: rgba(5, 11, 20, 0.8); border: 1px solid rgba(0, 229, 255, 0.3); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 0.75rem; font-family: monospace; margin-bottom: 8px;"
          />
          <div style="display: flex; flex-wrap: wrap; gap: 4px; max-height: 80px; overflow-y: auto;">
            ${categories.map(cat => `
              <button 
                class="ha-filter-pill ${this.homeActiveFilter === cat.id ? 'active' : ''}" 
                data-filter="${cat.id}"
                style="padding: 3px 8px; font-size: 0.68rem; font-family: monospace; border-radius: 12px; border: 1px solid ${this.homeActiveFilter === cat.id ? 'var(--color-primary-cyan)' : 'rgba(255,255,255,0.2)'}; background: ${this.homeActiveFilter === cat.id ? 'rgba(0, 229, 255, 0.25)' : 'rgba(0,0,0,0.3)'}; color: ${this.homeActiveFilter === cat.id ? '#fff' : 'var(--color-text-dim)'}; cursor: pointer;"
              >
                ${cat.label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Lista de Dispositivos Filtrados ou Agrupados por Divisão -->
        <div id="ha-entities-container" style="max-height: 480px; overflow-y: auto; padding-right: 4px;">
          ${filteredEntities.length === 0 ? `
            <div style="text-align: center; padding: 24px; color: var(--color-text-dim); font-size: 0.8rem;">
              Nenhum dispositivo encontrado com os filtros atuais.
            </div>
          ` : this.renderEntitiesList(filteredEntities, this.homeActiveFilter === 'areas')}
        </div>
      </div>
    `;

    // Interatividade da Pesquisa em Tempo Real
    const searchInput = document.getElementById('ha-search-input') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.homeSearchQuery = (e.target as HTMLInputElement).value;
        this.renderHome();
        const nextInput = document.getElementById('ha-search-input') as HTMLInputElement | null;
        if (nextInput) {
          nextInput.focus();
          nextInput.selectionStart = nextInput.selectionEnd = nextInput.value.length;
        }
      });
    }

    // Interatividade dos Botões de Filtro
    this.mainPanel.querySelectorAll('.ha-filter-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        this.homeActiveFilter = target.getAttribute('data-filter') || 'all';
        this.renderHome();
      });
    });

    // Interatividade das Ações de Dispositivos (Luzes, Tomadas, Clima, Estores, Cenas, etc.)
    this.mainPanel.querySelectorAll('.action-ha-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const target = ev.currentTarget as HTMLButtonElement;
        const entityId = target.getAttribute('data-entity-id')!;
        const domain = target.getAttribute('data-domain')!;
        const action = target.getAttribute('data-action') || 'toggle';
        const payloadStr = target.getAttribute('data-payload');
        const payload = payloadStr ? JSON.parse(payloadStr) : undefined;

        window.dispatchEvent(new CustomEvent('jarvis-action-entity', {
          detail: { entityId, domain, action, payload }
        }));
      });
    });
  }

  /**
   * Renderiza a listagem de entidades organizadas individualmente ou por divisão
   */
  private renderEntitiesList(entities: EntityState[], groupByArea: boolean): string {
    if (groupByArea) {
      const areaGroups = new Map<string, EntityState[]>();
      entities.forEach(ent => {
        const area = ent.area_name || 'Sem Divisão Atribuída';
        if (!areaGroups.has(area)) areaGroups.set(area, []);
        areaGroups.get(area)!.push(ent);
      });

      return Array.from(areaGroups.entries()).map(([areaName, areaEntities]) => `
        <div style="margin-bottom: 14px; background: rgba(0, 25, 45, 0.4); border: 1px solid rgba(0, 229, 255, 0.2); border-radius: 4px; padding: 8px;">
          <div style="font-weight: bold; color: var(--color-primary-cyan); font-size: 0.78rem; border-bottom: 1px dashed rgba(0, 229, 255, 0.25); padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between;">
            <span>📍 ${areaName.toUpperCase()}</span>
            <span style="font-size: 0.7rem; color: var(--color-text-dim);">${areaEntities.length} dispositivo(s)</span>
          </div>
          ${areaEntities.map(ent => this.renderEntityRow(ent)).join('')}
        </div>
      `).join('');
    }

    return entities.map(ent => this.renderEntityRow(ent)).join('');
  }

  /**
   * Renderiza uma linha individual de dispositivo com controlos táteis avançados
   */
  private renderEntityRow(e: EntityState): string {
    const domain = e.domain;
    const isStateOn = e.state === 'on' || e.state === 'open' || e.state === 'playing' || e.state === 'active';
    const areaTag = e.area_name ? `<span style="font-size: 0.65rem; color: var(--color-primary-cyan); margin-left: 6px;">[${e.area_name}]</span>` : '';

    // 1. ILUMINAÇÃO (Light)
    if (domain === 'light') {
      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">💡 ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">${e.entity_id} • ${e.state.toUpperCase()}</div>
          </div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="entity-btn action-ha-btn" data-entity-id="${e.entity_id}" data-domain="light" data-action="toggle" style="${isStateOn ? 'background: rgba(0, 255, 157, 0.25); color: #00ff9d; border-color: #00ff9d;' : ''}">
              ${isStateOn ? 'LIGADA' : 'DESLIGADA'}
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="light" data-action="on" data-payload='{"brightness": 128}' style="padding: 4px 6px; font-size: 0.65rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 3px; cursor: pointer;">
              50%
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="light" data-action="on" data-payload='{"brightness": 255}' style="padding: 4px 6px; font-size: 0.65rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 3px; cursor: pointer;">
              100%
            </button>
          </div>
        </div>
      `;
    }

    // 2. TOMADAS / INTERRUPTORES (Switch / Plug)
    if (domain === 'switch' || domain === 'input_boolean') {
      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">🔌 ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">${e.entity_id}</div>
          </div>
          <button class="entity-btn action-ha-btn" data-entity-id="${e.entity_id}" data-domain="switch" data-action="toggle" style="${isStateOn ? 'background: rgba(0, 255, 157, 0.25); color: #00ff9d; border-color: #00ff9d;' : ''}">
            ${isStateOn ? 'LIGADO' : 'DESLIGADO'}
          </button>
        </div>
      `;
    }

    // 3. CLIMATIZAÇÃO (Climate / AC / Termostato)
    if (domain === 'climate') {
      const targetTemp = e.attributes.temperature ?? 'N/D';
      const currentTemp = e.attributes.current_temperature ?? 'N/D';
      return `
        <div class="data-row" style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); flex-direction: column; align-items: flex-start;">
          <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 6px;">
            <div>
              <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">❄️ ${e.friendly_name} ${areaTag}</div>
              <div style="font-size: 0.65rem; color: var(--color-text-dim);">Atual: <strong style="color:#00e5ff;">${currentTemp}°C</strong> | Alvo: <strong style="color:#ffb700;">${targetTemp}°C</strong> (${e.state.toUpperCase()})</div>
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_temperature" data-payload='{"temperature": ${Number(targetTemp || 20) - 0.5}}' style="padding: 4px 8px; font-size: 0.7rem; background: rgba(0, 229, 255, 0.2); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 3px; cursor: pointer;">
                -0.5°
              </button>
              <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_temperature" data-payload='{"temperature": ${Number(targetTemp || 20) + 0.5}}' style="padding: 4px 8px; font-size: 0.7rem; background: rgba(0, 229, 255, 0.2); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 3px; cursor: pointer;">
                +0.5°
              </button>
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_hvac_mode" data-payload='{"hvac_mode": "heat"}' style="padding: 3px 8px; font-size: 0.65rem; background: rgba(255, 85, 0, 0.2); border: 1px solid #ff5500; color: #ffaa88; border-radius: 3px; cursor: pointer;">
              🔥 AQUECER
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_hvac_mode" data-payload='{"hvac_mode": "cool"}' style="padding: 3px 8px; font-size: 0.65rem; background: rgba(0, 229, 255, 0.2); border: 1px solid #00e5ff; color: #00e5ff; border-radius: 3px; cursor: pointer;">
              ❄️ ARREFECER
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_hvac_mode" data-payload='{"hvac_mode": "off"}' style="padding: 3px 8px; font-size: 0.65rem; background: rgba(255, 51, 102, 0.2); border: 1px solid #ff3366; color: #ff6688; border-radius: 3px; cursor: pointer;">
              ⭕ OFF
            </button>
          </div>
        </div>
      `;
    }

    // 4. ESTORES / CORTINAS (Cover)
    if (domain === 'cover') {
      const pos = e.attributes.current_position;
      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">🪟 ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">Estado: ${e.state.toUpperCase()} ${pos !== undefined ? `(${pos}%)` : ''}</div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="cover" data-action="open" style="padding: 4px 8px; font-size: 0.68rem; background: rgba(0, 255, 157, 0.2); border: 1px solid #00ff9d; color: #fff; border-radius: 3px; cursor: pointer;">
              ▲ ABRIR
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="cover" data-action="stop" style="padding: 4px 8px; font-size: 0.68rem; background: rgba(255, 183, 0, 0.2); border: 1px solid #ffb700; color: #fff; border-radius: 3px; cursor: pointer;">
              ■ PARAR
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="cover" data-action="close" style="padding: 4px 8px; font-size: 0.68rem; background: rgba(255, 51, 102, 0.2); border: 1px solid #ff3366; color: #fff; border-radius: 3px; cursor: pointer;">
              ▼ FECHAR
            </button>
          </div>
        </div>
      `;
    }

    // 5. SENSORES BINÁRIOS / SEGURANÇA (Portas, Janelas, Movimento, Fumo, Fugas)
    if (domain === 'binary_sensor') {
      const devClass = e.device_class || e.attributes.device_class || 'sensor';
      const isAlert = e.state === 'on';
      const badgeColor = isAlert ? '#ff3366' : '#00ff9d';
      const badgeBg = isAlert ? 'rgba(255, 51, 102, 0.15)' : 'rgba(0, 255, 157, 0.15)';
      const label = isAlert ? '⚠️ ABERTO / ATIVO' : '✓ FECHADO / OK';

      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">🛡️ ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">${devClass.toUpperCase()} • ${e.entity_id}</div>
          </div>
          <span style="padding: 3px 8px; font-size: 0.7rem; font-weight: bold; border-radius: 3px; border: 1px solid ${badgeColor}; background: ${badgeBg}; color: ${badgeColor};">
            ${label}
          </span>
        </div>
      `;
    }

    // 6. SENSORES DE MEDIÇÃO (Temperatura, Humidade, Potência, Energia, etc.)
    if (domain === 'sensor') {
      const unit = e.unit_of_measurement || e.attributes.unit_of_measurement || '';
      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">📊 ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">${e.entity_id}</div>
          </div>
          <span style="font-weight: bold; color: var(--color-primary-cyan); font-size: 0.85rem; font-family: monospace;">
            ${e.state} ${unit}
          </span>
        </div>
      `;
    }

    // 7. CENAS & SCRIPTS (Scene / Script)
    if (domain === 'scene' || domain === 'script') {
      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">🎬 ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">${domain.toUpperCase()} • ${e.entity_id}</div>
          </div>
          <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="${domain}" data-action="turn_on" style="padding: 4px 12px; font-size: 0.7rem; background: rgba(0, 229, 255, 0.25); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 3px; cursor: pointer; font-weight: bold;">
            ▶ ATIVAR
          </button>
        </div>
      `;
    }

    // 8. MULTIMÉDIA (Media Player)
    if (domain === 'media_player') {
      const mediaTitle = e.attributes.media_title || e.attributes.app_name || '';
      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">🎵 ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">${mediaTitle ? `A tocar: ${mediaTitle}` : e.state.toUpperCase()}</div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="media_player" data-action="play_pause" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(0, 229, 255, 0.2); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 3px; cursor: pointer;">
              ${isStateOn ? '⏸ PAUSAR' : '▶ REPRODUZIR'}
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="media_player" data-action="next" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 3px; cursor: pointer;">
              ⏭
            </button>
          </div>
        </div>
      `;
    }

    // 9. CÂMARAS DE VIGILÂNCIA (Camera)
    if (domain === 'camera') {
      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">📹 ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">Transmissão / Snapshot • ${e.entity_id}</div>
          </div>
          <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="camera" data-action="view_in_3d" style="padding: 4px 10px; font-size: 0.7rem; background: rgba(0, 255, 157, 0.25); border: 1px solid #00ff9d; color: #fff; border-radius: 3px; cursor: pointer; font-weight: bold;">
            👁️ VER NO PAINEL 3D
          </button>
        </div>
      `;
    }

    // 10. FECHADURAS (Lock)
    if (domain === 'lock') {
      const isLocked = e.state === 'locked';
      return `
        <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">🔒 ${e.friendly_name} ${areaTag}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">${isLocked ? 'TRANCADA' : 'DESTRANCADA'}</div>
          </div>
          <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="lock" data-action="${isLocked ? 'unlock' : 'lock'}" style="padding: 4px 10px; font-size: 0.7rem; background: ${isLocked ? 'rgba(0, 255, 157, 0.2)' : 'rgba(255, 51, 102, 0.2)'}; border: 1px solid ${isLocked ? '#00ff9d' : '#ff3366'}; color: #fff; border-radius: 3px; cursor: pointer;">
            ${isLocked ? 'DESTRANCAR' : 'TRANCAR'}
          </button>
        </div>
      `;
    }

    // Padrão genérico para outros domínios (ventoinha, aspirador, etc.)
    return `
      <div class="data-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
        <div>
          <div style="font-weight: 600; color: #fff; font-size: 0.8rem;">⚙️ ${e.friendly_name} ${areaTag}</div>
          <div style="font-size: 0.65rem; color: var(--color-text-dim);">${e.entity_id} [${domain.toUpperCase()}] • ${e.state}</div>
        </div>
        <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="${domain}" data-action="toggle" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(0, 229, 255, 0.2); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 3px; cursor: pointer;">
          ACIONAR
        </button>
      </div>
    `;
  }

  private renderProxmox() {
    const isConfigured = Boolean(this.pveData && this.pveData.configured);
    const isReal = isConfigured && this.pveData!.status === 'operational';

    if (isConfigured && !isReal) {
      this.mainPanel.innerHTML = `
        <div class="panel-card">
          <div class="panel-title">
            <span>VIRTUALIZAÇÃO // PROXMOX VE</span>
            <span class="badge-demo" style="color: #ff3366; border-color: #ff3366; background: rgba(255, 51, 102, 0.15);">
              ${(this.pveData?.status || 'FALHA DE ACESSO').toUpperCase()}
            </span>
          </div>
          <p class="data-label" style="color: #ffb700; margin-bottom: 12px; font-size: 0.8rem;">
            ⚠️ Falha ao comunicar com a API do Proxmox VE.
          </p>
          <div style="font-size: 0.75rem; color: var(--color-text-dim); line-height: 1.5; padding: 12px; background: rgba(255, 51, 102, 0.08); border: 1px dashed rgba(255, 51, 102, 0.3); border-radius: 4px; margin-bottom: 14px;">
            <strong>Diagnóstico de Autenticação (HTTP 401):</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0;">
              <li>Certifique-se de que o <code>PROXMOX_TOKEN_ID</code> é <code>jarvis-monitoring@pve!jarvis-token</code> (sem <code>@pam</code> duplicado).</li>
              <li>Confirme que o utilizador <code>jarvis-monitoring@pve</code> tem permissão <code>PVEAuditor</code> no Proxmox.</li>
              <li>Consulte o separador <strong>DIAGNÓSTICO</strong> para inspecionar os detalhes do teste de rede.</li>
            </ul>
          </div>
          <button class="action-btn" id="btn-retest-pve" style="padding: 6px 14px; font-size: 0.8rem;">⟳ TESTAR NOVAMENTE</button>
        </div>
      `;
      const btn = document.getElementById('btn-retest-pve');
      if (btn) btn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('jarvis-reload-data')));
      return;
    }

    const cluster = isReal ? this.pveData!.cluster_name : (this.demoData?.proxmox?.cluster_name ?? 'pve');
    const nodesOnline = isReal ? this.pveData!.nodes_online : (this.demoData?.proxmox?.nodes_online ?? 0);
    const totalNodes = isReal ? this.pveData!.total_nodes : (this.demoData?.proxmox?.total_nodes ?? 0);
    const cpu = isReal ? this.pveData!.cpu_usage_percent : (this.demoData?.proxmox?.cpu_usage_percent ?? 0);
    const ramUsed = isReal ? this.pveData!.ram_used_gb : (this.demoData?.proxmox?.ram_used_gb ?? 0);
    const ramTotal = isReal ? this.pveData!.ram_total_gb : (this.demoData?.proxmox?.ram_total_gb ?? 0);
    const ramPercent = isReal ? this.pveData!.ram_usage_percent : (this.demoData?.proxmox?.ram_usage_percent ?? 0);

    const vms = isReal
      ? this.pveData!.vms.map(v => ({
          vmid: v.vmid,
          name: v.name,
          status: v.status,
          cpu: v.cpu,
          type: v.type
        }))
      : (this.demoData?.proxmox?.vms || []).map(v => ({ ...v, type: 'qemu' }));

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
    const isReal = Boolean(this.servicesData && this.servicesData.length > 0);
    const isConnected = Boolean(this.connStatus && this.connStatus.textContent && !this.connStatus.textContent.includes('DESLIGADO'));

    // Se o backend está online mas não tem serviços adicionais na allowlist, não apresenta dados falsos de demonstração
    if (!isReal && isConnected) {
      this.mainPanel.innerHTML = `
        <div class="panel-card">
          <div class="panel-title">
            <span>DISPONIBILIDADE // SERVIÇOS HOMELAB</span>
            <span class="badge-demo" style="color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);">
              SISTEMA CONECTADO
            </span>
          </div>
          <p class="data-label" style="margin-bottom: 12px; font-size: 0.75rem;">
            Nenhum serviço HTTP adicional na allowlist manual HOMELAB_SERVICES.
          </p>
          <div style="font-size: 0.8rem; color: var(--color-text-dim); line-height: 1.5; padding: 12px; background: rgba(0, 229, 255, 0.05); border: 1px dashed rgba(0, 229, 255, 0.2); border-radius: 4px;">
            💡 <strong>Integrações Operacionais:</strong> O Proxmox VE e o Home Assistant estão a ser monitorizados em tempo real. Aceda ao separador <strong>DIAGNÓSTICO</strong> para consultar a latência em tempo real.
          </div>
        </div>
      `;
      return;
    }

    const list = isReal
      ? this.servicesData!
      : (this.demoData?.services || []).map(s => ({
          name: s.name,
          url: s.url,
          status: s.status,
          latency_ms: s.latency_ms,
          last_checked: new Date().toISOString()
        }));

    if (list.length === 0) {
      this.mainPanel.innerHTML = `
        <div class="panel-card">
          <div class="panel-title">
            <span>DISPONIBILIDADE // SERVIÇOS HOMELAB</span>
          </div>
          <p class="data-label">Nenhum serviço em monitorização.</p>
        </div>
      `;
      return;
    }

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

