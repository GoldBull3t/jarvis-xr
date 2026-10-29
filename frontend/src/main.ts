/**
 * Ponto de Entrada Principal da Aplicação JARVIS XR (WebXR + Hand Tracking + Desktop)
 * Integra os 4 Pilares: Voz Determinística, Interação Espacial 3D com Grabbing e Câmara, Telemetria SSE em Tempo Real e Diagnóstico Completo.
 */
import * as THREE from 'three';
import { JarvisCoreVisualizer } from './scene/core';
import { SceneBackgroundManager } from './scene/background';
import { SpatialPanelManager3D } from './panels/panel-manager';
import { UiOverlayManager } from './panels/ui-overlay';
import { XRManager } from './xr/xr-manager';
import { speechService } from './voice/speech-service';
import { soundFX } from './scene/audio-fx';
import { api } from './api/client';
import type {
  DemoStatusData,
  JarvisCommand,
  HomeSummaryData,
  ProxmoxSummaryData,
  DnsSummaryData,
  ServiceHealthItem,
  FullDiagnosticsData
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
  public diagnosticsData: FullDiagnosticsData | null = null;
  public commands: JarvisCommand[] = [];

  // Pilar 3: Canal SSE de tempo real
  private sseClient: EventSource | null = null;
  private activeCameraEntityId: string = '';

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

    // Pilar 2: Agarrar e mover painéis no espaço 3D (SelectStart e SqueezeStart)
    this.xrManager.onSelectStartCallback = (event) => {
      this.spatialPanels.startGrab(
        event.intersectedObject,
        event.controllerIndex,
        event.point,
        event.uv,
        false
      );
    };

    this.xrManager.onSelectEndCallback = (_controllerIndex) => {
      this.spatialPanels.releaseGrab();
    };

    this.xrManager.onSqueezeStartCallback = (event) => {
      // O botão de Grip (pegar) agarra imediatamente o painel apontado
      this.spatialPanels.startGrab(
        event.intersectedObject,
        event.controllerIndex,
        event.point,
        event.uv,
        true
      );
    };

    this.xrManager.onSqueezeEndCallback = (_controllerIndex) => {
      this.spatialPanels.releaseGrab();
    };

    // Responde a ações disparadas pelos botões dentro dos painéis 3D
    this.spatialPanels.onPanelAction = async (action, panelId, data) => {
      if (action === 'refresh_data') {
        this.speakFeedback('A atualizar métricas do homelab, senhor.');
        await this.loadInitialData();
      } else if (action === 'toggle_entity') {
        await this.toggleEntity(data?.entity_id || 'light.escritorio', data?.domain || 'light');
      } else if (action === 'temp_up' || action === 'temp_down') {
        const delta = action === 'temp_up' ? 0.5 : -0.5;
        this.speakFeedback(`A ajustar climatização em ${delta > 0 ? '+0.5' : '-0.5'} graus.`);
        soundFX.playSuccessTone();
      } else if (action === 'macro_lab') {
        this.speakFeedback('Modo Laboratório ativado, senhor.');
        soundFX.playSuccessTone();
        if (this.homeData?.authorized_entities) {
          const l = this.homeData.authorized_entities.find(e => e.domain === 'light');
          if (l) await this.handleEntityAction(l.entity_id, 'light', 'turn_on', { brightness: 255 });
        }
      } else if (action === 'macro_cinema') {
        this.speakFeedback('Modo Cinema ativado. A atenuar luzes.');
        soundFX.playSuccessTone();
        if (this.homeData?.authorized_entities) {
          const l = this.homeData.authorized_entities.find(e => e.domain === 'light');
          if (l) await this.handleEntityAction(l.entity_id, 'light', 'turn_on', { brightness: 40 });
        }
      } else if (action === 'macro_night' || action === 'macro_off') {
        this.speakFeedback('A desligar dispositivos não essenciais, senhor.');
        soundFX.playSuccessTone();
        if (this.homeData?.authorized_entities) {
          for (const l of this.homeData.authorized_entities.filter(e => e.domain === 'light' && e.state === 'on')) {
            await this.handleEntityAction(l.entity_id, 'light', 'turn_off');
          }
        }
      } else if (action === 'action_vm') {
        if (data?.vmid && data?.action) {
          await this.handleVmAction(data.vmid, data.action, data.vmName);
        }
      } else if (action === 'pause_dns_5m') {
        soundFX.playSuccessTone();
        this.speakFeedback('Escudo de proteção cibernética ativo na rede LAN, senhor.');
        await this.loadInitialData();
      } else if (action === 'refresh_dns') {
        soundFX.playSuccessTone();
        this.speakFeedback('A atualizar regras do escudo cibernético.');
        await this.loadInitialData();
      } else if (action === 'run_diagnostics') {
        await this.loadDiagnostics();
      } else if (action === 'push_to_talk') {
        if (speechService.isCurrentlyListening()) {
          speechService.stopListening();
        } else {
          speechService.startListening();
        }
      } else if (action === 'open_panel_camera') {
        this.speakFeedback('A carregar visão da câmara.');
        this.spatialPanels.setVisible('camera', true);
        this.loadCameraSnapshot();
      } else if (action === 'refresh_camera') {
        this.loadCameraSnapshot();
      } else if (action === 'prev_camera') {
        this.cycleCamera('prev');
      } else if (action === 'next_camera') {
        this.cycleCamera('next');
      } else if (action === 'open_camera_url') {
        const url = this.spatialPanels.getCameraSnapshotUrl();
        if (url) window.open(url, '_blank');
      } else if (action === 'close_panel') {
        this.speakFeedback(`Painel ${panelId} recolhido, senhor.`);
      }

      this.xrManager.setInteractiveObjects(this.spatialPanels.getInteractiveMeshes());
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

    // Escuta evento de alternância ou controlo detalhado de entidade (Home Assistant)
    window.addEventListener('jarvis-action-entity', (async (e: any) => {
      const { entityId, domain, action, payload } = e.detail || {};
      if (entityId) {
        await this.handleEntityAction(entityId, domain, action, payload);
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

    // Escuta evento de execução de diagnósticos (Pilar 4)
    window.addEventListener('jarvis-run-diagnostics', (async () => {
      await this.loadDiagnostics();
    }) as EventListener);

    // Escuta erro 401 de autenticação do backend
    window.addEventListener('jarvis-auth-error', (() => {
      this.uiOverlay.setConnectionState('error');
      this.uiOverlay.setVoiceFeedback('Autenticação necessária (HTTP 401). Abra a configuração de Chave no topo.');
      this.uiOverlay.openApiKeyModal();
      soundFX.playAlert();
    }) as EventListener);

    // Recuperação automática de suspensão do headset Meta Quest 3S
    document.addEventListener('visibilitychange', (async () => {
      if (document.visibilityState === 'visible') {
        console.log('Sessão reativada (Headset acordou). A sincronizar telemetria...');
        await this.loadInitialData();
        this.initSSE();
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

      const uiOverlayElem = document.getElementById('ui-overlay');
      if (uiOverlayElem) uiOverlayElem.style.display = 'none';

      session.addEventListener('end', async () => {
        this.xrSession = null;
        this.isArActive = false;
        this.backgroundManager.setArPassthrough(false);
        btnEnterXR.textContent = mode === 'immersive-ar' ? 'INICIAR SESSÃO AR (PASSTHROUGH)' : 'INICIAR SESSÃO VR';
        if (uiOverlayElem) uiOverlayElem.style.display = 'flex';
        await api.sendPresence(false);
      });

      soundFX.playHoloDeploy();
      this.speakFeedback('Protocolo JARVIS XR inicializado, senhor. Realidade mista e telemetria ativas.');
    } catch (err: any) {
      console.error('Falha ao iniciar WebXR:', err);
      soundFX.playAlert();
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

      // Auto-deteta câmara se disponível no Home Assistant
      if (homeRes && homeRes.authorized_entities) {
        const cam = homeRes.authorized_entities.find(e => e.domain === 'camera' || e.entity_id.startsWith('camera.'));
        if (cam) this.activeCameraEntityId = cam.entity_id;
      }

      this.uiOverlay.updateData(demo, cmds, homeRes, pveRes, dnsRes, servicesRes, this.diagnosticsData);
      this.updateSpatialPanelsData(demo, homeRes, pveRes, dnsRes);
      this.xrManager.setInteractiveObjects(this.spatialPanels.getInteractiveMeshes());

      // Inicia o canal SSE em tempo real (Pilar 3) e o diagnóstico em background (Pilar 4)
      this.initSSE();
      this.loadDiagnostics(true);
    } catch (err) {
      console.warn('Backend offline ou inacessível. A carregar dados de demonstração...', err);
      this.uiOverlay.setConnectionState('offline');
      this.coreVisualizer.setStatus('warning');
    }
  }

  /**
   * Canal SSE de telemetria contínua sem polling (Pilar 3)
   */
  private initSSE() {
    if (this.sseClient) {
      this.sseClient.close();
      this.sseClient = null;
    }

    try {
      this.sseClient = api.createEventSource();
      if (!this.sseClient) return;

      this.sseClient.addEventListener('telemetry', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          let hasUpdates = false;

          if (payload.home) {
            this.homeData = payload.home;
            hasUpdates = true;
            if (!this.activeCameraEntityId && payload.home.authorized_entities) {
              const cam = payload.home.authorized_entities.find((ent: any) => ent.domain === 'camera' || ent.entity_id?.startsWith('camera.'));
              if (cam) this.activeCameraEntityId = cam.entity_id;
            }
          }

          if (payload.proxmox) {
            this.pveData = payload.proxmox;
            hasUpdates = true;
          }

          if (hasUpdates && this.demoData) {
            this.uiOverlay.updateData(
              this.demoData,
              this.commands,
              this.homeData,
              this.pveData,
              this.dnsData,
              this.servicesData,
              this.diagnosticsData
            );
            this.updateSpatialPanelsData(this.demoData, this.homeData, this.pveData, this.dnsData);
          }
        } catch (err) {
          console.debug('Erro ao processar telemetria SSE:', err);
        }
      });

      this.sseClient.onerror = () => {
        // EventSource nativo reconecta automaticamente após 3 segundos
      };
    } catch (err) {
      console.warn('Falha ao inicializar EventSource SSE:', err);
    }
  }

  /**
   * Carrega e desenha o snapshot de câmara no painel 3D (Pilar 2)
   */
  private loadCameraSnapshot() {
    let camEntity = this.activeCameraEntityId;
    if (!camEntity && this.homeData?.authorized_entities) {
      const found = this.homeData.authorized_entities.find(e => e.domain === 'camera' || e.entity_id.startsWith('camera.'));
      if (found) {
        camEntity = found.entity_id;
        this.activeCameraEntityId = camEntity;
      }
    }

    if (camEntity) {
      let url = api.getCameraSnapshotUrl(camEntity);
      const key = api.getApiKey();
      if (key && key.trim()) {
        url += `?token=${encodeURIComponent(key.trim())}`;
      }
      this.spatialPanels.setCameraSnapshot(url, camEntity);
    } else {
      this.spatialPanels.setCameraSnapshot('', 'SEM CÂMARA REGISTADA');
    }
  }

  /**
   * Executa a bateria de diagnósticos de latência do homelab (Pilar 4)
   */
  private async loadDiagnostics(silent: boolean = false) {
    try {
      const diag = await api.getFullDiagnostics();
      this.diagnosticsData = diag;
      if (this.demoData) {
        this.uiOverlay.updateData(
          this.demoData,
          this.commands,
          this.homeData,
          this.pveData,
          this.dnsData,
          this.servicesData,
          this.diagnosticsData
        );
      }
      if (!silent) {
        soundFX.playSuccessTone();
        this.speakFeedback(diag.all_healthy ? 'Diagnóstico concluído. Todos os sistemas operacionais.' : 'Diagnóstico concluído com avisos.');
      }
    } catch (err) {
      if (!silent) {
        soundFX.playAlert();
        this.speakFeedback('Falha ao executar diagnóstico.');
      }
    }
  }

  private cycleCamera(direction: 'next' | 'prev') {
    if (!this.homeData?.authorized_entities) return;
    const cameras = this.homeData.authorized_entities.filter(e => e.domain === 'camera');
    if (cameras.length === 0) return;

    let currentIndex = cameras.findIndex(c => c.entity_id === this.activeCameraEntityId);
    if (currentIndex === -1) currentIndex = 0;

    if (direction === 'next') {
      currentIndex = (currentIndex + 1) % cameras.length;
    } else {
      currentIndex = (currentIndex - 1 + cameras.length) % cameras.length;
    }

    const nextCam = cameras[currentIndex];
    this.activeCameraEntityId = nextCam.entity_id;
    this.loadCameraSnapshot();
    soundFX.playClick();
    this.speakFeedback(`A comutar para ${nextCam.friendly_name}`);
  }

  private async handleEntityAction(entityId: string, domain?: string, action: string = 'toggle', payload?: any) {
    try {
      let res: any;
      const d = domain || entityId.split('.')[0];

      if (action === 'view_in_3d' || (d === 'camera' && action === 'toggle')) {
        this.activeCameraEntityId = entityId;
        this.spatialPanels.setVisible('camera', true);
        this.loadCameraSnapshot();
        soundFX.playSuccessTone();
        this.speakFeedback('A carregar imagem instantânea da câmara no painel 3D.');
        return;
      }

      if (d === 'light') {
        res = await api.actionLight({
          entity_id: entityId,
          action: action as any,
          brightness: payload?.brightness,
          color_temp: payload?.color_temp
        });
      } else if (d === 'switch' || d === 'input_boolean') {
        res = await api.actionSwitch(entityId, action);
      } else if (d === 'climate') {
        res = await api.actionClimate({
          entity_id: entityId,
          action: action as any,
          temperature: payload?.temperature,
          hvac_mode: payload?.hvac_mode,
          fan_mode: payload?.fan_mode
        });
      } else if (d === 'cover') {
        res = await api.actionCover({
          entity_id: entityId,
          action: action as any,
          position: payload?.position
        });
      } else if (d === 'media_player') {
        res = await api.actionMediaPlayer({
          entity_id: entityId,
          action: action as any,
          volume_level: payload?.volume_level
        });
      } else if (d === 'scene') {
        res = await api.activateScene(entityId);
      } else if (d === 'script') {
        res = await api.executeScript(entityId, payload?.variables);
      } else if (d === 'lock') {
        res = await api.actionLock({
          entity_id: entityId,
          action: action as any,
          code: payload?.code
        });
      } else if (d === 'fan') {
        res = await api.actionFan({
          entity_id: entityId,
          action: action as any,
          percentage: payload?.percentage
        });
      } else if (d === 'vacuum') {
        res = await api.actionVacuum({
          entity_id: entityId,
          action: action as any
        });
      } else if (d === 'automation') {
        res = await api.actionAutomation({
          entity_id: entityId,
          action: action as any
        });
      } else {
        res = await api.actionSwitch(entityId, action);
      }

      soundFX.playSuccessTone();
      if (res && res.message) {
        this.speakFeedback(res.message);
        this.uiOverlay.setVoiceFeedback(res.message);
      }
      await this.loadInitialData();
    } catch (err: any) {
      soundFX.playAlert();
      const msg = err.message || 'Falha ao executar ação na entidade';
      this.speakFeedback(msg);
      this.uiOverlay.setVoiceFeedback(msg);
    }
  }

  private async toggleEntity(entityId: string, domain?: string) {
    return this.handleEntityAction(entityId, domain, 'toggle');
  }

  private async handleVmAction(vmid: number, action: 'start' | 'shutdown' | 'reboot', vmName?: string) {
    const actionLabel = action === 'start' ? 'LIGAR' : (action === 'shutdown' ? 'DESLIGAR (ACPI)' : 'REINICIAR');
    const msg = `Confirma que pretende ${actionLabel} a máquina virtual [${vmid}] ${vmName || ''}?`;
    if (!confirm(msg)) return;

    try {
      const res = await api.actionProxmoxVm(vmid, action, true);
      soundFX.playSuccessTone();
      this.speakFeedback(res.message);
      this.uiOverlay.setVoiceFeedback(res.message);
      await this.loadInitialData();
    } catch (err: any) {
      soundFX.playAlert();
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
    this.spatialPanels.setTelemetryData({
      demo,
      home: home || null,
      pve: pve || null,
      dns: dns || null,
      diag: this.diagnosticsData,
      services: this.servicesData
    });

    // Se houver alertas críticos perimétricos ou falha em nós do cluster, pulsa o Arc Reactor (Question 15)
    const hasAlert = (home && home.binary_sensors_alert && home.binary_sensors_alert > 0) ||
                    (pve && pve.nodes_online < pve.total_nodes);
    if (hasAlert) {
      this.coreVisualizer.setStatus('error');
    } else if (!speechService.isCurrentlyListening()) {
      this.coreVisualizer.setStatus('normal');
    }

    this.xrManager.setInteractiveObjects(this.spatialPanels.getInteractiveMeshes());
  }

  private setupVoiceInteractions() {
    const btnVoice = document.getElementById('btn-voice-listen')!;

    // Configurar callbacks do serviço modular de voz
    speechService.onStateChange = (state, message) => {
      if (state === 'listening') {
        soundFX.playClick();
        btnVoice.classList.add('listening');
        this.coreVisualizer.setStatus('listening');
        this.uiOverlay.setVoiceFeedback(message || 'A escutar...', true);
      } else if (state === 'idle') {
        btnVoice.classList.remove('listening');
        this.coreVisualizer.setStatus('normal');
      } else if (state === 'error') {
        soundFX.playAlert();
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
      soundFX.playAlert();
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
      soundFX.playSuccessTone();
      this.speakFeedback(res.spoken_feedback);
      this.uiOverlay.setVoiceFeedback(res.spoken_feedback);

      // Processa ação na interface
      if (res.ui_action === 'open_panel_home') {
        this.uiOverlay.switchTab('home');
        this.spatialPanels.setVisible('home', true);
      } else if (res.ui_action === 'open_panel_proxmox') {
        this.uiOverlay.switchTab('proxmox');
        this.spatialPanels.setVisible('proxmox', true);
      } else if (res.ui_action === 'open_panel_network') {
        this.uiOverlay.switchTab('network');
        this.spatialPanels.setVisible('network', true);
      } else if (res.ui_action === 'open_panel_services') {
        this.uiOverlay.switchTab('services');
      } else if (res.ui_action === 'open_panel_camera') {
        this.spatialPanels.setVisible('camera', true);
        this.loadCameraSnapshot();
      } else if (res.ui_action === 'open_panel_diagnostics') {
        this.uiOverlay.switchTab('diagnostics');
        await this.loadDiagnostics();
      } else if (res.ui_action === 'close_all_panels') {
        this.spatialPanels.setAllVisible(false);
      } else if (res.ui_action === 'show_help') {
        this.uiOverlay.switchTab('commands');
      } else if (res.ui_action === 'refresh_data') {
        await this.loadInitialData();
      } else if (res.ui_action === 'stop_listening') {
        speechService.stopListening();
      }

      this.xrManager.setInteractiveObjects(this.spatialPanels.getInteractiveMeshes());
    } catch (err: any) {
      soundFX.playAlert();
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
    this.spatialPanels.update(delta, this.camera);

    // Pilar 2: Atualização do arrasto e rotação fluida dos painéis 3D no espaço
    if (this.spatialPanels.isGrabbing()) {
      this.spatialPanels.updateDragging(
        (idx) => this.xrManager.getControllerRay(idx),
        this.camera
      );
    }

    this.xrManager.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Inicialização da Aplicação
window.addEventListener('DOMContentLoaded', () => {
  new JarvisApp();
});
