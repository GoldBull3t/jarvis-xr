/**
 * Ponto de Entrada Principal da Aplicação JARVIS XR (WebXR + Hand Tracking + Desktop)
 */
import * as THREE from 'three';
import { JarvisCoreVisualizer } from './scene/core';
import { SceneBackgroundManager } from './scene/background';
import { SpatialPanelManager3D } from './panels/panel-manager';
import { UiOverlayManager } from './panels/ui-overlay';
import { XRManager } from './xr/xr-manager';
import { speechService } from './voice/speech-service';
import { api } from './api/client';
import type {
  DemoStatusData,
  JarvisCommand,
  HomeSummaryData,
  ProxmoxSummaryData,
  DnsSummaryData,
  ServiceHealthItem
} from './types';

class JarvisApp {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  private coreVisualizer: JarvisCoreVisualizer;
  private backgroundManager: SceneBackgroundManager;
  private spatialPanels: SpatialPanelManager3D;
  private uiOverlay: UiOverlayManager;
  private xrManager: XRManager;

  private isArActive: boolean = false;
  private xrSession: XRSession | null = null;
  public demoData: DemoStatusData | null = null;
  public homeData: HomeSummaryData | null = null;
  public pveData: ProxmoxSummaryData | null = null;
  public dnsData: DnsSummaryData | null = null;
  public servicesData: ServiceHealthItem[] | null = null;
  public commands: JarvisCommand[] = [];

  // Controlo simples com rato em desktop
  private isDragging: boolean = false;
  private prevMouseX: number = 0;
  private prevMouseY: number = 0;
  private cameraAngleX: number = 0;
  private cameraAngleY: number = 0;

  constructor() {
    this.container = document.getElementById('canvas-container')!;
    this.clock = new THREE.Clock();

    // 1. Inicializar Cena
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      50
    );
    this.camera.position.set(0, 0, 0.5);

    // 2. Inicializar Renderer com suporte WebXR
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // 3. Inicializar Componentes 3D e HUD
    this.backgroundManager = new SceneBackgroundManager(this.scene);
    this.coreVisualizer = new JarvisCoreVisualizer();
    this.scene.add(this.coreVisualizer.group);

    this.spatialPanels = new SpatialPanelManager3D();
    this.scene.add(this.spatialPanels.group);

    this.uiOverlay = new UiOverlayManager();

    // 4. Inicializar Gestor de WebXR e Controladores/Mãos
    this.xrManager = new XRManager(this.renderer, this.scene);
    this.setupXREvents();

    // 5. Configurar Eventos e Verificação de Recursos
    this.setupEventListeners();
    this.checkWebXRSupport();
    this.setupVoiceInteractions();

    // 6. Iniciar Ciclo de Renderização e Carregar Dados
    this.renderer.setAnimationLoop(this.animate.bind(this));
    this.loadInitialData();
  }

  private setupXREvents() {
    // Liga clique do raio laser / pinch aos botões nos painéis holográficos 3D
    this.xrManager.onSelectCallback = (event) => {
      this.spatialPanels.handleRaycastClick(event.intersectedObject, event.uv);
    };

    // Responde a ações disparadas pelos botões dentro dos painéis 3D
    this.spatialPanels.onPanelAction = async (action, panelId, _data) => {
      if (action === 'refresh_data') {
        this.speakFeedback('A atualizar métricas do homelab.');
        await this.loadInitialData();
      } else if (action === 'toggle_light') {
        this.speakFeedback('Comando enviado para a entidade do escritório.');
        await this.triggerCommand({ command_id: 'cmd_light_office_toggle' });
      } else if (action === 'close_panel') {
        this.speakFeedback(`Painel ${panelId} recolhido.`);
      }
    };
  }

  private setupEventListeners() {
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Rotação suave da câmara com o botão esquerdo do rato no modo Desktop
    window.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('#ui-overlay') && !(e.target as HTMLElement).classList.contains('hud-content')) {
        return;
      }
      this.isDragging = true;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || this.isArActive) return;
      const deltaX = e.clientX - this.prevMouseX;
      const deltaY = e.clientY - this.prevMouseY;

      this.cameraAngleY -= deltaX * 0.004;
      this.cameraAngleX = Math.max(-0.6, Math.min(0.6, this.cameraAngleX - deltaY * 0.003));

      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.cameraAngleY;
      this.camera.rotation.x = this.cameraAngleX;

      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    });

    // Escuta evento personalizado de teste de comando
    window.addEventListener('jarvis-run-command', (async (e: any) => {
      const cmdId = e.detail?.command_id;
      if (cmdId) {
        await this.triggerCommand({ command_id: cmdId });
      }
    }) as EventListener);

    // Escuta evento de alternância de entidade (Fase 4 - Home Assistant)
    window.addEventListener('jarvis-action-entity', (async (e: any) => {
      const { entityId, domain } = e.detail || {};
      if (entityId) {
        await this.toggleEntity(entityId, domain);
      }
    }) as EventListener);

    // Escuta evento de controlo seguro de VMs do Proxmox
    window.addEventListener('jarvis-action-vm', (async (e: any) => {
      const { vmid, action, vmName } = e.detail || {};
      if (vmid && action) {
        await this.handleVmAction(vmid, action, vmName);
      }
    }) as EventListener);

    // Escuta evento de recarregamento de dados (ex: após alterar chave de API)
    window.addEventListener('jarvis-reload-data', (async () => {
      await this.loadInitialData();
    }) as EventListener);

    // Escuta erro 401 de autenticação do backend
    window.addEventListener('jarvis-auth-error', (() => {
      this.uiOverlay.setConnectionState('error');
      this.uiOverlay.setVoiceFeedback('Autenticação necessária (HTTP 401). Abra a configuração de Chave no topo.');
      this.uiOverlay.openApiKeyModal();
    }) as EventListener);

    // Recuperação automática de suspensão do headset Meta Quest 3S
    document.addEventListener('visibilitychange', (async () => {
      if (document.visibilityState === 'visible') {
        console.log('Sessão reativada (Headset acordou). A sincronizar telemetria...');
        await this.loadInitialData();
        if (this.isArActive) {
          await api.sendPresence(true);
        }
      }
    }) as EventListener);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private async checkWebXRSupport() {
    const btnEnterXR = document.getElementById('btn-enter-xr') as HTMLButtonElement;
    const xrStatus = document.getElementById('xr-mode-status')!;

    if ('xr' in navigator && (navigator as any).xr) {
      const xr = (navigator as any).xr;
      const arSupported = await xr.isSessionSupported('immersive-ar').catch(() => false);
      const vrSupported = await xr.isSessionSupported('immersive-vr').catch(() => false);

      if (arSupported) {
        xrStatus.textContent = 'QUEST 3S (AR PASSTHROUGH)';
        btnEnterXR.textContent = 'INICIAR SESSÃO AR (PASSTHROUGH)';
        btnEnterXR.addEventListener('click', () => this.toggleXRSession('immersive-ar'));
      } else if (vrSupported) {
        xrStatus.textContent = 'VR DISPONÍVEL';
        btnEnterXR.textContent = 'INICIAR SESSÃO VR';
        btnEnterXR.addEventListener('click', () => this.toggleXRSession('immersive-vr'));
      } else {
        xrStatus.textContent = 'DESKTOP (SEM XR)';
        btnEnterXR.disabled = true;
        btnEnterXR.textContent = 'WEBXR INDISPONÍVEL';
      }
    } else {
      xrStatus.textContent = 'DESKTOP (SEM XR)';
      btnEnterXR.disabled = true;
      btnEnterXR.textContent = 'MODO DESKTOP ATIVO';
    }
  }

  private async toggleXRSession(mode: 'immersive-ar' | 'immersive-vr') {
    const xr = (navigator as any).xr;
    if (this.xrSession) {
      await this.xrSession.end();
      return;
    }

    try {
      const sessionInit: XRSessionInit = {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'hit-test', 'layers']
      };

      const session = await xr.requestSession(mode, sessionInit);
      this.xrSession = session;
      this.isArActive = (mode === 'immersive-ar');
      this.backgroundManager.setArPassthrough(this.isArActive);

      await this.renderer.xr.setSession(session);
      await api.sendPresence(true);

      const btnEnterXR = document.getElementById('btn-enter-xr') as HTMLButtonElement;
      btnEnterXR.textContent = 'SAIR DO MODO XR';

      session.addEventListener('end', async () => {
        this.xrSession = null;
        this.isArActive = false;
        this.backgroundManager.setArPassthrough(false);
        btnEnterXR.textContent = mode === 'immersive-ar' ? 'INICIAR SESSÃO AR (PASSTHROUGH)' : 'INICIAR SESSÃO VR';
        await api.sendPresence(false);
      });

      this.speakFeedback('Modo imersivo Meta Quest ativado. Tracking de mãos e controladores operacional.');
    } catch (err: any) {
      console.error('Falha ao iniciar WebXR:', err);
      alert(`Não foi possível iniciar WebXR: ${err?.message || err}`);
    }
  }

  private async loadInitialData() {
    try {
      await api.getHealth();
      this.uiOverlay.setConnectionState('online');

      const [demoRes, cmds, homeRes, pveRes, dnsRes, servicesRes] = await Promise.all([
        api.getDemoStatus().catch(() => null),
        api.getCommands().catch(() => []),
        api.getHomeSummary().catch((e) => { console.warn('Falha Home Assistant:', e); return null; }),
        api.getProxmoxSummary().catch((e) => { console.warn('Falha Proxmox:', e); return null; }),
        api.getDnsSummary().catch(() => null),
        api.getServices().catch(() => null)
      ]);

      const demo: DemoStatusData = demoRes || {
        is_mock: true,
        label: 'Dados de Demonstração',
        home: {
          temperature_celsius: 21.5,
          humidity_percent: 50,
          lights_on: 0,
          total_lights: 0,
          entities: []
        },
        proxmox: {
          cluster_name: 'pve',
          nodes_online: 1,
          total_nodes: 1,
          cpu_usage_percent: 0,
          ram_used_gb: 0,
          ram_total_gb: 0,
          ram_usage_percent: 0,
          vms_running: 0,
          total_vms: 0,
          vms: []
        },
        dns: {
          provider: 'none',
          status: 'inactive',
          queries_today: 0,
          blocked_today: 0,
          block_percentage: 0,
          clients_active: 0
        },
        services: []
      };

      this.demoData = demo;
      this.commands = cmds;
      this.homeData = homeRes;
      this.pveData = pveRes;
      this.dnsData = dnsRes;
      this.servicesData = servicesRes;

      this.uiOverlay.updateData(demo, cmds, homeRes, pveRes, dnsRes, servicesRes);

      // Atualiza os painéis espaciais 3D com dados consolidados
      this.updateSpatialPanelsData(demo, homeRes, pveRes, dnsRes);

      // Regista os meshes interativos no XR Manager
      this.xrManager.setInteractiveObjects(this.spatialPanels.getInteractiveMeshes());
    } catch (err) {
      console.warn('Backend offline ou inacessível. A carregar dados padrão de demonstração...', err);
      this.uiOverlay.setConnectionState('offline');
      this.coreVisualizer.setStatus('warning');
    }
  }

  private async toggleEntity(entityId: string, domain?: string) {
    try {
      let res;
      if (domain === 'switch' || entityId.startsWith('switch.')) {
        res = await api.actionSwitch(entityId, 'toggle');
      } else if (domain === 'cover' || entityId.startsWith('cover.')) {
        res = await api.actionCover({ entity_id: entityId, action: 'toggle' });
      } else if (domain === 'media_player' || entityId.startsWith('media_player.')) {
        res = await api.actionMediaPlayer({ entity_id: entityId, action: 'play_pause' });
      } else if (domain === 'climate' || entityId.startsWith('climate.')) {
        res = await api.actionClimate({ entity_id: entityId, action: 'set_hvac_mode', hvac_mode: 'heat' });
      } else if (domain === 'camera' || entityId.startsWith('camera.')) {
        window.open(api.getCameraSnapshotUrl(entityId), '_blank');
        this.speakFeedback('A carregar imagem instantânea da câmara.');
        return;
      } else {
        res = await api.actionLight(entityId, 'toggle');
      }
      this.speakFeedback(res.message);
      this.uiOverlay.setVoiceFeedback(res.message);
      await this.loadInitialData();
    } catch (err: any) {
      const msg = err.message || 'Falha ao executar ação na entidade';
      this.speakFeedback(msg);
      this.uiOverlay.setVoiceFeedback(msg);
    }
  }

  private async handleVmAction(vmid: number, action: 'start' | 'shutdown' | 'reboot', vmName?: string) {
    const actionLabel = action === 'start' ? 'LIGAR' : (action === 'shutdown' ? 'DESLIGAR (ACPI)' : 'REINICIAR');
    const msg = `Confirma que pretende ${actionLabel} a máquina virtual [${vmid}] ${vmName || ''}?`;
    if (!confirm(msg)) return;

    try {
      const res = await api.actionProxmoxVm(vmid, action, true);
      this.speakFeedback(res.message);
      this.uiOverlay.setVoiceFeedback(res.message);
      await this.loadInitialData();
    } catch (err: any) {
      const errMsg = err.message || 'Falha ao executar ação na VM Proxmox';
      this.speakFeedback(errMsg);
      this.uiOverlay.setVoiceFeedback(errMsg);
    }
  }

  private updateSpatialPanelsData(
    demo: DemoStatusData,
    home?: HomeSummaryData | null,
    pve?: ProxmoxSummaryData | null,
    dns?: DnsSummaryData | null
  ) {
    // 1. Painel Domótica
    if (home && home.configured && home.status === 'operational') {
      const temp = home.temperature_celsius ?? 'N/D';
      const hum = home.humidity_percent ?? 'N/D';
      const entLines = home.authorized_entities.slice(0, 2).map(
        e => `${e.friendly_name}: [${e.state.toUpperCase()}]`
      );

      this.spatialPanels.updatePanelContent('home', 'DOMÓTICA // HOME ASSISTANT [REAL]', [
        `Temp: ${temp} °C | Hum: ${hum}%`,
        `Luzes Ativas: ${home.lights_on} / ${home.total_lights} | Switches: ${home.switches_on}`,
        ...entLines
      ]);
    } else {
      this.spatialPanels.updatePanelContent('home', 'DOMÓTICA // HOME [DEMO]', [
        `Temp: ${demo.home.temperature_celsius} °C | Hum: ${demo.home.humidity_percent}%`,
        `Luzes Ativas: ${demo.home.lights_on} / ${demo.home.total_lights}`,
        `Entidade: ${demo.home.entities[0].name} [${demo.home.entities[0].state.toUpperCase()}]`,
        `Tomada: ${demo.home.entities[2].name} [${demo.home.entities[2].state.toUpperCase()}]`
      ]);
    }

    // 2. Painel Proxmox VE
    if (pve && pve.configured && pve.status === 'operational') {
      const topVm = pve.vms.length > 0 ? `[${pve.vms[0].vmid}] ${pve.vms[0].name} [${pve.vms[0].status.toUpperCase()}]` : 'Sem VMs ativas';
      this.spatialPanels.updatePanelContent('proxmox', 'PROXMOX // VE HOST [REAL]', [
        `Cluster: ${pve.cluster_name} (Nós: ${pve.nodes_online}/${pve.total_nodes})`,
        `CPU: ${pve.cpu_usage_percent}% | RAM: ${pve.ram_used_gb}/${pve.ram_total_gb}GB (${pve.ram_usage_percent}%)`,
        `VMs / Containers: ${pve.vms_running} ativos de ${pve.total_vms}`,
        topVm
      ]);
    } else {
      this.spatialPanels.updatePanelContent('proxmox', 'PROXMOX // VE HOST [DEMO]', [
        `Cluster: ${demo.proxmox.cluster_name}`,
        `CPU: ${demo.proxmox.cpu_usage_percent}% | RAM: ${demo.proxmox.ram_used_gb}/${demo.proxmox.ram_total_gb}GB`,
        `VMs Ativas: ${demo.proxmox.vms_running} / ${demo.proxmox.total_vms}`,
        `VM 100: ${demo.proxmox.vms[0].name} [RUNNING]`
      ]);
    }

    // 3. Painel Rede / DNS
    if (dns && dns.configured && dns.status === 'operational') {
      this.spatialPanels.updatePanelContent('network', `REDE & DNS // ${dns.provider.toUpperCase()} [REAL]`, [
        `Estado: OPERACIONAL | Clientes: ${dns.clients_active} IPs`,
        `Consultas Hoje: ${dns.queries_today.toLocaleString()}`,
        `Ameaças Bloqueadas: ${dns.blocked_today.toLocaleString()} (${dns.block_percentage}%)`,
        `Filtragem Ativa no Router/LAN`
      ]);
    } else {
      this.spatialPanels.updatePanelContent('network', 'REDE & DNS // SHIELD [DEMO]', [
        `Fornecedor: ${demo.dns.provider}`,
        `Consultas Hoje: ${demo.dns.queries_today.toLocaleString()}`,
        `Bloqueadas: ${demo.dns.blocked_today.toLocaleString()} (${demo.dns.block_percentage}%)`,
        `Clientes Ativos: ${demo.dns.clients_active} IPs`
      ]);
    }
  }

  private setupVoiceInteractions() {
    const btnVoice = document.getElementById('btn-voice-listen')!;

    // Configurar callbacks do serviço modular de voz
    speechService.onStateChange = (state, message) => {
      if (state === 'listening') {
        btnVoice.classList.add('listening');
        this.coreVisualizer.setStatus('listening');
        this.uiOverlay.setVoiceFeedback(message || 'A escutar...', true);
      } else if (state === 'idle') {
        btnVoice.classList.remove('listening');
        this.coreVisualizer.setStatus('normal');
      } else if (state === 'error') {
        btnVoice.classList.remove('listening');
        this.coreVisualizer.setStatus('warning');
        this.uiOverlay.setVoiceFeedback(message || 'Erro de voz.');
      }
    };

    speechService.onTranscript = async (transcript, isFinal) => {
      this.uiOverlay.setVoiceFeedback(`Reconhecido: "${transcript}"`);
      if (isFinal) {
        await this.triggerCommand({ raw_phrase: transcript });
      }
    };

    speechService.onError = (errorMsg) => {
      this.uiOverlay.setVoiceFeedback(errorMsg);
    };

    // Alternar escuta ao clicar no botão virtual (ou disparado via laser / hand pinch)
    btnVoice.addEventListener('click', () => {
      if (speechService.isCurrentlyListening()) {
        speechService.stopListening();
      } else {
        const caps = speechService.getCapabilities();
        if (!caps.recognition) {
          const phrase = prompt('Reconhecimento vocal não disponível neste browser. Digite o comando: (ex: "JARVIS mostra os servidores")');
          if (phrase) {
            this.triggerCommand({ raw_phrase: phrase });
          }
        } else {
          speechService.startListening();
        }
      }
    });
  }

  private async triggerCommand(params: { command_id?: string; raw_phrase?: string }) {
    try {
      const res = await api.executeCommand(params);
      this.speakFeedback(res.spoken_feedback);
      this.uiOverlay.setVoiceFeedback(res.spoken_feedback);

      // Processa ação na interface
      if (res.ui_action === 'open_panel_home') {
        this.uiOverlay.switchTab('home');
        this.spatialPanels.setVisible('home', true);
      }
      if (res.ui_action === 'open_panel_proxmox') {
        this.uiOverlay.switchTab('proxmox');
        this.spatialPanels.setVisible('proxmox', true);
      }
      if (res.ui_action === 'open_panel_network') {
        this.uiOverlay.switchTab('network');
        this.spatialPanels.setVisible('network', true);
      }
      if (res.ui_action === 'open_panel_services') {
        this.uiOverlay.switchTab('services');
      }
      if (res.ui_action === 'close_all_panels') {
        this.spatialPanels.setAllVisible(false);
      }
      if (res.ui_action === 'show_help') {
        this.uiOverlay.switchTab('commands');
      }
      if (res.ui_action === 'refresh_data') {
        await this.loadInitialData();
      }
      if (res.ui_action === 'stop_listening') {
        speechService.stopListening();
      }

      this.xrManager.setInteractiveObjects(this.spatialPanels.getInteractiveMeshes());
    } catch (err: any) {
      const errMsg = err.message || 'Erro ao processar comando';
      this.speakFeedback(errMsg);
      this.uiOverlay.setVoiceFeedback(errMsg);
    }
  }

  private speakFeedback(text: string) {
    speechService.speak(text);
  }

  private animate() {
    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.coreVisualizer.update(delta, elapsed);
    this.xrManager.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Inicialização da Aplicação
window.addEventListener('DOMContentLoaded', () => {
  new JarvisApp();
});
