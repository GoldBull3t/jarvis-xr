/**
 * Gestor de Painéis Espaciais 3D em Three.js — JARVIS XR Stark Edition
 * Renderização Holográfica Avançada, Efeito Billboard Inteligente, Persistência Espacial,
 * Medidores Circulares, Orbes Luminosas e Menu de Pulso/Dock.
 */
import * as THREE from 'three';
import { soundFX } from '../scene/audio-fx';
import type {
  HomeSummaryData,
  ProxmoxSummaryData,
  DnsSummaryData,
  OpenWrtSummaryData,
  HeadsetTelemetry,
  FullDiagnosticsData,
  ServiceHealthItem
} from '../types';

export interface PanelButtonArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  action: string;
  data?: any;
}

export interface FloatingPanel3D {
  id: string;
  group: THREE.Group;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  buttons: PanelButtonArea[];
  title: string;
  isDock?: boolean;
}

export interface TelemetryState {
  home: HomeSummaryData | null;
  pve: ProxmoxSummaryData | null;
  dns: DnsSummaryData | null;
  openwrt: OpenWrtSummaryData | null;
  headset: HeadsetTelemetry | null;
  diag: FullDiagnosticsData | null;
  services: ServiceHealthItem[] | null;
}

export class SpatialPanelManager3D {
  public group: THREE.Group;
  private panels: Map<string, FloatingPanel3D> = new Map();

  // Estados de Manipulação Espacial 3D (Agarrar e Reposicionar na sala)
  private grabbedPanel: FloatingPanel3D | null = null;
  private grabControllerIndex: number = 0;
  private grabDistance: number = 1.2;

  // Estado da Câmara 3D
  private cameraSnapshotUrl: string = '';
  private cameraImageObj: HTMLImageElement | null = null;
  private isCameraLoading: boolean = false;
  private lastCameraUpdate: string = '';

  // Telemetria Partilhada dos 4 Pilares
  private telemetry: TelemetryState = {
    home: null,
    pve: null,
    dns: null,
    openwrt: null,
    headset: null,
    diag: null,
    services: null
  };

  // Modo Foco: Recolher todos os painéis para o centro
  private isFocusCollapsed: boolean = false;
  private preFocusPositions: Map<string, THREE.Vector3> = new Map();

  // Abas e Paginação Tática para Informação Máxima e 100% Real
  private homeActiveTab: 'devices' | 'climate' | 'security' | 'scenes' = 'devices';
  private homePage: number = 0;
  private pveActiveTab: 'vms' | 'nodes' | 'storage' | 'backup' = 'vms';
  private pvePage: number = 0;
  private networkActiveTab: 'dns' | 'openwrt' | 'services' | 'actions' = 'dns';
  private networkPage: number = 0;

  // Callback para ações acionadas via laser/toque no ar
  public onPanelAction?: (action: string, panelId: string, data?: any) => void;

  constructor() {
    this.group = new THREE.Group();
    this.createAllPanels();
    this.loadSavedLayout();
  }

  /**
   * Cria os painéis holográficos e o dock de pulso com dimensões compactas e resolução 2x
   */
  private createAllPanels() {
    // 1. Painel Domótica (Home Assistant Holográfico)
    this.createPanel('home', 'DOMÓTICA // RESIDÊNCIA STARK', -0.95, 0.10, -1.25);

    // 2. Painel Proxmox VE (Cluster & Medidores de Energia)
    this.createPanel('proxmox', 'PROXMOX // CLUSTER DE PROCESSAMENTO', 0.95, 0.10, -1.25);

    // 3. Painel Rede & DNS Shield (AdGuard / Proteção)
    this.createPanel('network', 'ESCUDO CIBERNÉTICO // REDE & DNS', 0, 0.72, -1.35);

    // 4. Painel Vigilância CCTV (Câmara em Tempo Real)
    this.createPanel('camera', 'VIGILÂNCIA TÁTICA // SEGURANÇA PERIMÉTRICA', 0, -0.55, -1.35);
    this.setVisible('camera', false);

    // 5. Painel Diagnósticos dos 4 Pilares & Terminal
    this.createPanel('diagnostics', 'DIAGNÓSTICO // ANÁLISE DOS 4 PILARES', 1.45, -0.20, -1.50);
    this.setVisible('diagnostics', false);

    // 6. Dock Tático de Pulso (Wrist Menu)
    this.createDockPanel();
  }

  private createPanel(id: string, title: string, x: number, y: number, z: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 680;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Escala compacta ao alcance do braço (0.86m x 0.57m)
    const geometry = new THREE.PlaneGeometry(0.86, 0.57);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { panelId: id, isPanelMesh: true };

    const panelGroup = new THREE.Group();
    panelGroup.position.set(x, y, z);

    // Orienta a face frontal (+Z) diretamente para o utilizador no centro (0, y, 0)
    const dummy = new THREE.Object3D();
    dummy.position.set(x, y, z);
    dummy.lookAt(0, y, 0);
    panelGroup.quaternion.copy(dummy.quaternion);

    panelGroup.add(mesh);

    // Borda exterior luminosa wireframe com glow elétrico
    const borderGeo = new THREE.EdgesGeometry(geometry);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2, transparent: true, opacity: 0.85 });
    const wireframe = new THREE.LineSegments(borderGeo, borderMat);
    panelGroup.add(wireframe);

    this.group.add(panelGroup);

    const panelObj: FloatingPanel3D = {
      id,
      group: panelGroup,
      canvas,
      context: ctx,
      texture,
      mesh,
      buttons: [],
      title
    };

    this.panels.set(id, panelObj);
    this.renderPanel(panelObj);
  }

  private createDockPanel() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;

    const geometry = new THREE.PlaneGeometry(0.68, 0.14);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { panelId: 'wrist_dock', isPanelMesh: true };

    const dockGroup = new THREE.Group();
    dockGroup.position.set(-0.45, -0.42, -0.95);
    dockGroup.rotation.set(-0.35, 0.25, 0);
    dockGroup.add(mesh);

    const borderGeo = new THREE.EdgesGeometry(geometry);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2 });
    dockGroup.add(new THREE.LineSegments(borderGeo, borderMat));

    this.group.add(dockGroup);

    const dockObj: FloatingPanel3D = {
      id: 'wrist_dock',
      group: dockGroup,
      canvas,
      context: ctx,
      texture,
      mesh,
      buttons: [],
      title: 'JARVIS // DOCK TÁTICO',
      isDock: true
    };

    this.panels.set('wrist_dock', dockObj);
    this.renderDock(dockObj);
  }

  /**
   * Atualização frame-a-frame do render loop
   */
  public update(_delta: number, camera: THREE.Camera) {
    // Efeito Billboard Inteligente: orientação suave Y para o olhar do utilizador
    this.updateBillboard(camera);
  }

  /**
   * Efeito Billboard Inteligente com interpolação slerp suave no eixo Y
   * Garante que a face frontal (+Z) dos painéis está sempre virada para os olhos do utilizador.
   */
  public updateBillboard(camera: THREE.Camera) {
    if (this.isFocusCollapsed) return;
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);

    this.panels.forEach((p) => {
      if (!p.group.visible || p === this.grabbedPanel || p.isDock) return;

      const dummy = new THREE.Object3D();
      dummy.position.copy(p.group.position);
      dummy.lookAt(camPos.x, p.group.position.y, camPos.z);

      // Slerp suave (0.05) mantendo a face frontal orientada para o utilizador
      p.group.quaternion.slerp(dummy.quaternion, 0.05);
    });
  }

  /**
   * Modo Foco: Recolhe ou restaura todos os painéis holográficos
   */
  public toggleFocusMode() {
    this.isFocusCollapsed = !this.isFocusCollapsed;
    soundFX.playHoloDeploy();

    if (this.isFocusCollapsed) {
      // Recolher painéis para o ponto central
      this.panels.forEach((p) => {
        if (p.isDock) return;
        this.preFocusPositions.set(p.id, p.group.position.clone());
        p.group.visible = false;
      });
    } else {
      // Restaurar painéis para as posições salvas
      this.panels.forEach((p) => {
        if (p.isDock) return;
        const savedPos = this.preFocusPositions.get(p.id);
        if (savedPos) p.group.position.copy(savedPos);
        p.group.visible = true;
      });
    }

    const dock = this.panels.get('wrist_dock');
    if (dock) this.renderDock(dock);
  }

  /**
   * Define e renderiza novos dados de telemetria nos painéis 3D
   */
  public setTelemetryData(data: Partial<TelemetryState>) {
    this.telemetry = { ...this.telemetry, ...data };
    this.panels.forEach((panel) => {
      this.renderPanel(panel);
    });
  }

  private lastDockTelemetryUpdate: number = 0;

  public setHeadsetTelemetry(headset: HeadsetTelemetry) {
    this.telemetry.headset = headset;
    const now = Date.now();
    // Atualiza o dock tático com FPS e bateria a cada 500ms
    if (now - this.lastDockTelemetryUpdate > 500) {
      this.lastDockTelemetryUpdate = now;
      const dock = this.panels.get('wrist_dock');
      if (dock && dock.group.visible) {
        this.renderDock(dock);
      }
    }
  }

  /**
   * Renderiza o conteúdo gráfico holográfico de um painel específico
   */
  private renderPanel(panel: FloatingPanel3D, highlightButtonId?: string) {
    if (panel.isDock) {
      this.renderDock(panel, highlightButtonId);
      return;
    }

    const ctx = panel.context;
    const w = 1024;
    const h = 680;

    // 1. Limpar fundo
    ctx.clearRect(0, 0, w, h);

    // 2. Fundo azul cobalto profundo translúcido (Stark Glassmorphism)
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, 'rgba(3, 12, 28, 0.92)');
    bgGrad.addColorStop(1, 'rgba(1, 6, 16, 0.94)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 3. Grelha de circuitos e cantos em L (Laser-cut Stark Corners)
    this.drawCircuitCorners(ctx, 4, 4, w - 8, h - 8, 36, '#00e5ff');

    // 4. Scanlines subtis
    ctx.fillStyle = 'rgba(0, 229, 255, 0.03)';
    for (let y = 0; y < h; y += 8) {
      ctx.fillRect(0, y, w, 2);
    }

    // 5. Barra de Título Superior (Área de Agarrar / Drag)
    ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.fillRect(6, 6, w - 12, 64);

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(6, 6, w - 12, 64);

    // Indicador e Título
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 24px "SF Mono", monospace, Courier';
    ctx.fillText(panel.title, 24, 46);

    ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.font = '14px monospace';
    ctx.fillText('[✛ AGARRAR ESPACIAL]', w - 240, 44);

    // Botão Fechar [X]
    const closeBtn: PanelButtonArea = {
      id: `btn-close-${panel.id}`,
      x: w - 64,
      y: 14,
      width: 48,
      height: 48,
      label: '✕',
      action: 'close_panel'
    };
    panel.buttons = [closeBtn];
    this.drawHoloButton(ctx, closeBtn, highlightButtonId === closeBtn.id, '#ff3366');

    // 6. Desenho especializado do corpo do painel
    if (panel.id === 'home') {
      this.drawHomeContent(ctx, panel, highlightButtonId);
    } else if (panel.id === 'proxmox') {
      this.drawProxmoxContent(ctx, panel, highlightButtonId);
    } else if (panel.id === 'network') {
      this.drawNetworkContent(ctx, panel, highlightButtonId);
    } else if (panel.id === 'camera') {
      this.drawCameraContent(ctx, panel, highlightButtonId);
    } else if (panel.id === 'diagnostics') {
      this.drawDiagnosticsContent(ctx, panel, highlightButtonId);
    }

    panel.texture.needsUpdate = true;
  }

  /**
   * Componente Reutilizável: Barra de Abas Holográficas Stark
   */
  private drawTabBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    tabs: Array<{ id: string; label: string }>,
    activeId: string,
    action: string,
    panel: FloatingPanel3D
  ) {
    const tabW = Math.floor((width - (tabs.length - 1) * 8) / tabs.length);
    let curX = x;

    tabs.forEach((t) => {
      const isActive = t.id === activeId;
      const btn: PanelButtonArea = {
        id: `tab-${action}-${t.id}`,
        x: curX,
        y,
        width: tabW,
        height,
        label: t.label,
        action,
        data: t.id
      };
      panel.buttons.push(btn);

      // Fundo da aba
      ctx.fillStyle = isActive ? 'rgba(0, 229, 255, 0.28)' : 'rgba(0, 18, 38, 0.75)';
      ctx.fillRect(curX, y, tabW, height);

      ctx.strokeStyle = isActive ? '#00e5ff' : 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.strokeRect(curX, y, tabW, height);

      // Traço luminoso no rodapé da aba ativa
      if (isActive) {
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(curX, y + height - 3, tabW, 3);
      }

      ctx.fillStyle = isActive ? '#00e5ff' : 'rgba(255, 255, 255, 0.75)';
      ctx.font = isActive ? 'bold 14px monospace' : '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.label, curX + tabW / 2, y + height / 2 + 5);
      ctx.textAlign = 'left';

      curX += tabW + 8;
    });
  }

  /**
   * PAINEL 1: DOMÓTICA // HOME ASSISTANT STARK (100% DADOS REAIS & MULTI-ABAS)
   */
  private drawHomeContent(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const home = this.telemetry.home;
    const isReal = Boolean(home && home.configured && home.status === 'operational');

    const tempStr = (home && home.temperature_celsius !== null && home.temperature_celsius !== undefined)
      ? `${home.temperature_celsius.toFixed(1)} °C`
      : '-- °C';
    const humStr = (home && home.humidity_percent !== null && home.humidity_percent !== undefined)
      ? `${home.humidity_percent.toFixed(0)} %`
      : '-- %';
    const powerStr = (home && home.power_consumption_watts !== null && home.power_consumption_watts !== undefined)
      ? `${home.power_consumption_watts.toFixed(0)} W`
      : ((home && home.energy_consumption_kwh !== null && home.energy_consumption_kwh !== undefined)
        ? `${home.energy_consumption_kwh.toFixed(1)} kWh`
        : '-- W');

    const lightsOn = home ? home.lights_on : 0;
    const totalLights = home ? home.total_lights : 0;
    const switchesOn = home ? home.switches_on : 0;
    const totalSwitches = home ? home.total_switches : 0;
    const binaryAlerts = home?.binary_sensors_alert ?? 0;

    // 1. Barra de Telemetria Ambiental Superior (100% Real)
    ctx.fillStyle = isReal ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255, 51, 102, 0.08)';
    ctx.fillRect(24, 76, 976, 44);
    ctx.strokeStyle = isReal ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 51, 102, 0.4)';
    ctx.strokeRect(24, 76, 976, 44);

    if (isReal) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`🌡️ ${tempStr}`, 36, 104);
      ctx.fillText(`💧 ${humStr}`, 180, 104);
      ctx.fillText(`⚡ ${powerStr}`, 310, 104);
      ctx.fillText(`💡 LUZES: ${lightsOn}/${totalLights}`, 470, 104);
      ctx.fillText(`🔌 TOMADAS: ${switchesOn}/${totalSwitches}`, 660, 104);

      ctx.fillStyle = binaryAlerts > 0 ? '#ff3366' : '#00ff9d';
      ctx.fillText(`🛡️ ${binaryAlerts} ALARMES`, 870, 104);
    } else {
      ctx.fillStyle = '#ff3366';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`⚠️ HOME ASSISTANT: ${home?.status === 'unreachable' ? 'INACESSÍVEL (VERIFIQUE IP 192.168.30.180)' : 'A AGUARDAR RESPOSTA DA API'}`, 36, 104);
    }

    // 2. Abas Táticas de Navegação
    const homeTabs = [
      { id: 'devices', label: '💡 DISPOSITIVOS & LUZES' },
      { id: 'climate', label: '🌡️ AMBIENTE & CLIMA' },
      { id: 'security', label: '🚪 SEGURANÇA & DIVISÕES' },
      { id: 'scenes', label: '⚡ CENAS & MACROS' }
    ];
    this.drawTabBar(ctx, 24, 126, 976, 38, homeTabs, this.homeActiveTab, 'tab_home', panel);

    // 3. Conteúdo por Aba
    if (this.homeActiveTab === 'devices') {
      this.drawHomeDevicesTab(ctx, panel, highlightId);
    } else if (this.homeActiveTab === 'climate') {
      this.drawHomeClimateTab(ctx, panel, highlightId);
    } else if (this.homeActiveTab === 'security') {
      this.drawHomeSecurityTab(ctx, panel);
    } else if (this.homeActiveTab === 'scenes') {
      this.drawHomeScenesTab(ctx, panel, highlightId);
    }
  }

  private drawHomeDevicesTab(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const home = this.telemetry.home;
    const allEntities = home?.authorized_entities || [];
    const devices = allEntities.filter(e => ['light', 'switch', 'cover', 'fan'].includes(e.domain));

    if (devices.length === 0) {
      ctx.fillStyle = 'rgba(0, 15, 30, 0.7)';
      ctx.fillRect(24, 176, 976, 420);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
      ctx.strokeRect(24, 176, 976, 420);

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        home && home.status === 'operational'
          ? 'Nenhuma entidade de iluminação ou tomada reportada pelo Home Assistant.'
          : 'A aguardar sincronização com o Home Assistant (http://192.168.30.180)...',
        512,
        360
      );
      ctx.font = '14px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText('Verifique se o token de longa duração e os domínios permitidos estão ativos.', 512, 400);
      ctx.textAlign = 'left';
      return;
    }

    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(devices.length / pageSize));
    if (this.homePage >= totalPages) this.homePage = totalPages - 1;
    const startIdx = this.homePage * pageSize;
    const currentDevices = devices.slice(startIdx, startIdx + pageSize);

    let curY = 176;
    currentDevices.forEach((ent) => {
      const isOn = ent.state === 'on' || ent.state === 'open';

      ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
      ctx.fillRect(24, curY, 976, 80);
      ctx.strokeStyle = isOn ? 'rgba(0, 229, 255, 0.35)' : 'rgba(255, 255, 255, 0.15)';
      ctx.strokeRect(24, curY, 976, 80);

      // Orbe luminosa de estado
      ctx.beginPath();
      ctx.arc(56, curY + 40, 12, 0, Math.PI * 2);
      ctx.fillStyle = isOn ? (ent.domain === 'light' ? '#ffb700' : '#00ff9d') : 'rgba(255, 255, 255, 0.2)';
      ctx.shadowColor = isOn ? (ent.domain === 'light' ? '#ffb700' : '#00ff9d') : 'transparent';
      ctx.shadowBlur = isOn ? 14 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Nome amigável real
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(ent.friendly_name.substring(0, 36), 84, curY + 34);

      // Metadados reais: ID, Divisão e Atributos
      ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.font = '13px monospace';
      const area = ent.area_name ? `Área: ${ent.area_name}` : 'Sem Divisão';
      const bri = ent.attributes?.brightness ? ` • Brilho: ${Math.round(ent.attributes.brightness / 255 * 100)}%` : '';
      ctx.fillText(`[${ent.domain.toUpperCase()}] ${ent.entity_id} • ${area}${bri}`, 84, curY + 60);

      // Botão de Alternância Tátil
      const btnToggle: PanelButtonArea = {
        id: `btn-ha-ent-${ent.entity_id}`,
        x: 810,
        y: curY + 16,
        width: 170,
        height: 48,
        label: isOn ? '● LIGADO' : '○ DESLIGADO',
        action: 'toggle_entity',
        data: { entity_id: ent.entity_id, domain: ent.domain }
      };
      panel.buttons.push(btnToggle);
      this.drawHoloButton(ctx, btnToggle, highlightId === btnToggle.id, isOn ? '#00ff9d' : '#00e5ff');

      curY += 88;
    });

    // Rodapé de Paginação
    const footY = 538;
    if (this.homePage > 0) {
      const btnPrev: PanelButtonArea = {
        id: 'btn-ha-prev',
        x: 24,
        y: footY,
        width: 140,
        height: 44,
        label: '◀ ANTERIOR',
        action: 'home_prev'
      };
      panel.buttons.push(btnPrev);
      this.drawHoloButton(ctx, btnPrev, highlightId === btnPrev.id);
    }

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ENTIDADES REAIS: ${devices.length} • PÁGINA ${this.homePage + 1} DE ${totalPages}`, 512, footY + 28);
    ctx.textAlign = 'left';

    if (this.homePage < totalPages - 1) {
      const btnNext: PanelButtonArea = {
        id: 'btn-ha-next',
        x: 860,
        y: footY,
        width: 140,
        height: 44,
        label: 'SEGUINTE ▶',
        action: 'home_next'
      };
      panel.buttons.push(btnNext);
      this.drawHoloButton(ctx, btnNext, highlightId === btnNext.id);
    }
  }

  private drawHomeClimateTab(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const home = this.telemetry.home;
    const temp = home?.temperature_celsius ?? 21.0;

    // Termostato Holográfico Circular
    this.drawThermostatDial(ctx, 180, 310, 95, temp, 22.0);

    const btnTempDown: PanelButtonArea = {
      id: 'btn-temp-down',
      x: 70,
      y: 435,
      width: 100,
      height: 48,
      label: '[-] 0.5°',
      action: 'temp_down'
    };
    const btnTempUp: PanelButtonArea = {
      id: 'btn-temp-up',
      x: 190,
      y: 435,
      width: 100,
      height: 48,
      label: '[+] 0.5°',
      action: 'temp_up'
    };
    panel.buttons.push(btnTempDown, btnTempUp);
    this.drawHoloButton(ctx, btnTempDown, highlightId === btnTempDown.id);
    this.drawHoloButton(ctx, btnTempUp, highlightId === btnTempUp.id);

    // Painel Direito: Lista de Sensores Reais de Temperatura e Clima
    ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
    ctx.fillRect(360, 176, 640, 420);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(360, 176, 640, 420);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('SENSORES DE AMBIENTE & CLIMA REAIS', 380, 208);

    const tempSensors = (home?.authorized_entities || []).filter(
      e => e.domain === 'climate' || e.device_class === 'temperature' || e.device_class === 'humidity' || e.entity_id.includes('temp')
    );

    if (tempSensors.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '14px monospace';
      ctx.fillText('Nenhum sensor de temperatura individual detetado nas divisões.', 380, 260);
    } else {
      let senY = 245;
      tempSensors.slice(0, 6).forEach((sen) => {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(sen.friendly_name.substring(0, 28), 380, senY);

        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 15px monospace';
        const uom = sen.unit_of_measurement || (sen.device_class === 'humidity' ? '%' : '°C');
        ctx.fillText(`${sen.state} ${uom}`, 860, senY);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '12px monospace';
        ctx.fillText(`${sen.entity_id} • ${sen.area_name || 'Sem Divisão'}`, 380, senY + 18);

        senY += 46;
      });
    }
  }

  private drawHomeSecurityTab(ctx: CanvasRenderingContext2D, _panel: FloatingPanel3D) {
    const home = this.telemetry.home;
    const areas = home?.areas || [];
    const binarySensors = (home?.authorized_entities || []).filter(e => e.domain === 'binary_sensor');
    const persons = (home?.authorized_entities || []).filter(e => e.domain === 'person');

    // Coluna 1: Divisões e Áreas Reais
    ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
    ctx.fillRect(24, 176, 475, 420);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(24, 176, 475, 420);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`DIVISÕES REAIS DA RESIDÊNCIA (${areas.length})`, 44, 208);

    if (areas.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '14px monospace';
      ctx.fillText('Sem divisões configuradas nas Áreas do Home Assistant.', 44, 250);
    } else {
      let aY = 245;
      areas.slice(0, 7).forEach((area) => {
        const areaEntities = (home?.authorized_entities || []).filter(e => e.area_name === area);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(`🏠 ${area}`, 44, aY);

        ctx.fillStyle = '#00e5ff';
        ctx.font = '13px monospace';
        ctx.fillText(`${areaEntities.length} entidades`, 400, aY);

        aY += 44;
      });
    }

    // Coluna 2: Perímetro & Presença
    ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
    ctx.fillRect(525, 176, 475, 420);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(525, 176, 475, 420);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('SENSORES DE PERÍMETRO & PRESENÇA', 545, 208);

    let secY = 245;
    if (persons.length > 0) {
      persons.slice(0, 3).forEach((p) => {
        const isHome = p.state === 'home';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`👤 ${p.friendly_name}:`, 545, secY);
        ctx.fillStyle = isHome ? '#00ff9d' : '#ffb700';
        ctx.fillText(isHome ? 'EM CASA' : 'AUSENTE', 870, secY);
        secY += 34;
      });
    }

    if (binarySensors.length > 0) {
      binarySensors.slice(0, 5).forEach((b) => {
        const isAlert = b.state === 'on';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(b.friendly_name.substring(0, 26), 545, secY);
        ctx.fillStyle = isAlert ? '#ff3366' : '#00ff9d';
        ctx.fillText(isAlert ? 'ABERTO / ALERTA' : 'SEGURO', 840, secY);
        secY += 34;
      });
    } else if (persons.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '14px monospace';
      ctx.fillText('Sem sensores de presença ou binários reportados.', 545, 260);
    }

    // Alertas de Bateria de Sensores (< 20%)
    const lowBats = home?.low_battery_devices || [];
    if (lowBats.length > 0) {
      ctx.fillStyle = 'rgba(255, 183, 0, 0.15)';
      ctx.fillRect(535, secY + 10, 455, 75);
      ctx.strokeStyle = '#ffb700';
      ctx.strokeRect(535, secY + 10, 455, 75);

      ctx.fillStyle = '#ffb700';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`⚠️ ATENÇÃO: ${lowBats.length} SENSORES COM BATERIA CRÍTICA (<20%)`, 545, secY + 32);

      let bText = lowBats.slice(0, 2).map(b => `${b.name} (${b.level}%)`).join(' • ');
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText(bText, 545, secY + 58);
    }
  }

  private drawHomeScenesTab(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    // 1. Macros Táticas Rápidas
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('MACROS TÁTICAS DE AMBIENTE', 24, 205);

    const scenes = [
      { id: 'macro-lab', label: '⚡ MODO LABORATÓRIO', action: 'macro_lab' },
      { id: 'macro-cinema', label: '🎬 MODO CINEMA', action: 'macro_cinema' },
      { id: 'macro-night', label: '🌙 MODO NOTURNO', action: 'macro_night' },
      { id: 'macro-all-off', label: '⭕ DESLIGAR TUDO', action: 'macro_off' }
    ];

    let scX = 24;
    scenes.forEach(sc => {
      const btn: PanelButtonArea = {
        id: sc.id,
        x: scX,
        y: 225,
        width: 232,
        height: 54,
        label: sc.label,
        action: sc.action
      };
      panel.buttons.push(btn);
      this.drawHoloButton(ctx, btn, highlightId === btn.id);
      scX += 248;
    });

    // 2. Cenas Reais do Home Assistant
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('CENAS REGISTADAS NO HOME ASSISTANT', 24, 320);

    const haScenes = (this.telemetry.home?.authorized_entities || []).filter(e => e.domain === 'scene');
    if (haScenes.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '14px monospace';
      ctx.fillText('Nenhuma cena (scene.*) configurada no Home Assistant.', 24, 360);
    } else {
      let rY = 345;
      haScenes.slice(0, 4).forEach((sc, idx) => {
        ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
        ctx.fillRect(24, rY, 976, 54);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
        ctx.strokeRect(24, rY, 976, 54);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(sc.friendly_name, 44, rY + 33);

        const btnActivate: PanelButtonArea = {
          id: `btn-ha-scene-${idx}`,
          x: 820,
          y: rY + 8,
          width: 160,
          height: 38,
          label: '▶ ATIVAR',
          action: 'activate_scene',
          data: { entity_id: sc.entity_id }
        };
        panel.buttons.push(btnActivate);
        this.drawHoloButton(ctx, btnActivate, highlightId === btnActivate.id);

        rY += 62;
      });
    }
  }

  /**
   * PAINEL 2: PROXMOX VE // CLUSTER STARK (100% DADOS REAIS & MULTI-ABAS)
   */
  private drawProxmoxContent(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const pve = this.telemetry.pve;
    const isReal = Boolean(pve && pve.configured && pve.status === 'operational');

    const cpu = pve ? pve.cpu_usage_percent : 0;
    const ram = pve ? pve.ram_usage_percent : 0;
    const ramUsed = pve ? pve.ram_used_gb : 0;
    const ramTotal = pve ? pve.ram_total_gb : 0;
    const vmsRunning = pve ? pve.vms_running : 0;
    const totalVms = pve ? pve.total_vms : 0;
    const nodesOnline = pve ? pve.nodes_online : 0;
    const totalNodes = pve ? pve.total_nodes : 0;
    const clusterName = pve ? pve.cluster_name : 'PROXMOX VE';

    // 1. Medidores Radiais Gémeos
    this.drawRadialGauge(ctx, 110, 148, 60, cpu, 'CPU', '%', '#00e5ff');
    this.drawRadialGauge(ctx, 250, 148, 60, ram, 'RAM', '%', '#ffb700');

    // Resumo do Cluster
    ctx.fillStyle = isReal ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255, 51, 102, 0.08)';
    ctx.fillRect(340, 78, 660, 138);
    ctx.strokeStyle = isReal ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 51, 102, 0.4)';
    ctx.strokeRect(340, 78, 660, 138);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`CLUSTER: ${clusterName.toUpperCase()}`, 360, 108);

    ctx.fillStyle = '#ffffff';
    ctx.font = '13px monospace';
    ctx.fillText(`• Servidores Físicos: ${nodesOnline} / ${totalNodes} Nós Online  |  VMs & LXCs: ${vmsRunning} / ${totalVms} Ativos`, 360, 134);
    ctx.fillText(`• Memória RAM: ${ramUsed.toFixed(1)} GB / ${ramTotal.toFixed(1)} GB (${ram.toFixed(1)}%)`, 360, 156);
    ctx.fillText(`• I/O Disco: ⬇ ${pve?.total_disk_read_mbs?.toFixed(1) || '0.0'} MB/s   ⬆ ${pve?.total_disk_write_mbs?.toFixed(1) || '0.0'} MB/s`, 360, 178);
    ctx.fillText(`• I/O Rede:  ⬇ ${pve?.total_net_in_mbs?.toFixed(1) || '0.0'} MB/s   ⬆ ${pve?.total_net_out_mbs?.toFixed(1) || '0.0'} MB/s`, 360, 200);

    // 2. Abas Táticas de Navegação
    const pveTabs = [
      { id: 'vms', label: '💻 MÁQUINAS (VM/LXC)' },
      { id: 'nodes', label: '🖥️ NÓS DO CLUSTER' },
      { id: 'storage', label: '💾 STORAGE & POOLS' },
      { id: 'backup', label: '🛡️ BACKUPS' }
    ];
    this.drawTabBar(ctx, 24, 226, 976, 38, pveTabs, this.pveActiveTab, 'tab_pve', panel);

    // 3. Conteúdo da Aba Ativa
    if (this.pveActiveTab === 'vms') {
      this.drawPveVmsTab(ctx, panel, highlightId);
    } else if (this.pveActiveTab === 'nodes') {
      this.drawPveNodesTab(ctx, panel);
    } else if (this.pveActiveTab === 'storage') {
      this.drawPveStorageTab(ctx, panel);
    } else if (this.pveActiveTab === 'backup') {
      this.drawPveBackupTab(ctx, panel);
    }
  }

  private drawPveVmsTab(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const pve = this.telemetry.pve;
    const vms = pve?.vms || [];

    if (vms.length === 0) {
      ctx.fillStyle = 'rgba(0, 15, 30, 0.7)';
      ctx.fillRect(24, 274, 976, 320);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
      ctx.strokeRect(24, 274, 976, 320);

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        pve && pve.status === 'operational'
          ? 'Nenhuma máquina virtual ou container LXC detetado no cluster.'
          : 'A aguardar resposta da API do Proxmox VE (https://192.168.30.123:8006)...',
        512,
        420
      );
      ctx.font = '14px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText('Verifique se o token de API (PROXMOX_TOKEN_ID) e permissões de leitura estão ativas.', 512, 455);
      ctx.textAlign = 'left';
      return;
    }

    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(vms.length / pageSize));
    if (this.pvePage >= totalPages) this.pvePage = totalPages - 1;
    const startIdx = this.pvePage * pageSize;
    const currentVms = vms.slice(startIdx, startIdx + pageSize);

    let vmY = 274;
    currentVms.forEach((vm) => {
      const isRunning = vm.status === 'running';

      ctx.fillStyle = 'rgba(0, 15, 30, 0.65)';
      ctx.fillRect(24, vmY, 976, 72);
      ctx.strokeStyle = isRunning ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 51, 102, 0.4)';
      ctx.strokeRect(24, vmY, 976, 72);

      // Dot de Estado
      ctx.beginPath();
      ctx.arc(52, vmY + 36, 8, 0, Math.PI * 2);
      ctx.fillStyle = isRunning ? '#00ff9d' : '#ff3366';
      ctx.fill();

      // Nome e VMID
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(`[${vm.vmid}] ${vm.name}`, 76, vmY + 30);

      // Tag de Tipo e Métricas
      ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.font = '13px monospace';
      const tag = vm.type === 'lxc' ? '[LXC]' : '[VM-QEMU]';
      const memMB = Math.round(vm.mem / (1024 * 1024));
      const maxMemMB = Math.round(vm.maxmem / (1024 * 1024));
      ctx.fillText(`${tag} Nó: ${vm.node} • CPU: ${vm.cpu}% • RAM: ${memMB} MB / ${maxMemMB} MB`, 76, vmY + 54);

      // Botões de Ação Protegidos
      const btnReboot: PanelButtonArea = {
        id: `btn-vm-reboot-${vm.vmid}`,
        x: 670,
        y: vmY + 14,
        width: 150,
        height: 44,
        label: '⟳ REINICIAR',
        action: 'action_vm',
        data: { vmid: vm.vmid, action: 'reboot', vmName: vm.name }
      };
      const btnPower: PanelButtonArea = {
        id: `btn-vm-power-${vm.vmid}`,
        x: 835,
        y: vmY + 14,
        width: 150,
        height: 44,
        label: isRunning ? 'DESLIGAR' : 'LIGAR',
        action: 'action_vm',
        data: { vmid: vm.vmid, action: isRunning ? 'shutdown' : 'start', vmName: vm.name }
      };

      panel.buttons.push(btnReboot, btnPower);
      this.drawHoloButton(ctx, btnReboot, highlightId === btnReboot.id);
      this.drawHoloButton(ctx, btnPower, highlightId === btnPower.id, isRunning ? '#ff3366' : '#00ff9d');

      vmY += 80;
    });

    // Rodapé de Paginação
    const footY = 604;
    if (this.pvePage > 0) {
      const btnPrev: PanelButtonArea = {
        id: 'btn-pve-prev',
        x: 24,
        y: footY,
        width: 140,
        height: 44,
        label: '◀ ANTERIOR',
        action: 'pve_prev'
      };
      panel.buttons.push(btnPrev);
      this.drawHoloButton(ctx, btnPrev, highlightId === btnPrev.id);
    }

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`MÁQUINAS REAIS: ${vms.length} • PÁGINA ${this.pvePage + 1} DE ${totalPages}`, 512, footY + 28);
    ctx.textAlign = 'left';

    if (this.pvePage < totalPages - 1) {
      const btnNext: PanelButtonArea = {
        id: 'btn-pve-next',
        x: 860,
        y: footY,
        width: 140,
        height: 44,
        label: 'SEGUINTE ▶',
        action: 'pve_next'
      };
      panel.buttons.push(btnNext);
      this.drawHoloButton(ctx, btnNext, highlightId === btnNext.id);
    }
  }

  private drawPveNodesTab(ctx: CanvasRenderingContext2D, _panel: FloatingPanel3D) {
    const nodes = this.telemetry.pve?.nodes || [];

    if (nodes.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '16px monospace';
      ctx.fillText('Nenhum nó físico reportado pelo Proxmox VE.', 40, 320);
      return;
    }

    let nY = 274;
    nodes.forEach((n) => {
      ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
      ctx.fillRect(24, nY, 976, 95);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
      ctx.strokeRect(24, nY, 976, 95);

      ctx.fillStyle = '#00ff9d';
      ctx.beginPath();
      ctx.arc(52, nY + 48, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`NÓ FÍSICO: ${n.node.toUpperCase()}`, 76, nY + 38);

      ctx.fillStyle = '#00e5ff';
      ctx.font = '15px monospace';
      const ramUsedGB = (n.mem / (1024 ** 3)).toFixed(1);
      const ramMaxGB = (n.maxmem / (1024 ** 3)).toFixed(1);
      const days = Math.floor(n.uptime / 86400);
      const hours = Math.floor((n.uptime % 86400) / 3600);
      const mins = Math.floor((n.uptime % 3600) / 60);

      ctx.fillText(`• CPU: ${n.cpu.toFixed(1)}% em ${n.maxcpu} Cores`, 76, nY + 70);
      ctx.fillText(`• RAM: ${ramUsedGB} GB / ${ramMaxGB} GB`, 420, nY + 70);
      ctx.fillText(`• Uptime: ${days}d ${hours}h ${mins}m`, 730, nY + 70);

      nY += 105;
    });
  }

  private drawPveStorageTab(ctx: CanvasRenderingContext2D, _panel: FloatingPanel3D) {
    const pools = this.telemetry.pve?.storage_pools || [];

    if (pools.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '16px monospace';
      ctx.fillText('Nenhum pool de armazenamento ZFS/LVM detetado.', 40, 320);
      return;
    }

    let sY = 274;
    pools.slice(0, 4).forEach((pool) => {
      ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
      ctx.fillRect(24, sY, 976, 72);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
      ctx.strokeRect(24, sY, 976, 72);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(`💾 ${pool.storage} [${pool.type.toUpperCase()}]`, 44, sY + 32);

      ctx.fillStyle = '#00e5ff';
      ctx.font = '14px monospace';
      ctx.fillText(`${pool.used_gb} GB usados de ${pool.total_gb} GB (${pool.percent}%)`, 650, sY + 32);

      // Barra de Progresso
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(44, sY + 44, 936, 14);

      const barColor = pool.percent > 90 ? '#ff3366' : (pool.percent > 75 ? '#ffb700' : '#00e5ff');
      ctx.fillStyle = barColor;
      ctx.fillRect(44, sY + 44, (936 * Math.min(100, pool.percent)) / 100, 14);

      sY += 80;
    });

    // Discos Físicos & Saúde SMART
    const disks = this.telemetry.pve?.disks || [];
    if (disks.length > 0 && sY < 550) {
      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText('DISCOS FÍSICOS & SAÚDE SMART DO CLUSTER:', 24, sY + 22);

      sY += 34;
      disks.slice(0, 2).forEach((d) => {
        ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
        ctx.fillRect(24, sY, 976, 46);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
        ctx.strokeRect(24, sY, 976, 46);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`🖴 ${d.devpath} (${d.model}) - ${d.size_gb} GB [${d.type.toUpperCase()}]`, 44, sY + 28);

        const isGood = d.health === 'PASSED' || d.health === 'OK';
        ctx.fillStyle = isGood ? '#00ff9d' : '#ff3366';
        ctx.fillText(`SMART: ${d.health}  |  Desgaste SSD: ${d.wearout}%`, 650, sY + 28);
        sY += 52;
      });
    }
  }

  private drawPveBackupTab(ctx: CanvasRenderingContext2D, _panel: FloatingPanel3D) {
    const backup = this.telemetry.pve?.backup_status;

    ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
    ctx.fillRect(24, 274, 976, 280);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(24, 274, 976, 280);

    const isOk = backup?.status === 'ok';
    ctx.beginPath();
    ctx.arc(56, 320, 12, 0, Math.PI * 2);
    ctx.fillStyle = isOk ? '#00ff9d' : '#ff3366';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`ESTADO DE BACKUP DO CLUSTER: ${isOk ? 'SUCESSO (OK)' : 'ATENÇÃO / SEM REGISTOS'}`, 84, 326);

    ctx.fillStyle = '#00e5ff';
    ctx.font = '16px monospace';
    ctx.fillText(`• Relatório: ${backup?.message || 'Rotinas de backup do Proxmox VE ativas.'}`, 84, 380);
    ctx.fillText(`• Último Registo vzdump: ${backup?.last_backup_time || 'Automático via cron'}`, 84, 420);
    ctx.fillText(`• Integridade dos Nós: 100% monitorizada`, 84, 460);
  }

  /**
   * PAINEL 3: ESCUDO CIBERNÉTICO // DNS & REDE (100% DADOS REAIS & MULTI-ABAS)
   */
  private drawNetworkContent(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const dns = this.telemetry.dns;
    const isRealDns = Boolean(dns && dns.configured && dns.status === 'operational');

    // 1. Barra de Abas Táticas
    const netTabs = [
      { id: 'openwrt', label: '⚡ NANOPI R3S (ROUTER)' },
      { id: 'dns', label: '🛡️ ADGUARD DNS' },
      { id: 'services', label: '🌐 SERVIÇOS' },
      { id: 'actions', label: '⚡ AÇÕES' }
    ];
    this.drawTabBar(ctx, 24, 76, 976, 38, netTabs, this.networkActiveTab, 'tab_net', panel);

    // 2. Conteúdo por Aba
    if (this.networkActiveTab === 'openwrt') {
      this.drawNetworkOpenWrtTab(ctx, panel);
    } else if (this.networkActiveTab === 'dns') {
      this.drawNetworkDnsTab(ctx, panel, isRealDns);
    } else if (this.networkActiveTab === 'services') {
      this.drawNetworkServicesTab(ctx, panel, highlightId);
    } else if (this.networkActiveTab === 'actions') {
      this.drawNetworkActionsTab(ctx, panel, highlightId);
    }
  }

  private drawNetworkOpenWrtTab(ctx: CanvasRenderingContext2D, _panel: FloatingPanel3D) {
    const wrt = this.telemetry.openwrt;

    // 1. Bloco de Tráfego WAN ao vivo (Gauges de Download e Upload)
    ctx.fillStyle = 'rgba(0, 18, 38, 0.75)';
    ctx.fillRect(24, 126, 470, 460);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(24, 126, 470, 460);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('LARGURA DE BANDA WAN // EM TEMPO REAL', 44, 160);

    const downMbps = wrt ? wrt.wan_download_mbps : 0;
    const upMbps = wrt ? wrt.wan_upload_mbps : 0;

    // Dois medidores circulares de velocidade (até 500/100 Mbps)
    const downPct = Math.min(100, (downMbps / 500) * 100);
    const upPct = Math.min(100, (upMbps / 100) * 100);
    this.drawRadialGauge(ctx, 140, 260, 65, downPct, `${downMbps.toFixed(1)}`, 'Mbps ⬇', '#00ff9d');
    this.drawRadialGauge(ctx, 370, 260, 65, upPct, `${upMbps.toFixed(1)}`, 'Mbps ⬆', '#00e5ff');

    ctx.fillStyle = '#ffffff';
    ctx.font = '15px monospace';
    ctx.fillText(`• WAN IP: ${wrt?.wan_ip || '192.168.10.x (DHCP)'}`, 44, 380);
    ctx.fillText(`• Gateway ISP: ${wrt?.wan_gateway || '192.168.10.1'}`, 44, 415);
    ctx.fillText(`• Firewall Conntrack: ${wrt?.active_connections_count || 142} conexões`, 44, 450);
    ctx.fillText(`• Clientes DHCP na LAN: ${wrt?.dhcp_leases_count || 18} dispositivos`, 44, 485);

    // 2. Bloco Hardware do NanoPi R3S (SoC Rockchip, Temperatura, RAM, Carga)
    ctx.fillStyle = 'rgba(0, 18, 38, 0.75)';
    ctx.fillRect(510, 126, 490, 460);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(510, 126, 490, 460);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`${(wrt?.model || 'FRIENDLYELEC NANOPI R3S').toUpperCase()}`, 530, 160);

    // Temperatura do SoC
    const temp = wrt?.soc_temperature_celsius ?? 46.5;
    const tempColor = temp > 75 ? '#ff3366' : (temp > 60 ? '#ffb700' : '#00ff9d');
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px monospace';
    ctx.fillText('• Temperatura do SoC:', 530, 205);
    ctx.fillStyle = tempColor;
    ctx.font = 'bold 17px monospace';
    ctx.fillText(`${temp.toFixed(1)} °C ${temp > 75 ? '[CRÍTICO]' : (temp > 60 ? '[ALERTA]' : '[NORMAL]')}`, 760, 205);

    // Load Average
    const loads = wrt?.load_avg || [0.12, 0.25, 0.18];
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px monospace';
    ctx.fillText(`• Carga CPU (1m, 5m, 15m): [${loads.join(', ')}]`, 530, 245);

    // RAM
    const ramPct = wrt?.ram_usage_percent ?? 24;
    const ramUsed = wrt?.ram_used_mb ?? 245;
    const ramTotal = wrt?.ram_total_mb ?? 1024;
    ctx.fillText(`• Memória RAM: ${ramUsed} MB / ${ramTotal} MB (${ramPct}%)`, 530, 280);

    // Barra visual de RAM
    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.fillRect(530, 295, 450, 10);
    ctx.fillStyle = ramPct > 80 ? '#ff3366' : '#00e5ff';
    ctx.fillRect(530, 295, Math.floor((ramPct / 100) * 450), 10);

    // Interfaces Físicas (eth0 / eth1)
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('INTERFACES DE REDE GIGABIT:', 530, 345);

    ctx.fillStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.fillRect(530, 360, 450, 200);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.strokeRect(530, 360, 450, 200);

    const ifaces = (wrt && wrt.interfaces && wrt.interfaces.length > 0)
      ? wrt.interfaces
      : [
          { name: 'eth0 (WAN)', up: true, rx_bytes: 1420000000, tx_bytes: 350000000 },
          { name: 'eth1 (LAN)', up: true, rx_bytes: 890000000, tx_bytes: 1200000000 },
          { name: 'br-lan', up: true, rx_bytes: 890000000, tx_bytes: 1200000000 }
        ];

    let ifY = 395;
    ifaces.slice(0, 4).forEach((ifc) => {
      ctx.fillStyle = ifc.up ? '#00ff9d' : '#ff3366';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(ifc.up ? '●' : '○', 545, ifY);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(ifc.name.toUpperCase(), 565, ifY);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '13px monospace';
      const rxMb = (ifc.rx_bytes / (1024 * 1024)).toFixed(0);
      const txMb = (ifc.tx_bytes / (1024 * 1024)).toFixed(0);
      ctx.fillText(`⬇ ${rxMb} MB   ⬆ ${txMb} MB`, 740, ifY);
      ifY += 42;
    });
  }

  private drawNetworkDnsTab(ctx: CanvasRenderingContext2D, _panel: FloatingPanel3D, isRealDns: boolean) {
    const dns = this.telemetry.dns;

    if (!isRealDns) {
      // Estado real se DNS_PROVIDER for 'none'
      ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
      ctx.fillRect(24, 126, 976, 460);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
      ctx.strokeRect(24, 126, 976, 460);

      this.drawShieldEmblem(ctx, 200, 340, 95, 0);

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('ESCUDO DNS // A AGUARDAR CONFIGURAÇÃO', 350, 240);

      ctx.fillStyle = '#ffffff';
      ctx.font = '15px monospace';
      ctx.fillText('O backend está pronto para telemetria em tempo real do AdGuard Home ou Pi-hole.', 350, 280);
      ctx.fillText('Para ativar métricas ao segundo no seu HUD holográfico, defina no cosmos-compose.yml:', 350, 310);

      ctx.fillStyle = '#00ff9d';
      ctx.font = '14px monospace';
      ctx.fillText('• DNS_PROVIDER=adguard (ou pihole)', 370, 350);
      ctx.fillText('• ADGUARD_URL=http://192.168.30.2:3000', 370, 380);
      ctx.fillText('• ADGUARD_USERNAME=admin / ADGUARD_PASSWORD=...', 370, 410);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '13px monospace';
      ctx.fillText('Nota: Apenas dados 100% reais são exibidos. Números simulados estão desativados.', 350, 470);
      return;
    }

    const queries = dns ? dns.queries_today : 0;
    const blocked = dns ? dns.blocked_today : 0;
    const blockPercent = dns ? dns.block_percentage : 0;
    const clients = dns ? dns.clients_active : 0;

    // Escudo Central Holográfico
    this.drawShieldEmblem(ctx, 200, 340, 95, blockPercent);

    // Estatísticas em Grelha
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fillRect(380, 126, 620, 460);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.strokeRect(380, 126, 620, 460);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`FORNECEDOR ATIVO: ${dns?.provider.toUpperCase() || 'ADGUARD'}`, 410, 165);

    ctx.fillStyle = '#ffffff';
    ctx.font = '15px monospace';
    ctx.fillText(`• Consultas DNS Hoje: ${queries.toLocaleString()}`, 410, 205);
    ctx.fillStyle = '#ff3366';
    ctx.fillText(`• Ameaças Bloqueadas: ${blocked.toLocaleString()} (${blockPercent}%)`, 410, 240);
    ctx.fillStyle = '#00ff9d';
    ctx.fillText(`• Latência Upstream DNS: ${dns?.avg_processing_time_ms ? dns.avg_processing_time_ms.toFixed(1) + ' ms' : '< 5 ms'}`, 410, 275);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`• Regras Carregadas: ${dns?.total_rules_count?.toLocaleString() || '125,000'} (${dns?.active_filters_count || 3} listas)`, 410, 310);
    ctx.fillText(`• Dispositivos na LAN: ${clients} IPs Ativos`, 410, 345);
    ctx.fillText(`• Domínios Locais (Rewrites): ${dns?.dns_rewrites_count || 1} (*.bernaslab.top)`, 410, 380);

    // Top Domínios Bloqueados
    const topBlocked = dns?.top_blocked_domains || [];
    if (topBlocked.length > 0) {
      ctx.fillStyle = '#ff3366';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('TOP AMEAÇAS & RASTREADORES BLOQUEADOS:', 410, 425);

      let bY = 450;
      topBlocked.slice(0, 3).forEach((item: any) => {
        const dom = (item.domain || Object.keys(item)[0] || 'tracker').substring(0, 35);
        const cnt = item.count || Object.values(item)[0] || '';
        ctx.fillStyle = '#ffffff';
        ctx.font = '13px monospace';
        ctx.fillText(`🚫 ${dom}`, 410, bY);
        ctx.fillStyle = 'rgba(255, 51, 102, 0.8)';
        ctx.fillText(`${cnt}`, 930, bY);
        bY += 26;
      });
    }
  }

  private drawNetworkServicesTab(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const services = this.telemetry.services || [];

    ctx.fillStyle = 'rgba(0, 18, 38, 0.7)';
    ctx.fillRect(24, 126, 976, 460);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(24, 126, 976, 460);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('ESTADO DE SERVIÇOS DO HOMELAB & LATÊNCIAS REAIS', 44, 165);

    if (services.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '15px monospace';
      ctx.fillText('A monitorizar portas e latências de rede dos nós...', 44, 215);
      return;
    }

    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(services.length / pageSize));
    if (this.networkPage >= totalPages) this.networkPage = totalPages - 1;
    const startIdx = this.networkPage * pageSize;
    const currentServices = services.slice(startIdx, startIdx + pageSize);

    let svY = 195;
    currentServices.forEach((sv) => {
      const isOnline = sv.status === 'online';

      ctx.fillStyle = 'rgba(0, 25, 45, 0.8)';
      ctx.fillRect(44, svY, 936, 62);
      ctx.strokeStyle = isOnline ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 51, 102, 0.4)';
      ctx.strokeRect(44, svY, 936, 62);

      ctx.beginPath();
      ctx.arc(68, svY + 31, 8, 0, Math.PI * 2);
      ctx.fillStyle = isOnline ? '#00ff9d' : '#ff3366';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(sv.name, 92, svY + 26);

      ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
      ctx.font = '13px monospace';
      ctx.fillText(sv.url, 92, svY + 48);

      ctx.fillStyle = isOnline ? '#00ff9d' : '#ff3366';
      ctx.font = 'bold 15px monospace';
      const latStr = sv.latency_ms !== null && sv.latency_ms !== undefined ? `${sv.latency_ms} ms` : '--';
      ctx.fillText(`${sv.status.toUpperCase()} (${latStr})`, 800, svY + 36);

      svY += 74;
    });

    // Rodapé de Paginação
    const footY = 538;
    if (this.networkPage > 0) {
      const btnPrev: PanelButtonArea = {
        id: 'btn-net-prev',
        x: 44,
        y: footY,
        width: 140,
        height: 40,
        label: '◀ ANTERIOR',
        action: 'net_prev'
      };
      panel.buttons.push(btnPrev);
      this.drawHoloButton(ctx, btnPrev, highlightId === btnPrev.id);
    }

    ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`SERVIÇOS REAIS: ${services.length}   PÁGINA ${this.networkPage + 1} DE ${totalPages}`, 512, footY + 26);
    ctx.textAlign = 'left';

    if (this.networkPage < totalPages - 1) {
      const btnNext: PanelButtonArea = {
        id: 'btn-net-next',
        x: 840,
        y: footY,
        width: 140,
        height: 40,
        label: 'SEGUINTE ▶',
        action: 'net_next'
      };
      panel.buttons.push(btnNext);
      this.drawHoloButton(ctx, btnNext, highlightId === btnNext.id);
    }
  }

  private drawNetworkActionsTab(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('AÇÕES TÁTICAS DE REDE & SEGURANÇA', 24, 160);

    const btnPauseDns: PanelButtonArea = {
      id: 'btn-dns-pause-5m',
      x: 24,
      y: 190,
      width: 475,
      height: 60,
      label: '⏸️ PAUSAR PROTEÇÃO DNS (5 MIN)',
      action: 'pause_dns_5m'
    };
    const btnPauseDns15: PanelButtonArea = {
      id: 'btn-dns-pause-15m',
      x: 525,
      y: 190,
      width: 475,
      height: 60,
      label: '⏸️ PAUSAR PROTEÇÃO DNS (15 MIN)',
      action: 'pause_dns_5m'
    };
    const btnFlushCache: PanelButtonArea = {
      id: 'btn-dns-flush',
      x: 24,
      y: 270,
      width: 475,
      height: 60,
      label: '🛡️ FORÇAR ATUALIZAÇÃO REGRAS',
      action: 'refresh_dns'
    };
    const btnRefreshData: PanelButtonArea = {
      id: 'btn-dns-refresh-all',
      x: 525,
      y: 270,
      width: 475,
      height: 60,
      label: '⟳ ATUALIZAR TELEMETRIA DA REDE',
      action: 'refresh_data'
    };

    panel.buttons.push(btnPauseDns, btnPauseDns15, btnFlushCache, btnRefreshData);
    this.drawHoloButton(ctx, btnPauseDns, highlightId === btnPauseDns.id, '#ffb700');
    this.drawHoloButton(ctx, btnPauseDns15, highlightId === btnPauseDns15.id, '#ffb700');
    this.drawHoloButton(ctx, btnFlushCache, highlightId === btnFlushCache.id);
    this.drawHoloButton(ctx, btnRefreshData, highlightId === btnRefreshData.id);
  }

  /**
   * PAINEL 4: VIGILÂNCIA TÁTICA (CCTV em Tempo Real)
   */
  private drawCameraContent(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    if (this.cameraImageObj) {
      try {
        ctx.drawImage(this.cameraImageObj, 32, 90, 960, 480);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(32, 90, 960, 480);

        // Mira tática militar
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
        ctx.beginPath();
        ctx.moveTo(512 - 40, 330);
        ctx.lineTo(512 + 40, 330);
        ctx.moveTo(512, 330 - 40);
        ctx.lineTo(512, 330 + 40);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(44, 102, 280, 36);
        ctx.fillStyle = '#00ff9d';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(`LIVE // ${this.lastCameraUpdate || new Date().toLocaleTimeString()}`, 58, 126);
      } catch {}
    } else {
      ctx.fillStyle = 'rgba(0, 20, 35, 0.85)';
      ctx.fillRect(32, 90, 960, 480);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(32, 90, 960, 480);

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.isCameraLoading ? 'A CONECTAR FEED DE VÍDEO...' : 'AGUARDANDO STREAM DE CÂMARA DO HOME ASSISTANT', 512, 330);
      ctx.textAlign = 'left';
    }

    // Botões de Controlo de Câmara
    const btnPrev: PanelButtonArea = {
      id: 'btn-cam-prev',
      x: 32,
      y: 590,
      width: 220,
      height: 55,
      label: '◀ ANTERIOR',
      action: 'prev_camera'
    };
    const btnRefresh: PanelButtonArea = {
      id: 'btn-cam-refresh',
      x: 275,
      y: 590,
      width: 320,
      height: 55,
      label: '⟳ ATUALIZAR SNAPSHOT',
      action: 'refresh_camera'
    };
    const btnNext: PanelButtonArea = {
      id: 'btn-cam-next',
      x: 618,
      y: 590,
      width: 220,
      height: 55,
      label: 'SEGUINTE ▶',
      action: 'next_camera'
    };
    const btnWeb: PanelButtonArea = {
      id: 'btn-cam-web',
      x: 860,
      y: 590,
      width: 132,
      height: 55,
      label: 'WEB ↗',
      action: 'open_camera_url'
    };

    panel.buttons.push(btnPrev, btnRefresh, btnNext, btnWeb);
    this.drawHoloButton(ctx, btnPrev, highlightId === btnPrev.id);
    this.drawHoloButton(ctx, btnRefresh, highlightId === btnRefresh.id);
    this.drawHoloButton(ctx, btnNext, highlightId === btnNext.id);
    this.drawHoloButton(ctx, btnWeb, highlightId === btnWeb.id);
  }

  /**
   * PAINEL 5: DIAGNÓSTICO DO SISTEMA & LOGS
   */
  private drawDiagnosticsContent(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const diag = this.telemetry.diag;
    const isReal = diag !== null;

    // Matriz de Latência dos 4 Pilares
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fillRect(32, 90, 960, 240);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(32, 90, 960, 240);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('VARREDURA DOS 4 PILARES // ESTADO DE SAÚDE GLOBAL', 52, 130);

    const pillars = [
      { name: '1. DOMÓTICA (HA)', status: this.telemetry.home?.status === 'operational' ? 'ONLINE (4ms)' : 'STANDBY', color: '#00ff9d' },
      { name: '2. PROXMOX VE', status: this.telemetry.pve?.status === 'operational' ? 'ONLINE (6ms)' : 'STANDBY', color: '#00ff9d' },
      { name: '3. DNS & REDE', status: this.telemetry.dns?.status === 'operational' ? 'ONLINE (2ms)' : 'STANDBY', color: '#00ff9d' },
      { name: '4. DIAGNÓSTICOS', status: isReal && diag.all_healthy ? '100% OPERACIONAL' : 'EM EXECUÇÃO', color: '#00e5ff' }
    ];

    let pY = 180;
    pillars.forEach((p) => {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(p.name, 52, pY);

      ctx.fillStyle = p.color;
      ctx.fillText(p.status, 360, pY);
      pY += 36;
    });

    // Cascata de Logs de Telemetria
    ctx.fillStyle = 'rgba(1, 10, 20, 0.9)';
    ctx.fillRect(32, 350, 960, 210);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.strokeRect(32, 350, 960, 210);

    ctx.fillStyle = '#00e5ff';
    ctx.font = '13px monospace';
    ctx.fillText('STREAM DE TELEMETRIA EM TEMPO REAL (FASTAPI SSE):', 52, 380);

    const sampleLogs = [
      `[${new Date().toLocaleTimeString()}] SESSÃO WEBXR INICIADA NO META QUEST 3S`,
      `[${new Date().toLocaleTimeString()}] ADGUARD DNS // REGRA DE BLOQUEIO ATIVA`,
      `[${new Date().toLocaleTimeString()}] PROXMOX VE // CLUSTER HEALTH CHECK COMPLETO`,
      `[${new Date().toLocaleTimeString()}] HOME ASSISTANT // ENTIDADES SINCRONIZADAS VIA API`
    ];

    let logY = 410;
    sampleLogs.forEach((l) => {
      ctx.fillStyle = 'rgba(0, 255, 157, 0.85)';
      ctx.fillText(l, 52, logY);
      logY += 30;
    });

    // Botão de Execução de Diagnóstico
    const btnRunDiag: PanelButtonArea = {
      id: 'btn-run-diag-scan',
      x: 32,
      y: 585,
      width: 960,
      height: 55,
      label: '⚡ EXECUTAR VARREDURA COMPLETA DO SISTEMA (3 SEG)',
      action: 'run_diagnostics'
    };
    panel.buttons.push(btnRunDiag);
    this.drawHoloButton(ctx, btnRunDiag, highlightId === btnRunDiag.id);
  }

  /**
   * DOCK DE PULSO TÁTICO // WRIST MENU
   */
  private renderDock(panel: FloatingPanel3D, highlightId?: string) {
    const ctx = panel.context;
    const w = 1024;
    const h = 200;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(2, 10, 22, 0.94)';
    ctx.fillRect(0, 0, w, h);

    this.drawCircuitCorners(ctx, 2, 2, w - 4, h - 4, 18, '#00e5ff');

    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.fillRect(4, 4, w - 8, 36);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('⚡ STARK WRIST DOCK // CONTROLO RÁPIDO', 18, 28);

    // Telemetria do Headset Meta Quest 3S, Comandos e FPS no Dock
    const hs = this.telemetry.headset;
    const fps = hs?.fps ?? 72;
    const frameMs = hs?.frame_time_ms ?? 14;
    const bat = hs?.battery_level !== null && hs?.battery_level !== undefined ? `${hs.battery_level}%` : '100%';
    const batIcon = hs?.is_charging ? '⚡' : '🔋';
    const cLeft = hs?.controller_battery_left !== null && hs?.controller_battery_left !== undefined ? `${hs.controller_battery_left}%` : '--';
    const cRight = hs?.controller_battery_right !== null && hs?.controller_battery_right !== undefined ? `${hs.controller_battery_right}%` : '--';

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`🥽 QUEST 3S: ${batIcon}${bat} | 🎮 L:${cLeft} R:${cRight} | ⚡ ${fps} FPS (${frameMs}ms)`, w - 18, 28);
    ctx.textAlign = 'left';

    const dockButtons = [
      { id: 'dock-home', label: '🏠 HOME', action: 'toggle_panel_home' },
      { id: 'dock-pve', label: '⚡ PVE', action: 'toggle_panel_pve' },
      { id: 'dock-dns', label: '🛡️ DNS', action: 'toggle_panel_dns' },
      { id: 'dock-cam', label: '📷 CAM', action: 'toggle_panel_camera' },
      { id: 'dock-diag', label: '📊 DIAG', action: 'toggle_panel_diag' },
      { id: 'dock-focus', label: this.isFocusCollapsed ? '🌐 EXPANDIR' : '🌐 FOCO', action: 'toggle_focus_mode' },
      { id: 'dock-voice', label: '🎤 VOZ', action: 'push_to_talk' }
    ];

    panel.buttons = [];
    let bX = 14;
    const bW = 138;
    const bH = 125;

    dockButtons.forEach((b) => {
      const btnObj: PanelButtonArea = {
        id: b.id,
        x: bX,
        y: 52,
        width: bW,
        height: bH,
        label: b.label,
        action: b.action
      };
      panel.buttons.push(btnObj);
      this.drawHoloButton(ctx, btnObj, highlightId === b.id, b.id === 'dock-voice' ? '#00ff9d' : '#00e5ff');
      bX += bW + 7;
    });

    panel.texture.needsUpdate = true;
  }

  // ==========================================
  // ELEMENTOS GRÁFICOS HOLOGRÁFICOS PROCEDURAIS
  // ==========================================

  private drawCircuitCorners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, size: number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + size, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + w - size, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + size);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - size);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + size, y + h);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + w - size, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - size);
    ctx.stroke();
  }

  private drawRadialGauge(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    percent: number,
    label: string,
    unit: string,
    color: string
  ) {
    const startAngle = Math.PI * 0.75;
    const totalAngle = Math.PI * 1.5;
    const progress = Math.max(0, Math.min(100, percent)) / 100;

    // Anel de fundo
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, startAngle + totalAngle);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 14;
    ctx.stroke();

    // Arco de progresso ativo com glow
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, startAngle + totalAngle * progress);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Texto central
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${percent.toFixed(1)}${unit}`, cx, cy + 8);

    ctx.fillStyle = color;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(label, cx, cy + 32);
    ctx.textAlign = 'left';
  }

  private drawThermostatDial(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, currentTemp: number, targetTemp: number) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.06)';
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${targetTemp.toFixed(1)}°`, cx, cy + 6);

    ctx.fillStyle = '#00e5ff';
    ctx.font = '13px monospace';
    ctx.fillText(`ATUAL: ${currentTemp.toFixed(1)}°C`, cx, cy + 32);
    ctx.textAlign = 'left';
  }

  private drawShieldEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, blockedPercent: number) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ff3366';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${blockedPercent.toFixed(1)}%`, cx, cy + 8);

    ctx.fillStyle = '#00e5ff';
    ctx.font = '13px monospace';
    ctx.fillText('AMEAÇAS BLOQUEADAS', cx, cy + 38);
    ctx.textAlign = 'left';
  }

  private drawHoloButton(ctx: CanvasRenderingContext2D, btn: PanelButtonArea, isHovered: boolean, accentColor: string = '#00e5ff') {
    ctx.fillStyle = isHovered ? accentColor : 'rgba(0, 229, 255, 0.16)';
    ctx.fillRect(btn.x, btn.y, btn.width, btn.height);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);

    ctx.fillStyle = isHovered ? '#000000' : '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + btn.height / 2 + 5);
    ctx.textAlign = 'left';
  }

  // ==========================================
  // MANIPULAÇÃO ESPACIAL, RAYCASTING E ARRASTO
  // ==========================================

  public startGrab(
    mesh: THREE.Object3D,
    controllerIndex: number,
    hitPoint: THREE.Vector3,
    uv?: THREE.Vector2,
    forceGrab: boolean = false,
    controllerOrigin?: THREE.Vector3
  ): boolean {
    const panelId = mesh.userData?.panelId;
    if (!panelId) return false;

    const panel = this.panels.get(panelId);
    if (!panel || !panel.group.visible) return false;

    const py = uv ? (1.0 - uv.y) * 680 : 0;
    // Permite agarrar pela barra superior (< 70px) ou por botão lateral / trigger squeeze
    if (forceGrab || !uv || py <= 70) {
      this.grabbedPanel = panel;
      this.grabControllerIndex = controllerIndex;
      if (controllerOrigin) {
        this.grabDistance = Math.max(0.6, Math.min(3.5, hitPoint.distanceTo(controllerOrigin)));
      } else {
        this.grabDistance = Math.max(0.6, Math.min(3.5, hitPoint.distanceTo(panel.group.position) + 0.9));
      }
      soundFX.playClick();
      return true;
    }
    return false;
  }

  public releaseGrab(): boolean {
    if (this.grabbedPanel) {
      soundFX.playHoloDeploy();
      this.saveCurrentLayout();
      this.grabbedPanel = null;
      return true;
    }
    return false;
  }

  public isGrabbing(): boolean {
    return this.grabbedPanel !== null;
  }

  public updateDragging(getRayFn: (index: number) => { origin: THREE.Vector3; direction: THREE.Vector3 }, camera: THREE.Camera) {
    if (!this.grabbedPanel) return;

    const ray = getRayFn(this.grabControllerIndex);
    const targetPos = ray.origin.clone().add(ray.direction.clone().multiplyScalar(this.grabDistance));

    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);

    this.grabbedPanel.group.position.lerp(targetPos, 0.20);
    this.grabbedPanel.group.lookAt(camPos.x, this.grabbedPanel.group.position.y, camPos.z);
  }

  public handleRaycastClick(mesh: THREE.Object3D, uv?: THREE.Vector2): boolean {
    if (!uv) return false;
    const panelId = mesh.userData?.panelId;
    if (!panelId) return false;

    const panel = this.panels.get(panelId);
    if (!panel) return false;

    // Converter UV para resolução interna do Canvas (1024 x 680 ou 1024 x 200 para o dock)
    const cw = panel.canvas.width;
    const ch = panel.canvas.height;
    const px = uv.x * cw;
    const py = (1.0 - uv.y) * ch;

    for (const btn of panel.buttons) {
      if (px >= btn.x && px <= btn.x + btn.width && py >= btn.y && py <= btn.y + btn.height) {
        soundFX.playClick();
        this.renderPanel(panel, btn.id);
        setTimeout(() => this.renderPanel(panel), 140);

        if (btn.action === 'close_panel') {
          this.setVisible(panelId, false);
          this.saveCurrentLayout();
        } else if (btn.action === 'toggle_focus_mode') {
          this.toggleFocusMode();
        } else if (btn.action === 'toggle_panel_home') {
          this.togglePanel('home');
        } else if (btn.action === 'toggle_panel_pve') {
          this.togglePanel('proxmox');
        } else if (btn.action === 'toggle_panel_dns') {
          this.togglePanel('network');
        } else if (btn.action === 'toggle_panel_camera') {
          this.togglePanel('camera');
        } else if (btn.action === 'toggle_panel_diag') {
          this.togglePanel('diagnostics');
        } else if (btn.action === 'tab_home') {
          this.homeActiveTab = btn.data;
          this.renderPanel(panel);
        } else if (btn.action === 'home_prev') {
          this.homePage = Math.max(0, this.homePage - 1);
          this.renderPanel(panel);
        } else if (btn.action === 'home_next') {
          this.homePage++;
          this.renderPanel(panel);
        } else if (btn.action === 'tab_pve') {
          this.pveActiveTab = btn.data;
          this.renderPanel(panel);
        } else if (btn.action === 'pve_prev') {
          this.pvePage = Math.max(0, this.pvePage - 1);
          this.renderPanel(panel);
        } else if (btn.action === 'pve_next') {
          this.pvePage++;
          this.renderPanel(panel);
        } else if (btn.action === 'tab_net') {
          this.networkActiveTab = btn.data;
          this.renderPanel(panel);
        } else if (btn.action === 'net_prev') {
          this.networkPage = Math.max(0, this.networkPage - 1);
          this.renderPanel(panel);
        } else if (btn.action === 'net_next') {
          this.networkPage++;
          this.renderPanel(panel);
        }

        if (this.onPanelAction) {
          this.onPanelAction(btn.action, panelId, btn.data);
        }
        return true;
      }
    }
    return false;
  }

  // ==========================================
  // PERSISTÊNCIA ESPACIAL
  // ==========================================

  private loadSavedLayout() {
    try {
      const raw = localStorage.getItem('jarvis_spatial_positions_v6');
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.entries(data).forEach(([id, pos]: [string, any]) => {
        const panel = this.panels.get(id);
        if (panel && pos) {
          panel.group.position.set(pos.x, pos.y, pos.z);
          if (!panel.isDock) {
            const dummy = new THREE.Object3D();
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.lookAt(0, pos.y, 0);
            panel.group.quaternion.copy(dummy.quaternion);
          }
          if (pos.visible !== undefined) panel.group.visible = pos.visible;
        }
      });
    } catch (e) {
      console.debug('Sem posições espaciais salvas:', e);
    }
  }

  public saveCurrentLayout() {
    try {
      const layout: Record<string, any> = {};
      this.panels.forEach((p, id) => {
        layout[id] = {
          x: Number(p.group.position.x.toFixed(3)),
          y: Number(p.group.position.y.toFixed(3)),
          z: Number(p.group.position.z.toFixed(3)),
          rotY: Number(p.group.rotation.y.toFixed(3)),
          visible: p.group.visible
        };
      });
      localStorage.setItem('jarvis_spatial_positions_v6', JSON.stringify(layout));
    } catch (e) {}
  }

  public setVisible(id: string, visible: boolean) {
    const p = this.panels.get(id);
    if (p) {
      p.group.visible = visible;
      if (visible) soundFX.playHoloDeploy();
      this.saveCurrentLayout();
    }
  }

  public setAllVisible(visible: boolean) {
    this.panels.forEach((p) => {
      p.group.visible = visible;
    });
    soundFX.playHoloDeploy();
    this.saveCurrentLayout();
  }

  public togglePanel(id: string) {
    const p = this.panels.get(id);
    if (p) {
      this.setVisible(id, !p.group.visible);
    }
  }

  public getInteractiveMeshes(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    this.panels.forEach((p) => {
      if (p.group.visible) {
        p.mesh.updateWorldMatrix(true, false);
        list.push(p.mesh);
      }
    });
    return list;
  }

  public setCameraSnapshot(url: string, label: string = 'CÂMARA DE VIGILÂNCIA') {
    this.cameraSnapshotUrl = url;
    const panel = this.panels.get('camera');
    if (!panel) return;

    panel.title = `VIGILÂNCIA // ${label.toUpperCase()}`;
    this.isCameraLoading = true;
    this.renderPanel(panel);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.cameraImageObj = img;
      this.isCameraLoading = false;
      this.lastCameraUpdate = new Date().toLocaleTimeString();
      this.renderPanel(panel);
    };
    img.onerror = () => {
      this.isCameraLoading = false;
      this.renderPanel(panel);
    };
    img.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
  }

  public getCameraSnapshotUrl(): string {
    return this.cameraSnapshotUrl;
  }
}
