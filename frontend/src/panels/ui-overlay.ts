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
  OpenWrtSummaryData,
  ServiceHealthItem,
  FullDiagnosticsData,
  PinStatusData,
  DockerSummaryData,
  AuditLogItem,
  TrendHistory
} from '../types';

export class UiOverlayManager {
  private mainPanel: HTMLElement;
  private connStatus: HTMLElement;
  private voiceStatus: HTMLElement;
  private voiceTranscript: HTMLElement;
  private systemIndicator: HTMLElement;

  private currentTab: string = 'home';
  private homeViewMode: 'native' | 'tactical' = 'tactical';
  private homeActiveFilter: string = 'all';
  private homeSearchQuery: string = '';
  private selectedHaUrl: string = '';
  private demoData: DemoStatusData | null = null;
  private homeData: HomeSummaryData | null = null;
  private pveData: ProxmoxSummaryData | null = null;
  private dnsData: DnsSummaryData | null = null;
  private openwrtData: OpenWrtSummaryData | null = null;
  private servicesData: ServiceHealthItem[] | null = null;
  private diagnosticsData: FullDiagnosticsData | null = null;
  private dockerData: DockerSummaryData | null = null;
  private auditLogs: AuditLogItem[] = [];
  private favoriteEntityIds: string[] = [];
  private commands: JarvisCommand[] = [];

  // Estado de Segurança por PIN e Bloqueio Automático
  private enteredPin: string = '';
  private isLocked: boolean = false;
  private pinRequired: boolean = true;
  private autoLockTimeout: any = null;
  private autoLockMinutes: number = 5;

  // Histórico de Tendências para Gráficos Sparkline (Buffer circular de 30 pontos)
  private trends: TrendHistory = { wan_rx: [], wan_tx: [], cpu: [], temp: [] };

  constructor() {
    this.mainPanel = document.getElementById('hud-main-panel')!;
    this.connStatus = document.getElementById('conn-status')!;
    this.voiceStatus = document.getElementById('voice-status')!;
    this.voiceTranscript = document.getElementById('voice-transcript')!;
    this.systemIndicator = document.getElementById('system-status-indicator')!;

    // Carrega favoritos locais de contingência
    try {
      const savedFavs = localStorage.getItem('jarvis_hud_favorites');
      if (savedFavs) this.favoriteEntityIds = JSON.parse(savedFavs);
    } catch {}

    this.bindEvents();
    this.bindSecurityEvents();
    this.bindDeviceExplorerEvents();
    this.resetAutoLockTimer();
  }

  private bindEvents() {
    const tabs = ['home', 'proxmox', 'network', 'docker', 'services', 'diagnostics', 'audit', 'commands'];
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

  /* ============================================================================
   * 1. SEGURANÇA: ECRÃ DE BLOQUEIO POR PIN NUMÉRICO VIRTUAL & AUTO-LOCK
   * ============================================================================ */
  private bindSecurityEvents() {
    const btnQuickLock = document.getElementById('btn-quick-lock');
    if (btnQuickLock) {
      btnQuickLock.addEventListener('click', () => {
        soundFX.playClick();
        this.lockCockpit();
      });
    }

    // Teclas numéricas virtuais
    document.querySelectorAll('.pin-key-btn[data-key]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
        if (key) this.handlePinDigit(key);
      });
    });

    const btnClear = document.getElementById('btn-pin-clear');
    if (btnClear) {
      btnClear.addEventListener('click', () => this.clearPin());
    }

    const btnSubmit = document.getElementById('btn-pin-submit');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => this.submitPin());
    }

    // Suporte para teclado físico
    window.addEventListener('keydown', (e) => {
      this.resetAutoLockTimer();
      if (!this.isLocked) return;
      if (e.key >= '0' && e.key <= '9') {
        this.handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        this.clearPin();
      } else if (e.key === 'Enter') {
        this.submitPin();
      }
    });

    // Detetor de atividade para reiniciar temporizador de auto-lock
    ['pointerdown', 'mousemove', 'wheel', 'touchstart'].forEach((evt) => {
      window.addEventListener(evt, () => this.resetAutoLockTimer(), { passive: true });
    });
  }

  public initPinStatus(status: PinStatusData | null) {
    if (!status) return;
    this.pinRequired = status.pin_required;
    this.autoLockMinutes = status.auto_lock_minutes || 5;
    if (this.pinRequired && status.is_locked) {
      this.lockCockpit();
    }
  }

  public lockCockpit() {
    this.isLocked = true;
    this.enteredPin = '';
    this.updatePinDisplay();
    const modal = document.getElementById('modal-pin-lock');
    if (modal) modal.style.display = 'flex';
    const err = document.getElementById('pin-error-msg');
    if (err) err.textContent = '';
    soundFX.playAlert();
    window.dispatchEvent(new CustomEvent('jarvis-cockpit-locked', { detail: { locked: true } }));
  }

  public unlockCockpit() {
    this.isLocked = false;
    this.enteredPin = '';
    const modal = document.getElementById('modal-pin-lock');
    if (modal) modal.style.display = 'none';
    soundFX.playSuccessTone();
    this.resetAutoLockTimer();
    window.dispatchEvent(new CustomEvent('jarvis-cockpit-locked', { detail: { locked: false } }));
  }

  private handlePinDigit(digit: string) {
    if (this.enteredPin.length < 4) {
      this.enteredPin += digit;
      soundFX.playClick();
      this.updatePinDisplay();
      if (this.enteredPin.length === 4) {
        setTimeout(() => this.submitPin(), 140);
      }
    }
  }

  private clearPin() {
    if (this.enteredPin.length > 0) {
      this.enteredPin = this.enteredPin.slice(0, -1);
      soundFX.playClick();
      this.updatePinDisplay();
    }
  }

  private async submitPin() {
    if (this.enteredPin.length === 0) return;
    const err = document.getElementById('pin-error-msg');
    const isValid = await api.verifyPin(this.enteredPin);
    if (isValid) {
      this.unlockCockpit();
    } else {
      soundFX.playAlert();
      if (err) err.textContent = '❌ PIN incorreto. Tente novamente.';
      this.enteredPin = '';
      this.updatePinDisplay();
    }
  }

  private updatePinDisplay() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pin-dot-${i}`);
      if (dot) {
        if (i < this.enteredPin.length) {
          dot.classList.add('filled');
        } else {
          dot.classList.remove('filled');
        }
      }
    }
  }

  private resetAutoLockTimer() {
    if (this.autoLockTimeout) clearTimeout(this.autoLockTimeout);
    if (!this.pinRequired) return;
    this.autoLockTimeout = setTimeout(() => {
      if (!this.isLocked) {
        this.lockCockpit();
      }
    }, this.autoLockMinutes * 60 * 1000);
  }

  /* ============================================================================
   * 2. EXPLORADOR DE ENTIDADES & GESTÃO DINÂMICA DE DISPOSITIVOS NO HUD
   * ============================================================================ */
  private bindDeviceExplorerEvents() {
    const btnClose = document.getElementById('btn-close-device-explorer');
    if (btnClose) btnClose.addEventListener('click', () => this.closeDeviceExplorer());

    const btnSave = document.getElementById('btn-save-explorer-favorites');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        this.saveFavorites();
        this.closeDeviceExplorer();
      });
    }

    const searchInput = document.getElementById('explorer-search-input') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.renderDeviceExplorerList(searchInput.value);
      });
    }
  }

  public openDeviceExplorer() {
    const modal = document.getElementById('modal-device-explorer');
    if (modal) modal.style.display = 'flex';
    soundFX.playClick();
    this.renderDeviceExplorerList();
  }

  public closeDeviceExplorer() {
    const modal = document.getElementById('modal-device-explorer');
    if (modal) modal.style.display = 'none';
  }

  public setFavorites(favs: string[]) {
    this.favoriteEntityIds = favs;
    if (this.currentTab === 'home') this.renderHome();
  }

  public async toggleFavorite(entityId: string) {
    soundFX.playClick();
    const idx = this.favoriteEntityIds.indexOf(entityId);
    if (idx >= 0) {
      this.favoriteEntityIds.splice(idx, 1);
    } else {
      this.favoriteEntityIds.push(entityId);
    }
    await this.saveFavorites();
    if (this.currentTab === 'home') this.renderHome();
  }

  private async saveFavorites() {
    await api.saveFavorites(this.favoriteEntityIds);
    window.dispatchEvent(new CustomEvent('jarvis-favorites-updated', { detail: { favorites: this.favoriteEntityIds } }));
  }

  private renderDeviceExplorerList(query: string = '') {
    const listEl = document.getElementById('explorer-entities-list');
    const countEl = document.getElementById('explorer-pinned-count');
    if (countEl) countEl.textContent = `${this.favoriteEntityIds.length} dispositivos fixados`;
    if (!listEl) return;

    const entities = (this.homeData?.authorized_entities || []).filter(e => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return e.friendly_name.toLowerCase().includes(q) || e.entity_id.toLowerCase().includes(q) || (e.area_name && e.area_name.toLowerCase().includes(q));
    });

    if (entities.length === 0) {
      listEl.innerHTML = `<div style="color: var(--color-text-dim); padding: 16px; text-align: center; font-size: 0.8rem;">Nenhum dispositivo encontrado.</div>`;
      return;
    }

    listEl.innerHTML = entities.map(e => {
      const isPinned = this.favoriteEntityIds.includes(e.entity_id);
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(5,11,20,0.7); border: 1px solid ${isPinned ? 'var(--color-primary-cyan)' : 'rgba(255,255,255,0.1)'}; border-radius: 4px;">
          <div>
            <div style="font-weight: bold; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim); font-family: monospace;">${e.entity_id} ${e.area_name ? `• 📍 ${e.area_name}` : ''}</div>
          </div>
          <button class="action-btn toggle-explorer-pin-btn" data-entity-id="${e.entity_id}" style="padding: 4px 10px; font-size: 0.72rem; ${isPinned ? 'background: rgba(255,183,0,0.25); border-color: #ffb700; color: #ffb700;' : 'background: rgba(0,229,255,0.15); color: #fff;'}">
            ${isPinned ? '⭐ FIXADO' : '📌 FIXAR'}
          </button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.toggle-explorer-pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const entId = (e.currentTarget as HTMLElement).getAttribute('data-entity-id');
        if (entId) {
          this.toggleFavorite(entId);
          this.renderDeviceExplorerList((document.getElementById('explorer-search-input') as HTMLInputElement)?.value || '');
        }
      });
    });
  }

  /* ============================================================================
   * 3. HOLD-TO-CONFIRM (PROTEÇÃO DE COMANDOS CRÍTICOS EM XR E 2D)
   * ============================================================================ */
  private attachHoldToConfirm(btn: HTMLElement, onConfirm: () => void, durationMs: number = 1500) {
    let startTime = 0;
    let animId: any = null;

    const startHold = (e: Event) => {
      e.preventDefault();
      startTime = Date.now();
      soundFX.playClick();

      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / durationMs) * 100, 100);
        btn.style.setProperty('--hold-progress', `${progress}%`);

        if (elapsed >= durationMs) {
          btn.style.setProperty('--hold-progress', '0%');
          soundFX.playSuccessTone();
          onConfirm();
        } else {
          animId = requestAnimationFrame(updateProgress);
        }
      };

      animId = requestAnimationFrame(updateProgress);
    };

    const cancelHold = () => {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      btn.style.setProperty('--hold-progress', '0%');
    };

    btn.addEventListener('pointerdown', startHold);
    btn.addEventListener('pointerup', cancelHold);
    btn.addEventListener('pointercancel', cancelHold);
    btn.addEventListener('mouseleave', cancelHold);
  }

  /* ============================================================================
   * 4. MINI GRÁFICOS SPARKLINES DE TENDÊNCIA
   * ============================================================================ */
  private pushTrendPoint(rx: number, tx: number, cpu: number, temp: number) {
    const maxPoints = 25;
    this.trends.wan_rx.push(rx);
    if (this.trends.wan_rx.length > maxPoints) this.trends.wan_rx.shift();

    this.trends.wan_tx.push(tx);
    if (this.trends.wan_tx.length > maxPoints) this.trends.wan_tx.shift();

    this.trends.cpu.push(cpu);
    if (this.trends.cpu.length > maxPoints) this.trends.cpu.shift();

    this.trends.temp.push(temp);
    if (this.trends.temp.length > maxPoints) this.trends.temp.shift();
  }

  private drawSparkline(canvasId: string, data: number[], color: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const min = 0;
    const max = Math.max(...data, 1);
    const step = w / (data.length - 1);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    data.forEach((val, i) => {
      const x = i * step;
      const y = h - ((val - min) / (max - min)) * (h - 6) - 3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color === '#00ff9d' ? 'rgba(0, 255, 157, 0.15)' : 'rgba(0, 229, 255, 0.15)';
    ctx.fill();
  }

  public switchTab(tab: string) {
    this.currentTab = tab;
    soundFX.playClick();
    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    this.render();
  }

  public setHomeViewMode(mode: 'native' | 'tactical') {
    this.homeViewMode = mode;
    if (this.currentTab === 'home') {
      this.render();
    }
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
    diagnosticsData?: FullDiagnosticsData | null,
    openwrtData?: OpenWrtSummaryData | null,
    dockerData?: DockerSummaryData | null,
    auditLogs?: AuditLogItem[] | null
  ) {
    this.demoData = demoData;
    this.commands = commands;
    if (homeData !== undefined) this.homeData = homeData;
    if (pveData !== undefined) this.pveData = pveData;
    if (dnsData !== undefined) this.dnsData = dnsData;
    if (servicesData !== undefined) this.servicesData = servicesData;
    if (diagnosticsData !== undefined) this.diagnosticsData = diagnosticsData;
    if (openwrtData !== undefined) this.openwrtData = openwrtData;
    if (dockerData !== undefined) this.dockerData = dockerData;
    if (auditLogs !== undefined && auditLogs) this.auditLogs = auditLogs;

    // Atualiza histórico de tendências (Sparklines)
    if (this.openwrtData || this.pveData) {
      this.pushTrendPoint(
        this.openwrtData?.wan_download_mbps || 0,
        this.openwrtData?.wan_upload_mbps || 0,
        this.pveData?.cpu_usage_percent || 0,
        this.openwrtData?.soc_temperature_celsius || 0
      );
    }

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
      case 'docker':
        this.renderDocker();
        break;
      case 'services':
        this.renderServices();
        break;
      case 'diagnostics':
        this.renderDiagnostics();
        break;
      case 'audit':
        this.renderAudit();
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

    // Determina o URL ativo para carregar o Dashboard do Home Assistant
    const isHttps = window.location.protocol === 'https:';
    let haUrl = this.selectedHaUrl;
    if (!haUrl) {
      const savedCustomUrl = localStorage.getItem('jarvis_ha_custom_url');
      if (savedCustomUrl) {
        haUrl = savedCustomUrl;
      } else if (isHttps && this.homeData?.fallback_url && this.homeData.fallback_url.startsWith('https://')) {
        haUrl = this.homeData.fallback_url;
      } else if (this.homeData?.active_url_used) {
        haUrl = this.homeData.active_url_used;
      } else if (this.homeData?.primary_url) {
        haUrl = this.homeData.primary_url;
      } else {
        haUrl = 'https://ha.bernaslab.top';
      }
    }

    // Se estiver no modo nativo, expande o cartão para widescreen
    const isWide = this.homeViewMode === 'native';

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
    const rawEntities = isReal ? (this.homeData!.authorized_entities || []) : [];
    const sensorsCount = rawEntities.filter(e => e.domain === 'sensor').length;

    const areasList = isReal && this.homeData!.areas && this.homeData!.areas.length > 0
      ? this.homeData!.areas
      : Array.from(new Set(rawEntities.map(e => e.area_name).filter(Boolean))) as string[];

    const query = this.homeSearchQuery.toLowerCase().trim();
    const filteredEntities = rawEntities.filter(ent => {
      if (query) {
        const matchName = ent.friendly_name.toLowerCase().includes(query);
        const matchId = ent.entity_id.toLowerCase().includes(query);
        const matchArea = (ent.area_name || '').toLowerCase().includes(query);
        if (!matchName && !matchId && !matchArea) return false;
      }
      if (this.homeActiveFilter === 'favorites') {
        return this.favoriteEntityIds.includes(ent.entity_id);
      }
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
      { id: 'favorites', label: `⭐ FIXADOS (${this.favoriteEntityIds.length})` },
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
      <div class="panel-card ${isWide ? 'panel-wide' : ''}">
        <!-- Cabeçalho Principal -->
        <div class="panel-title" style="margin-bottom: 10px;">
          <span>DOMÓTICA // HOME ASSISTANT TOTAL</span>
          <span class="badge-demo" style="${isReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : ''}">
            ${isReal ? 'INTEGRAÇÃO TOTAL REAL' : 'DEMO'}
          </span>
        </div>

        <!-- Seletor de Modo Dual & Ações de Conexão -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; gap: 6px;">
            <button 
              class="action-btn" 
              id="btn-ha-view-native" 
              style="padding: 6px 14px; font-size: 0.75rem; font-weight: bold; cursor: pointer; border-radius: 4px; ${this.homeViewMode === 'native' ? 'background: rgba(0, 229, 255, 0.3); border-color: var(--color-primary-cyan); color: #fff; box-shadow: 0 0 10px rgba(0,229,255,0.4);' : 'background: rgba(5,11,20,0.6); color: var(--color-text-dim);'}"
            >
              🖥️ DASHBOARD & DEFINIÇÕES HA
            </button>
            <button 
              class="action-btn" 
              id="btn-ha-view-tactical" 
              style="padding: 6px 14px; font-size: 0.75rem; font-weight: bold; cursor: pointer; border-radius: 4px; ${this.homeViewMode === 'tactical' ? 'background: rgba(0, 229, 255, 0.3); border-color: var(--color-primary-cyan); color: #fff; box-shadow: 0 0 10px rgba(0,229,255,0.4);' : 'background: rgba(5,11,20,0.6); color: var(--color-text-dim);'}"
            >
              🌌 HUD HOLOGRÁFICO TÁTICO
            </button>
          </div>

          <div style="display: flex; gap: 6px; align-items: center;">
            ${(this.homeData?.fallback_url && this.homeData?.primary_url && this.homeData.fallback_url !== this.homeData.primary_url) ? `
              <button class="action-btn" id="btn-ha-switch-url" style="padding: 5px 9px; font-size: 0.68rem;" title="Alternar entre endereço local e externo">
                🌐 ${haUrl.startsWith('https') ? 'HTTPS (Domínio)' : 'IP Local (:8123)'}
              </button>
            ` : ''}
            <button class="action-btn" id="btn-ha-refresh-frame" style="padding: 5px 9px; font-size: 0.68rem;" title="Recarregar">
              ⟳ RECARREGAR
            </button>
            <button class="action-btn" id="btn-ha-open-new-window" style="padding: 5px 9px; font-size: 0.68rem;" title="Abrir em Nova Janela">
              ↗ ABRIR NAVEGADOR
            </button>
          </div>
        </div>

        ${this.homeViewMode === 'native' ? `
          <!-- MODO 1: WEBVIEW NATIVO COMPLETO DO HOME ASSISTANT -->
          <!-- Acesso Direto em Nova Janela (100% Funcional sem Restrições de Iframe) -->
          <div style="display: flex; gap: 8px; margin-bottom: 8px; justify-content: space-between; align-items: center; background: rgba(0, 229, 255, 0.12); border: 1px solid var(--color-primary-cyan); border-radius: 4px; padding: 8px 12px; flex-wrap: wrap;">
            <div>
              <span style="font-weight: bold; color: #fff; font-size: 0.82rem;">DASHBOARD COMPLETO (LOVELACE, HACS, DEFINIÇÕES)</span>
              <div style="font-size: 0.70rem; color: var(--color-text-dim); margin-top: 2px;">
                Se o quadro abaixo for bloqueado pelo navegador devido a políticas de segurança (SAMEORIGIN), use o botão ao lado:
              </div>
            </div>
            <button class="action-btn" id="btn-ha-launch-window" style="background: var(--color-primary-cyan); color: #000; font-weight: bold; padding: 7px 16px; font-size: 0.78rem; border: none; cursor: pointer; border-radius: 4px; box-shadow: 0 0 10px rgba(0,229,255,0.4);">
              🚀 ABRIR EM NOVA JANELA
            </button>
          </div>

          <!-- Barra de Navegação e Configuração de URL do Quadro -->
          <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 8px; background: rgba(0, 229, 255, 0.05); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(0, 229, 255, 0.2); flex-wrap: wrap;">
            <span style="font-size: 0.72rem; color: var(--color-primary-cyan); font-weight: bold;">ENDEREÇO:</span>
            <input 
              type="text" 
              id="input-ha-iframe-url" 
              value="${haUrl}" 
              placeholder="https://ha.bernaslab.top ou http://192.168.30.180:8123" 
              style="flex: 1; min-width: 220px; background: rgba(5, 11, 20, 0.85); border: 1px solid rgba(0, 229, 255, 0.3); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-family: monospace;"
            />
            <button class="action-btn" id="btn-ha-apply-url" style="padding: 4px 10px; font-size: 0.72rem;">CARREGAR</button>
            <button class="action-btn" id="btn-ha-quick-domain" style="padding: 4px 8px; font-size: 0.68rem;" title="Usar Domínio HTTPS Cosmos">DOMÍNIO HTTPS</button>
            <button class="action-btn" id="btn-ha-quick-local" style="padding: 4px 8px; font-size: 0.68rem;" title="Usar IP Local">LAN :8123</button>
          </div>

          <div style="position: relative; width: 100%; height: 75vh; min-height: 580px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(0, 229, 255, 0.4); background: #0c1017; box-shadow: 0 0 25px rgba(0, 229, 255, 0.15);">
            <iframe
              id="ha-native-iframe"
              src="${haUrl}"
              style="width: 100%; height: 100%; border: none; display: block;"
              allow="fullscreen; autoplay; camera; microphone; geolocation"
            ></iframe>
          </div>

          <!-- Diagnóstico Dinâmico de Erro e Instruções de Desbloqueio -->
          <div style="margin-top: 8px; padding: 10px 12px; background: rgba(255, 183, 0, 0.07); border: 1px solid rgba(255, 183, 0, 0.3); border-radius: 4px; font-size: 0.72rem; color: #ffca4a;">
            <strong>⚠️ "ha.bernaslab.top recusou estabelecer ligação"? Solução em 2 passos:</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0; line-height: 1.55; color: var(--color-text-dim);">
              <li><strong style="color: #fff;">1. Cosmos Reverse Proxy (Causa Principal):</strong> No painel do Cosmos (<code style="color: var(--color-primary-cyan);">192.168.30.237</code>), vá a <em>URL Routes</em> &gt; edite a rota de <em>ha.bernaslab.top</em> &gt; <em>Security / Smart-Shield</em> &gt; <strong>desative "Prevent Clickjacking"</strong> (o Cosmos injeta <code>frame-ancestors 'self'</code> e bloqueia iframes).</li>
              <li><strong style="color: #fff;">2. Reiniciar o Core do Home Assistant:</strong> Depois de editar o <code>configuration.yaml</code> com <code>use_x_frame_options: false</code>, tem de <strong>reiniciar o Home Assistant</strong> (Definições &gt; Sistema &gt; Reiniciar) para o servidor libertar a restrição.</li>
              <li><strong style="color: #fff;">3. Acesso Imediato:</strong> Pode alternar a qualquer momento para o <strong style="color: var(--color-primary-cyan);">🌌 HUD HOLOGRÁFICO TÁTICO</strong> acima (funciona 100% diretamente via API do backend sem bloqueios de browser).</li>
            </ul>
          </div>
        ` : `
          <!-- MODO 2: HUD HOLOGRÁFICO TÁTICO COM CARTÕES LOVELACE MUSHROOM -->
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

          ${(this.homeData?.low_battery_devices && this.homeData.low_battery_devices.length > 0) || (this.homeData?.open_perimeters && this.homeData.open_perimeters.length > 0) ? `
            <div style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px;">
              ${this.homeData?.open_perimeters && this.homeData.open_perimeters.length > 0 ? `
                <div style="background: rgba(255, 51, 102, 0.15); border: 1px solid #ff3366; border-radius: 4px; padding: 6px 10px; font-size: 0.72rem; color: #ff8fa3;">
                  ⚠️ <strong>PERÍMETRO ABERTO:</strong> ${this.homeData.open_perimeters.join(', ')}
                </div>
              ` : ''}
              ${this.homeData?.low_battery_devices && this.homeData.low_battery_devices.length > 0 ? `
                <div style="background: rgba(255, 183, 0, 0.12); border: 1px solid #ffb700; border-radius: 4px; padding: 6px 10px; font-size: 0.72rem; color: #ffca4a;">
                  🪫 <strong>BATERIA FRACA (&lt;20%):</strong> ${this.homeData.low_battery_devices.map(b => `${b.name} (${b.level}%)`).join(', ')}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Barra de Pesquisa e Botão de Adicionar Dispositivos ao HUD -->
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <input 
              type="text" 
              id="ha-search-input" 
              placeholder="🔍 Filtrar dispositivos, divisões ou tipos..." 
              value="${this.homeSearchQuery}"
              style="flex: 1; box-sizing: border-box; background: rgba(5, 11, 20, 0.8); border: 1px solid rgba(0, 229, 255, 0.3); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 0.75rem; font-family: monospace;"
            />
            <button id="btn-open-explorer" class="action-btn" style="padding: 6px 12px; font-size: 0.72rem; background: rgba(0, 229, 255, 0.2); border-color: var(--color-primary-cyan); white-space: nowrap;">
              ➕ ADICIONAR AO HUD
            </button>
          </div>
          <div style="margin-bottom: 10px;">
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

          <!-- Grelha de Dispositivos Holográficos -->
          <div id="ha-entities-container" style="max-height: 520px; overflow-y: auto; padding-right: 4px;">
            ${filteredEntities.length === 0 ? `
              <div style="text-align: center; padding: 24px; color: var(--color-text-dim); font-size: 0.8rem;">
                Nenhum dispositivo encontrado com os filtros atuais.
              </div>
            ` : this.renderEntitiesList(filteredEntities, this.homeActiveFilter === 'areas')}
          </div>
        `}
      </div>
    `;

    // Interatividade da Alternância de Modos (Nativo vs Tático)
    const btnNative = document.getElementById('btn-ha-view-native');
    const btnTactical = document.getElementById('btn-ha-view-tactical');
    if (btnNative) {
      btnNative.addEventListener('click', () => {
        soundFX.playClick();
        this.homeViewMode = 'native';
        this.renderHome();
      });
    }
    if (btnTactical) {
      btnTactical.addEventListener('click', () => {
        soundFX.playClick();
        this.homeViewMode = 'tactical';
        this.renderHome();
      });
    }

    // Interatividade da Barra de Endereço Customizado do HA
    const inputIframeUrl = document.getElementById('input-ha-iframe-url') as HTMLInputElement | null;
    const btnApplyUrl = document.getElementById('btn-ha-apply-url');
    const btnQuickDomain = document.getElementById('btn-ha-quick-domain');
    const btnQuickLocal = document.getElementById('btn-ha-quick-local');

    const updateCustomUrl = (newUrl: string) => {
      soundFX.playClick();
      const trimmed = newUrl.trim();
      if (trimmed) {
        this.selectedHaUrl = trimmed;
        localStorage.setItem('jarvis_ha_custom_url', trimmed);
        this.renderHome();
      }
    };

    if (btnApplyUrl && inputIframeUrl) {
      btnApplyUrl.addEventListener('click', () => updateCustomUrl(inputIframeUrl.value));
    }
    if (inputIframeUrl) {
      inputIframeUrl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') updateCustomUrl(inputIframeUrl.value);
      });
    }
    if (btnQuickDomain) {
      btnQuickDomain.addEventListener('click', () => {
        const domainUrl = this.homeData?.fallback_url || 'https://ha.bernaslab.top';
        updateCustomUrl(domainUrl);
      });
    }
    if (btnQuickLocal) {
      btnQuickLocal.addEventListener('click', () => {
        const localUrl = this.homeData?.primary_url || 'http://192.168.30.180:8123';
        updateCustomUrl(localUrl);
      });
    }

    const btnLaunchWindow = document.getElementById('btn-ha-launch-window');
    if (btnLaunchWindow) {
      btnLaunchWindow.addEventListener('click', () => {
        soundFX.playClick();
        window.open(haUrl, '_blank');
      });
    }

    // Interatividade de Ações de Topo (Recarregar, Alternar URL, Nova Janela)
    const btnReload = document.getElementById('btn-ha-refresh-frame');
    if (btnReload) {
      btnReload.addEventListener('click', () => {
        soundFX.playClick();
        const iframe = document.getElementById('ha-native-iframe') as HTMLIFrameElement | null;
        if (iframe) {
          iframe.src = iframe.src;
        } else {
          window.dispatchEvent(new CustomEvent('jarvis-reload-data'));
        }
      });
    }

    const btnOpenWindow = document.getElementById('btn-ha-open-new-window');
    if (btnOpenWindow) {
      btnOpenWindow.addEventListener('click', () => {
        soundFX.playClick();
        window.open(haUrl, '_blank');
      });
    }

    const btnSwitchUrl = document.getElementById('btn-ha-switch-url');
    if (btnSwitchUrl) {
      btnSwitchUrl.addEventListener('click', () => {
        soundFX.playClick();
        if (this.homeData?.primary_url && this.homeData?.fallback_url) {
          this.selectedHaUrl = (haUrl === this.homeData.primary_url) ? this.homeData.fallback_url : this.homeData.primary_url;
        }
        this.renderHome();
      });
    }

    // Interatividade do Botão de Abrir Explorador de Dispositivos
    const btnOpenExplorer = document.getElementById('btn-open-explorer');
    if (btnOpenExplorer) {
      btnOpenExplorer.addEventListener('click', () => this.openDeviceExplorer());
    }

    // Interatividade dos Botões de Fixar/Desafixar Favoritos nos Cartões
    this.mainPanel.querySelectorAll('.pin-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const entId = (ev.currentTarget as HTMLElement).getAttribute('data-entity-id');
        if (entId) this.toggleFavorite(entId);
      });
    });

    // Interatividade da Pesquisa em Tempo Real (modo tático)
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

    // Interatividade dos Botões de Filtro (modo tático)
    this.mainPanel.querySelectorAll('.ha-filter-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        this.homeActiveFilter = target.getAttribute('data-filter') || 'all';
        this.renderHome();
      });
    });

    // Interatividade das Ações de Dispositivos nos Cartões
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
   * Renderiza a grelha de entidades em estilo Mushroom / Tile Cards Glassmorphism
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
        <div style="margin-bottom: 16px; background: rgba(0, 15, 30, 0.4); border: 1px solid rgba(0, 229, 255, 0.2); border-radius: 8px; padding: 10px;">
          <div style="font-weight: bold; color: var(--color-primary-cyan); font-size: 0.8rem; border-bottom: 1px dashed rgba(0, 229, 255, 0.25); padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between;">
            <span>📍 ${areaName.toUpperCase()}</span>
            <span style="font-size: 0.7rem; color: var(--color-text-dim);">${areaEntities.length} dispositivo(s)</span>
          </div>
          <div class="ha-tile-grid">
            ${areaEntities.map(ent => this.renderEntityTile(ent)).join('')}
          </div>
        </div>
      `).join('');
    }

    return `
      <div class="ha-tile-grid">
        ${entities.map(ent => this.renderEntityTile(ent)).join('')}
      </div>
    `;
  }

  /**
   * Renderiza um cartão tático moderno estilo Lovelace Mushroom Tile
   */
  private renderEntityTile(e: EntityState): string {
    const domain = e.domain;
    const isStateOn = e.state === 'on' || e.state === 'open' || e.state === 'playing' || e.state === 'active';
    const isPinned = this.favoriteEntityIds.includes(e.entity_id);
    const pinBtn = `
      <button class="pin-toggle-btn" data-entity-id="${e.entity_id}" title="${isPinned ? 'Desafixar do HUD' : 'Fixar ao HUD'}" style="background: none; border: none; font-size: 0.95rem; cursor: pointer; color: ${isPinned ? '#ffb700' : 'rgba(255,255,255,0.3)'}; line-height: 1; padding: 2px;">
        ${isPinned ? '⭐' : '☆'}
      </button>
    `;
    const areaTag = e.area_name ? `<span style="font-size: 0.65rem; color: var(--color-primary-cyan);">📍 ${e.area_name}</span>` : '';

    // 1. ILUMINAÇÃO (Light)
    if (domain === 'light') {
      return `
        <div class="ha-tile-card ${isStateOn ? 'active' : ''}">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <div class="ha-tile-avatar ${isStateOn ? 'on' : ''}">💡</div>
            <div style="overflow: hidden; flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 700; color: #fff; font-size: 0.82rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${e.friendly_name}</div>
                ${pinBtn}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <span style="font-size: 0.68rem; color: ${isStateOn ? '#ffb700' : 'var(--color-text-dim)'}; font-weight: bold;">${e.state.toUpperCase()}</span>
                ${areaTag}
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="light" data-action="toggle" style="flex: 1; padding: 6px; font-size: 0.7rem; font-weight: bold; background: ${isStateOn ? 'rgba(255, 183, 0, 0.25)' : 'rgba(0,0,0,0.4)'}; border: 1px solid ${isStateOn ? '#ffb700' : 'rgba(255,255,255,0.2)'}; color: ${isStateOn ? '#ffb700' : '#fff'}; border-radius: 4px; cursor: pointer;">
              ${isStateOn ? 'DESLIGAR' : 'LIGAR'}
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="light" data-action="on" data-payload='{"brightness": 128}' style="padding: 6px 8px; font-size: 0.68rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 4px; cursor: pointer;">
              50%
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="light" data-action="on" data-payload='{"brightness": 255}' style="padding: 6px 8px; font-size: 0.68rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 4px; cursor: pointer;">
              100%
            </button>
          </div>
        </div>
      `;
    }

    // 2. TOMADAS / INTERRUPTORES (Switch / Plug)
    if (domain === 'switch' || domain === 'input_boolean') {
      return `
        <div class="ha-tile-card ${isStateOn ? 'active' : ''}">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <div class="ha-tile-avatar ${isStateOn ? 'on' : ''}">🔌</div>
            <div style="overflow: hidden; flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 700; color: #fff; font-size: 0.82rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${e.friendly_name}</div>
                ${pinBtn}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <span style="font-size: 0.68rem; color: ${isStateOn ? '#00ff9d' : 'var(--color-text-dim)'}; font-weight: bold;">${e.state.toUpperCase()}</span>
                ${areaTag}
              </div>
            </div>
          </div>
          <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="switch" data-action="toggle" style="width: 100%; padding: 6px; font-size: 0.72rem; font-weight: bold; background: ${isStateOn ? 'rgba(0, 255, 157, 0.25)' : 'rgba(0,0,0,0.4)'}; border: 1px solid ${isStateOn ? '#00ff9d' : 'rgba(255,255,255,0.2)'}; color: ${isStateOn ? '#00ff9d' : '#fff'}; border-radius: 4px; cursor: pointer;">
            ${isStateOn ? 'DESLIGAR TOMADA' : 'LIGAR TOMADA'}
          </button>
        </div>
      `;
    }

    // 3. CLIMATIZAÇÃO (Climate / AC / Termostato)
    if (domain === 'climate') {
      const targetTemp = e.attributes.temperature ?? 'N/D';
      const currentTemp = e.attributes.current_temperature ?? 'N/D';
      return `
        <div class="ha-tile-card active" style="grid-column: span 1;">
          <div style="display: flex; align-items: center; margin-bottom: 6px;">
            <div class="ha-tile-avatar on">❄️</div>
            <div style="overflow: hidden; flex: 1;">
              <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
              <div style="font-size: 0.68rem; color: var(--color-primary-cyan);">
                Atual: <strong>${currentTemp}°C</strong> | Alvo: <strong style="color: #ffb700;">${targetTemp}°C</strong>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 4px; margin-bottom: 6px;">
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_temperature" data-payload='{"temperature": ${Number(targetTemp || 20) - 0.5}}' style="flex: 1; padding: 4px; font-size: 0.75rem; font-weight: bold; background: rgba(0, 229, 255, 0.2); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 3px; cursor: pointer;">
              -0.5°C
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_temperature" data-payload='{"temperature": ${Number(targetTemp || 20) + 0.5}}' style="flex: 1; padding: 4px; font-size: 0.75rem; font-weight: bold; background: rgba(0, 229, 255, 0.2); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 3px; cursor: pointer;">
              +0.5°C
            </button>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_hvac_mode" data-payload='{"hvac_mode": "heat"}' style="flex: 1; padding: 4px; font-size: 0.65rem; background: rgba(255, 85, 0, 0.2); border: 1px solid #ff5500; color: #ffaa88; border-radius: 3px; cursor: pointer;">
              🔥 AQUECER
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_hvac_mode" data-payload='{"hvac_mode": "cool"}' style="flex: 1; padding: 4px; font-size: 0.65rem; background: rgba(0, 229, 255, 0.2); border: 1px solid #00e5ff; color: #00e5ff; border-radius: 3px; cursor: pointer;">
              ❄️ ARREFECER
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="climate" data-action="set_hvac_mode" data-payload='{"hvac_mode": "off"}' style="flex: 1; padding: 4px; font-size: 0.65rem; background: rgba(255, 51, 102, 0.2); border: 1px solid #ff3366; color: #ff6688; border-radius: 3px; cursor: pointer;">
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
        <div class="ha-tile-card ${isStateOn ? 'active' : ''}">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <div class="ha-tile-avatar on">🪟</div>
            <div style="overflow: hidden; flex: 1;">
              <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
              <div style="font-size: 0.68rem; color: var(--color-text-dim);">Estado: ${e.state.toUpperCase()} ${pos !== undefined ? `(${pos}%)` : ''}</div>
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="cover" data-action="open" style="flex: 1; padding: 5px; font-size: 0.68rem; background: rgba(0, 255, 157, 0.2); border: 1px solid #00ff9d; color: #fff; border-radius: 4px; cursor: pointer;">
              ▲ ABRIR
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="cover" data-action="stop" style="flex: 1; padding: 5px; font-size: 0.68rem; background: rgba(255, 183, 0, 0.2); border: 1px solid #ffb700; color: #fff; border-radius: 4px; cursor: pointer;">
              ■ PARAR
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="cover" data-action="close" style="flex: 1; padding: 5px; font-size: 0.68rem; background: rgba(255, 51, 102, 0.2); border: 1px solid #ff3366; color: #fff; border-radius: 4px; cursor: pointer;">
              ▼ FECHAR
            </button>
          </div>
        </div>
      `;
    }

    // 5. SEGURANÇA & SENSORES BINÁRIOS (Portas, Janelas, Fumo, Fuga de Água)
    if (domain === 'binary_sensor') {
      const devClass = e.device_class || e.attributes.device_class || 'sensor';
      const isAlert = e.state === 'on';
      return `
        <div class="ha-tile-card ${isAlert ? 'active' : ''}" style="${isAlert ? 'border-color: #ff3366;' : ''}">
          <div style="display: flex; align-items: center;">
            <div class="ha-tile-avatar ${isAlert ? 'alert' : ''}">🛡️</div>
            <div style="overflow: hidden; flex: 1;">
              <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
              <div style="font-size: 0.68rem; color: var(--color-text-dim); margin-top: 2px;">${devClass.toUpperCase()}</div>
            </div>
            <span style="font-weight: bold; font-size: 0.72rem; color: ${isAlert ? '#ff3366' : '#00ff9d'}; padding: 4px 8px; border-radius: 4px; border: 1px solid ${isAlert ? '#ff3366' : '#00ff9d'}; background: ${isAlert ? 'rgba(255,51,102,0.15)' : 'rgba(0,255,157,0.15)'};">
              ${isAlert ? '⚠️ ABERTO' : '✓ SEGURO'}
            </span>
          </div>
        </div>
      `;
    }

    // 6. SENSORES DE TELEMETRIA (Temperatura, Humidade, Potência, etc.)
    if (domain === 'sensor') {
      const unit = e.unit_of_measurement || e.attributes.unit_of_measurement || '';
      return `
        <div class="ha-tile-card">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; overflow: hidden; flex: 1;">
              <div class="ha-tile-avatar">📊</div>
              <div style="overflow: hidden;">
                <div style="font-weight: 700; color: #fff; font-size: 0.82rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${e.friendly_name}</div>
                ${areaTag}
              </div>
            </div>
            <span style="font-weight: bold; color: var(--color-primary-cyan); font-size: 0.92rem; font-family: monospace; white-space: nowrap; margin-left: 8px;">
              ${e.state} ${unit}
            </span>
          </div>
        </div>
      `;
    }

    // 7. CENAS & SCRIPTS (Scene / Script)
    if (domain === 'scene' || domain === 'script') {
      return `
        <div class="ha-tile-card">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; overflow: hidden; flex: 1;">
              <div class="ha-tile-avatar on">🎬</div>
              <div style="overflow: hidden;">
                <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
                <div style="font-size: 0.65rem; color: var(--color-text-dim);">${domain.toUpperCase()}</div>
              </div>
            </div>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="${domain}" data-action="turn_on" style="padding: 6px 14px; font-size: 0.72rem; font-weight: bold; background: rgba(0, 229, 255, 0.25); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 4px; cursor: pointer;">
              ▶ ATIVAR
            </button>
          </div>
        </div>
      `;
    }

    // 8. MULTIMÉDIA (Media Player)
    if (domain === 'media_player') {
      const mediaTitle = e.attributes.media_title || e.attributes.app_name || '';
      return `
        <div class="ha-tile-card ${isStateOn ? 'active' : ''}">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <div class="ha-tile-avatar ${isStateOn ? 'on' : ''}">🎵</div>
            <div style="overflow: hidden; flex: 1;">
              <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
              <div style="font-size: 0.68rem; color: var(--color-text-dim);">${mediaTitle ? `A tocar: ${mediaTitle}` : e.state.toUpperCase()}</div>
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="media_player" data-action="play_pause" style="flex: 1; padding: 6px; font-size: 0.7rem; font-weight: bold; background: rgba(0, 229, 255, 0.2); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 4px; cursor: pointer;">
              ${isStateOn ? '⏸ PAUSAR' : '▶ REPRODUZIR'}
            </button>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="media_player" data-action="next" style="padding: 6px 12px; font-size: 0.7rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 4px; cursor: pointer;">
              ⏭
            </button>
          </div>
        </div>
      `;
    }

    // 9. CÂMARAS (Camera)
    if (domain === 'camera') {
      return `
        <div class="ha-tile-card">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; overflow: hidden; flex: 1;">
              <div class="ha-tile-avatar on">📹</div>
              <div style="overflow: hidden;">
                <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
                ${areaTag}
              </div>
            </div>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="camera" data-action="view_in_3d" style="padding: 6px 12px; font-size: 0.7rem; font-weight: bold; background: rgba(0, 255, 157, 0.25); border: 1px solid #00ff9d; color: #fff; border-radius: 4px; cursor: pointer;">
              👁️ VER NO 3D
            </button>
          </div>
        </div>
      `;
    }

    // 10. FECHADURAS (Lock)
    if (domain === 'lock') {
      const isLocked = e.state === 'locked';
      return `
        <div class="ha-tile-card">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; overflow: hidden; flex: 1;">
              <div class="ha-tile-avatar on">🔒</div>
              <div style="overflow: hidden;">
                <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
                <div style="font-size: 0.68rem; color: var(--color-text-dim);">${isLocked ? 'TRANCADA' : 'DESTRANCADA'}</div>
              </div>
            </div>
            <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="lock" data-action="${isLocked ? 'unlock' : 'lock'}" style="padding: 6px 12px; font-size: 0.7rem; font-weight: bold; background: ${isLocked ? 'rgba(0, 255, 157, 0.2)' : 'rgba(255, 51, 102, 0.2)'}; border: 1px solid ${isLocked ? '#00ff9d' : '#ff3366'}; color: #fff; border-radius: 4px; cursor: pointer;">
              ${isLocked ? 'DESTRANCAR' : 'TRANCAR'}
            </button>
          </div>
        </div>
      `;
    }

    // Cartão genérico para outros domínios
    return `
      <div class="ha-tile-card">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; overflow: hidden; flex: 1;">
            <div class="ha-tile-avatar">⚙️</div>
            <div style="overflow: hidden;">
              <div style="font-weight: 700; color: #fff; font-size: 0.82rem;">${e.friendly_name}</div>
              <div style="font-size: 0.65rem; color: var(--color-text-dim);">${domain.toUpperCase()} • ${e.state}</div>
            </div>
          </div>
          <button class="action-ha-btn" data-entity-id="${e.entity_id}" data-domain="${domain}" data-action="toggle" style="padding: 5px 10px; font-size: 0.68rem; background: rgba(0, 229, 255, 0.2); border: 1px solid var(--color-primary-cyan); color: #fff; border-radius: 4px; cursor: pointer;">
            ACIONAR
          </button>
        </div>
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

        <div class="sparkline-box">
          <div class="sparkline-header">
            <span>HISTÓRICO CPU HOST (%)</span>
            <span style="color: #00e5ff;">${cpu}%</span>
          </div>
          <canvas id="canvas-sparkline-cpu" class="sparkline-canvas" width="300" height="40"></canvas>
        </div>

        <div class="data-row">
          <span class="data-label">Memória RAM:</span>
          <span class="data-value">${ramUsed} GB / ${ramTotal} GB (${ramPercent}%)</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${Math.min(ramPercent, 100)}%"></div>
        </div>

        ${isReal ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; background: rgba(0, 229, 255, 0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(0, 229, 255, 0.15);">
            <div>
              <div style="font-size: 0.65rem; color: var(--color-text-dim);">DISCO I/O CLUSTER</div>
              <div style="font-weight: bold; color: #fff; font-size: 0.82rem; font-family: monospace;">
                R: ${(this.pveData?.total_disk_read_mbs || 0).toFixed(1)} <small>MB/s</small> | W: ${(this.pveData?.total_disk_write_mbs || 0).toFixed(1)} <small>MB/s</small>
              </div>
            </div>
            <div>
              <div style="font-size: 0.65rem; color: var(--color-text-dim);">REDE I/O CLUSTER</div>
              <div style="font-weight: bold; color: #00ff9d; font-size: 0.82rem; font-family: monospace;">
                IN: ${(this.pveData?.total_net_in_mbs || 0).toFixed(1)} <small>MB/s</small> | OUT: ${(this.pveData?.total_net_out_mbs || 0).toFixed(1)} <small>MB/s</small>
              </div>
            </div>
          </div>
        ` : ''}

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

        ${isReal && this.pveData!.disks && this.pveData!.disks.length > 0 ? `
          <div style="margin-top: 14px; font-weight: bold; color: var(--color-primary-cyan); font-size: 0.8rem;">
            DISCOS FÍSICOS & SAÚDE S.M.A.R.T.:
          </div>
          ${this.pveData!.disks.map(d => `
            <div class="data-row" style="padding: 3px 0; font-size: 0.72rem;">
              <span class="data-label">${d.devpath} <small style="color: #7da5c2">(${d.model || d.type || ''})</small>:</span>
              <span class="data-value" style="color: ${d.health === 'PASSED' || d.health === 'OK' ? '#00ff9d' : '#ff3366'}">
                SMART: ${d.health || 'OK'} ${d.wearout !== undefined && d.wearout !== null ? `(Desgaste: ${d.wearout}%)` : ''}
              </span>
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
                  <button class="entity-btn action-vm-btn btn-hold-critical" data-vmid="${vm.vmid}" data-vm-action="shutdown" data-vm-name="${vm.name}" data-critical="true" style="background: rgba(255,51,102,0.15); border-color: #ff3366; color: #ff3366;" title="Mantenha premido 1.5s para desligar">
                    <span>⏻ DESLIGAR (HOLD)</span>
                  </button>
                  <button class="entity-btn action-vm-btn btn-hold-critical" data-vmid="${vm.vmid}" data-vm-action="reboot" data-vm-name="${vm.name}" data-critical="true" style="background: rgba(255,183,0,0.15); border-color: #ffb700; color: #ffb700;" title="Mantenha premido 1.5s para reiniciar">
                    <span>⟳ REINICIAR (HOLD)</span>
                  </button>
                `}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;

    // Interatividade com ações de VM protegidas por Hold-to-Confirm
    this.mainPanel.querySelectorAll('.action-vm-btn').forEach(btn => {
      const isCritical = btn.getAttribute('data-critical') === 'true';
      const vmid = parseInt(btn.getAttribute('data-vmid') || '0', 10);
      const action = btn.getAttribute('data-vm-action') || '';
      const vmName = btn.getAttribute('data-vm-name') || '';

      const dispatchAction = () => {
        const customEvent = new CustomEvent('jarvis-action-vm', {
          detail: { vmid, action, vmName, confirmed: true }
        });
        window.dispatchEvent(customEvent);
      };

      if (isCritical) {
        this.attachHoldToConfirm(btn as HTMLElement, dispatchAction, 1500);
      } else {
        btn.addEventListener('click', dispatchAction);
      }
    });

    this.drawSparkline('canvas-sparkline-cpu', this.trends.cpu, '#00e5ff');
  }

  private renderNetwork() {
    const isDnsReal = this.dnsData && this.dnsData.configured && this.dnsData.status === 'operational';
    const provider = isDnsReal ? `${this.dnsData!.provider.toUpperCase()} [REAL]` : (this.demoData?.dns?.provider || 'ADGUARD HOME');
    const queries = isDnsReal ? this.dnsData!.queries_today : (this.demoData?.dns?.queries_today || 0);
    const blocked = isDnsReal ? this.dnsData!.blocked_today : (this.demoData?.dns?.blocked_today || 0);
    const blockPct = isDnsReal ? this.dnsData!.block_percentage : (this.demoData?.dns?.block_percentage || 0);
    const clients = isDnsReal ? this.dnsData!.clients_active : (this.demoData?.dns?.clients_active || 0);

    const ow = this.openwrtData;
    const isOwReal = Boolean(ow && ow.configured && ow.status === 'operational');
    const owConfigured = Boolean(ow && ow.configured);

    this.mainPanel.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- CARTÃO 1: GATEWAY & ROUTER NANOPIR3S (OPENWRT) -->
        <div class="panel-card">
          <div class="panel-title">
            <span>ROUTER & GATEWAY // NANOPIR3S (OPENWRT)</span>
            <span class="badge-demo" style="${isOwReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : owConfigured ? 'color: #ff3366; border-color: #ff3366; background: rgba(255, 51, 102, 0.15);' : ''}">
              ${isOwReal ? 'OPENWRT REAL' : owConfigured ? 'ERRO CONEXÃO' : 'NÃO CONFIGURADO'}
            </span>
          </div>

          ${isOwReal && ow ? `
            <div class="data-row">
              <span class="data-label">Dispositivo / Modelo:</span>
              <span class="data-value">${ow.hostname || 'OpenWrt'} <small style="color: #7da5c2">(${ow.model || 'NanoPi R3S'})</small></span>
            </div>
            <div class="data-row">
              <span class="data-label">Firmware / Kernel:</span>
              <span class="data-value" style="font-size: 0.72rem;">${ow.firmware_version || 'OpenWrt'} • Linux ${ow.kernel_version || ''}</span>
            </div>

            <!-- Taxas WAN em Tempo Real -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; background: rgba(0, 229, 255, 0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(0, 229, 255, 0.15);">
              <div>
                <div style="font-size: 0.65rem; color: var(--color-text-dim);">WAN DOWNLOAD</div>
                <div style="font-weight: bold; color: #00ff9d; font-size: 1.05rem; font-family: monospace;">
                  ↓ ${(ow.wan_download_mbps || 0).toFixed(2)} <span style="font-size: 0.65rem;">Mbps</span>
                </div>
              </div>
              <div>
                <div style="font-size: 0.65rem; color: var(--color-text-dim);">WAN UPLOAD</div>
                <div style="font-weight: bold; color: #00e5ff; font-size: 1.05rem; font-family: monospace;">
                  ↑ ${(ow.wan_upload_mbps || 0).toFixed(2)} <span style="font-size: 0.65rem;">Mbps</span>
                </div>
              </div>
            </div>

            <div class="sparkline-box">
              <div class="sparkline-header">
                <span>HISTÓRICO WAN DOWNLOAD (Mbps)</span>
                <span style="color: #00ff9d;">↓ ${(ow.wan_download_mbps || 0).toFixed(1)} Mbps</span>
              </div>
              <canvas id="canvas-sparkline-wan" class="sparkline-canvas" width="300" height="40"></canvas>
            </div>

            <div class="data-row">
              <span class="data-label">Temperatura SoC (Rockchip):</span>
              <span class="data-value" style="color: ${(ow.soc_temperature_celsius || 0) > 65 ? '#ff3366' : (ow.soc_temperature_celsius || 0) > 50 ? '#ffb700' : '#00ff9d'}; font-weight: bold;">
                ${ow.soc_temperature_celsius !== null && ow.soc_temperature_celsius !== undefined ? `${ow.soc_temperature_celsius.toFixed(1)} °C` : 'N/D'}
              </span>
            </div>

            <div class="data-row" style="margin-top: 6px;">
              <span class="data-label">Memória RAM:</span>
              <span class="data-value">${ow.ram_used_mb || 0} MB / ${ow.ram_total_mb || 0} MB (${ow.ram_usage_percent || 0}%)</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: ${Math.min(ow.ram_usage_percent || 0, 100)}%"></div>
            </div>

            <div class="data-row">
              <span class="data-label">Load Average (1m, 5m, 15m):</span>
              <span class="data-value" style="font-family: monospace;">
                ${ow.load_avg ? ow.load_avg.map((l: number) => l.toFixed(2)).join(', ') : 'N/D'}
              </span>
            </div>

            <div class="data-row">
              <span class="data-label">Tabela de Conexões Ativas:</span>
              <span class="data-value">${ow.active_connections_count || 0} estados</span>
            </div>

            <div class="data-row">
              <span class="data-label">Concessões DHCP Ativas:</span>
              <span class="data-value" style="color: #00ff9d;">${ow.dhcp_leases_count || 0} clientes</span>
            </div>

            ${ow.interfaces && ow.interfaces.length > 0 ? `
              <div style="margin-top: 10px; font-size: 0.75rem; font-weight: bold; color: var(--color-primary-cyan);">
                INTERFACES DE REDE GIGABIT:
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                ${ow.interfaces.map(iface => `
                  <div style="display: flex; justify-content: space-between; font-size: 0.72rem; padding: 4px 6px; background: rgba(5,11,20,0.5); border-radius: 3px; border-left: 2px solid ${iface.up ? '#00ff9d' : '#ff3366'};">
                    <span style="font-family: monospace; font-weight: bold;">${iface.name} <small style="color: #7da5c2">(${iface.up ? 'UP' : 'DOWN'})</small></span>
                    <span style="color: var(--color-text-dim); font-family: monospace;">
                      ↓ ${(iface.rx_bytes / (1024*1024)).toFixed(1)} MB | ↑ ${(iface.tx_bytes / (1024*1024)).toFixed(1)} MB
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          ` : owConfigured ? `
            <p class="data-label" style="color: #ff3366; font-size: 0.8rem;">
              ⚠️ Erro ao contactar NanoPi R3S via LuCI/Ubus RPC. Verifique IP e credenciais no .env.
            </p>
          ` : `
            <p class="data-label" style="font-size: 0.78rem; line-height: 1.5; color: var(--color-text-dim);">
              OpenWrt desativado ou não configurado. Defina <code>OPENWRT_ENABLED=true</code> e o IP do NanoPi R3S no seu <code>.env</code> ou Cosmos.
            </p>
          `}
        </div>

        <!-- CARTÃO 2: DNS & ESCUDO ADGUARD HOME -->
        <div class="panel-card">
          <div class="panel-title">
            <span>DNS // ESCUDO DE PROTEÇÃO (ADGUARD HOME)</span>
            <span class="badge-demo" style="${isDnsReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : ''}">
              ${isDnsReal ? 'ADGUARD REAL' : 'DEMO'}
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

          ${isDnsReal && this.dnsData!.avg_processing_time_ms !== undefined ? `
            <div class="data-row">
              <span class="data-label">Latência Média Upstream:</span>
              <span class="data-value" style="color: #00ff9d; font-family: monospace;">
                ${this.dnsData!.avg_processing_time_ms.toFixed(1)} ms
              </span>
            </div>
          ` : ''}

          ${isDnsReal && (this.dnsData!.total_rules_count || this.dnsData!.dns_rewrites_count) ? `
            <div class="data-row">
              <span class="data-label">Regras de Filtro & Rewrites:</span>
              <span class="data-value">
                ${(this.dnsData!.total_rules_count || 0).toLocaleString()} regras • ${this.dnsData!.dns_rewrites_count || 0} DNS rewrites
              </span>
            </div>
          ` : ''}

          ${isDnsReal && this.dnsData!.top_blocked_domains && this.dnsData!.top_blocked_domains.length > 0 ? `
            <div style="margin-top: 10px; font-size: 0.75rem; font-weight: bold; color: #ff3366;">
              TOP DOMÍNIOS BLOQUEADOS:
            </div>
            <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 4px;">
              ${this.dnsData!.top_blocked_domains.slice(0, 4).map((item: { domain: string; count: number }) => `
                <div style="display: flex; justify-content: space-between; font-size: 0.7rem; padding: 2px 4px; background: rgba(255, 51, 102, 0.08); border-radius: 2px;">
                  <span style="font-family: monospace; color: #ff8fa3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;">${item.domain}</span>
                  <span style="font-weight: bold; color: #fff;">${item.count.toLocaleString()}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    this.drawSparkline('canvas-sparkline-wan', this.trends.wan_rx, '#00ff9d');
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

  private renderDocker() {
    const isConfigured = Boolean(this.dockerData && this.dockerData.configured);
    const isReal = isConfigured && this.dockerData!.status === 'operational';
    const containers = isReal ? this.dockerData!.containers : [];

    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>CONTENTORES // DOCKER & COSMOS CLOUD</span>
          <span class="badge-demo" style="${isReal ? 'color: var(--color-success); border-color: var(--color-success); background: rgba(0, 255, 157, 0.1);' : ''}">
            ${isReal ? 'DOCKER REAL' : 'SEM SOCKET'}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; background: rgba(0, 229, 255, 0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(0, 229, 255, 0.15);">
          <div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">TOTAL CONTENTORES</div>
            <div style="font-weight: bold; color: #fff; font-size: 1.05rem; font-family: monospace;">
              ${isReal ? this.dockerData!.total_containers : 0}
            </div>
          </div>
          <div>
            <div style="font-size: 0.65rem; color: var(--color-text-dim);">EM EXECUÇÃO (UP)</div>
            <div style="font-weight: bold; color: #00ff9d; font-size: 1.05rem; font-family: monospace;">
              ${isReal ? this.dockerData!.running_containers : 0} ativos
            </div>
          </div>
        </div>

        ${!isReal ? `
          <div style="font-size: 0.78rem; color: var(--color-text-dim); line-height: 1.5; padding: 12px; background: rgba(0, 229, 255, 0.05); border: 1px dashed rgba(0, 229, 255, 0.2); border-radius: 4px;">
            💡 <strong>Telemetria de Contentores:</strong> Monte o volume <code>/var/run/docker.sock:/var/run/docker.sock:ro</code> no compose para ler o estado de cada container em tempo real.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 460px; overflow-y: auto;">
            ${containers.map(c => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(5,11,20,0.6); border-radius: 4px; border-left: 3px solid ${c.state === 'running' ? '#00ff9d' : '#ff3366'};">
                <div>
                  <div style="font-weight: bold; color: #fff; font-size: 0.82rem;">${c.name}</div>
                  <div style="font-size: 0.65rem; color: var(--color-text-dim); font-family: monospace;">
                    ${c.image} • <span style="color: #7da5c2;">${c.uptime}</span>
                  </div>
                </div>
                <span style="font-size: 0.7rem; font-weight: bold; color: ${c.state === 'running' ? '#00ff9d' : '#ff3366'}; background: ${c.state === 'running' ? 'rgba(0,255,157,0.1)' : 'rgba(255,51,102,0.1)'}; padding: 3px 6px; border-radius: 3px;">
                  ${c.state.toUpperCase()}
                </span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  private renderAudit() {
    this.mainPanel.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">
          <span>SEGURANÇA // CONSOLA DE AUDITORIA DE AÇÕES</span>
          <button class="action-btn" id="btn-refresh-audit" style="padding: 4px 10px; font-size: 0.7rem;">⟳ ATUALIZAR</button>
        </div>
        <p class="data-label" style="margin-bottom: 12px; font-size: 0.75rem;">
          Registo cronológico de operações executadas (Comandos, Ações Home Assistant, Proxmox e PIN):
        </p>

        ${this.auditLogs.length === 0 ? `
          <div style="font-size: 0.78rem; color: var(--color-text-dim); padding: 16px; text-align: center;">Nenhum evento registado na sessão atual.</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 5px; max-height: 480px; overflow-y: auto;">
            ${this.auditLogs.map(l => {
              const time = new Date(l.timestamp).toLocaleTimeString();
              const isAlert = l.event_type.includes('ALERT') || l.event_type.includes('FAILED');
              const isVm = l.event_type.includes('VM');
              const badgeColor = isAlert ? '#ff3366' : isVm ? '#b388ff' : '#00ff9d';
              return `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 10px; background: rgba(5,11,20,0.7); border-radius: 4px; border-left: 3px solid ${badgeColor}; font-size: 0.72rem;">
                  <div>
                    <div style="font-weight: bold; color: #fff;">
                      <span style="color: ${badgeColor};">[${l.event_type}]</span> ${l.target} ➔ ${l.action}
                    </div>
                    ${l.details ? `<div style="font-size: 0.65rem; color: var(--color-text-dim); margin-top: 2px;">${l.details}</div>` : ''}
                  </div>
                  <div style="text-align: right; color: #7da5c2; font-family: monospace; font-size: 0.65rem; white-space: nowrap; margin-left: 8px;">
                    ${time} • <small>${l.actor}</small>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    const btnRefresh = document.getElementById('btn-refresh-audit');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        soundFX.playClick();
        this.auditLogs = await api.getAuditLogs(50);
        this.renderAudit();
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

