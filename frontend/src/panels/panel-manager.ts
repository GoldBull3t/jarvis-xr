/**
 * Gestor de Painéis Espaciais 3D em Three.js — JARVIS XR Stark Edition
 * Renderização Holográfica Avançada, Efeito Billboard Inteligente, Persistência Espacial,
 * Medidores Circulares, Orbes Luminosas e Menu de Pulso/Dock.
 */
import * as THREE from 'three';
import { soundFX } from '../scene/audio-fx';
import {
  HomeSummaryData,
  ProxmoxSummaryData,
  DnsSummaryData,
  FullDiagnosticsData,
  ServiceHealthItem,
  DemoStatusData,
  EntityState,
  ProxmoxVM
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
  demo: DemoStatusData | null;
  home: HomeSummaryData | null;
  pve: ProxmoxSummaryData | null;
  dns: DnsSummaryData | null;
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
    demo: null,
    home: null,
    pve: null,
    dns: null,
    diag: null,
    services: null
  };

  // Modo Foco (Question 30: Recolher todos os painéis para o centro)
  private isFocusCollapsed: boolean = false;
  private preFocusPositions: Map<string, THREE.Vector3> = new Map();

  // Animação de Scanline global
  private scanlineY: number = 0;

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
    this.createPanel('home', 'DOMÓTICA // RESIDÊNCIA STARK', -0.95, 0.10, -1.25, Math.PI / 10);

    // 2. Painel Proxmox VE (Cluster & Medidores de Energia)
    this.createPanel('proxmox', 'PROXMOX // CLUSTER DE PROCESSAMENTO', 0.95, 0.10, -1.25, -Math.PI / 10);

    // 3. Painel Rede & DNS Shield (AdGuard / Proteção)
    this.createPanel('network', 'ESCUDO CIBERNÉTICO // REDE & DNS', 0, 0.72, -1.35, 0);

    // 4. Painel Vigilância CCTV (Câmara em Tempo Real)
    this.createPanel('camera', 'VIGILÂNCIA TÁTICA // SEGURANÇA PERIMÉTRICA', 0, -0.55, -1.35, 0);
    this.setVisible('camera', false);

    // 5. Painel Diagnósticos dos 4 Pilares & Terminal
    this.createPanel('diagnostics', 'DIAGNÓSTICO // ANÁLISE DOS 4 PILARES', 1.45, -0.20, -1.50, -Math.PI / 7);
    this.setVisible('diagnostics', false);

    // 6. Dock Tático de Pulso (Wrist Menu - Question 29)
    this.createDockPanel();
  }

  private createPanel(id: string, title: string, x: number, y: number, z: number, _rotY: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 680;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
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
    // O rotateY(Math.PI) compensa o lookAt do Three.js para que o texto nunca fique espelhado
    const dummy = new THREE.Object3D();
    dummy.position.set(x, y, z);
    dummy.lookAt(0, y, 0);
    dummy.rotateY(Math.PI);
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
  public update(delta: number, camera: THREE.Camera) {
    this.scanlineY = (this.scanlineY + delta * 120) % 680;

    // Efeito Billboard Inteligente (Question 2: orientação suave Y para o olhar do utilizador)
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
      // Três.js lookAt aponta o eixo local -Z ao alvo. Rodamos 180° em Y para que a face frontal (+Z)
      // aponte diretamente aos olhos do utilizador, eliminando qualquer efeito de texto invertido/espelhado.
      dummy.rotateY(Math.PI);

      // Slerp suave (0.05) mantendo a face frontal orientada para o utilizador
      p.group.quaternion.slerp(dummy.quaternion, 0.05);
    });
  }

  /**
   * Modo Foco: Recolhe ou restaura todos os painéis holográficos (Question 30)
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

    // 4. Scanlines subtis (Question 7)
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
   * PAINEL 1: DOMÓTICA // HOME ASSISTANT STARK (Luzes, Orbes, Termostato, Cenas)
   */
  private drawHomeContent(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const home = this.telemetry.home;
    const isReal = home && home.configured && home.status === 'operational';

    const temp = isReal ? (home.temperature_celsius ?? 21.5) : 21.5;
    const hum = isReal ? (home.humidity_percent ?? 45) : 45;
    const power = isReal ? (home.power_consumption_watts ?? 380) : 380;
    const lightsOn = isReal ? home.lights_on : 2;
    const totalLights = isReal ? home.total_lights : 6;

    // Barra de Métricas Ambientais de Topo
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fillRect(24, 86, 976, 54);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.strokeRect(24, 86, 976, 54);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px monospace';
    ctx.fillText(`🌡️ AMBIENTE: ${temp.toFixed(1)} °C`, 36, 120);
    ctx.fillText(`💧 HUM: ${hum.toFixed(0)} %`, 290, 120);
    ctx.fillText(`⚡ CONSUMO: ${power.toFixed(0)} W`, 490, 120);
    ctx.fillText(`💡 LUZES: ${lightsOn}/${totalLights}`, 750, 120);

    // Widget 1: Termostato Circular Holográfico (Question 18)
    this.drawThermostatDial(ctx, 160, 260, 85, temp, 22.0);

    const btnTempDown: PanelButtonArea = {
      id: 'btn-temp-down',
      x: 60,
      y: 360,
      width: 80,
      height: 44,
      label: '[-] 0.5°',
      action: 'temp_down'
    };
    const btnTempUp: PanelButtonArea = {
      id: 'btn-temp-up',
      x: 180,
      y: 360,
      width: 80,
      height: 44,
      label: '[+] 0.5°',
      action: 'temp_up'
    };
    panel.buttons.push(btnTempDown, btnTempUp);
    this.drawHoloButton(ctx, btnTempDown, highlightId === btnTempDown.id);
    this.drawHoloButton(ctx, btnTempUp, highlightId === btnTempUp.id);

    // Widget 2: Orbes e Interruptores de Iluminação (Question 16)
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('DISPOSITIVOS TÁTEIS // ILUMINAÇÃO & TOMADAS', 340, 175);

    const entities: EntityState[] = isReal && home.authorized_entities && home.authorized_entities.length > 0
      ? home.authorized_entities.filter(e => e.domain === 'light' || e.domain === 'switch').slice(0, 4)
      : [
          { entity_id: 'light.escritorio', state: 'on', friendly_name: 'Luz Escritório', domain: 'light', attributes: {} },
          { entity_id: 'light.sala', state: 'off', friendly_name: 'Luz Sala de Estar', domain: 'light', attributes: {} },
          { entity_id: 'switch.servidor', state: 'on', friendly_name: 'Tomada Homelab', domain: 'switch', attributes: {} },
          { entity_id: 'light.teto', state: 'on', friendly_name: 'Fita LED Holográfica', domain: 'light', attributes: {} }
        ];

    let startY = 195;
    entities.forEach((ent, idx) => {
      const isOn = ent.state === 'on';
      const orbX = 365;
      const orbY = startY + 22;

      // Orbe luminosa com glow
      ctx.beginPath();
      ctx.arc(orbX, orbY, 14, 0, Math.PI * 2);
      ctx.fillStyle = isOn ? '#ffb700' : 'rgba(255, 255, 255, 0.2)';
      ctx.shadowColor = isOn ? '#ffb700' : 'transparent';
      ctx.shadowBlur = isOn ? 16 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Nome da entidade
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(ent.friendly_name.substring(0, 24), 395, orbY + 6);

      // Botão de alternância tátil
      const btnToggle: PanelButtonArea = {
        id: `btn-ent-${idx}`,
        x: 820,
        y: startY + 2,
        width: 170,
        height: 40,
        label: isOn ? '● LIGADO' : '○ DESLIGADO',
        action: 'toggle_entity',
        data: { entity_id: ent.entity_id, domain: ent.domain }
      };
      panel.buttons.push(btnToggle);
      this.drawHoloButton(ctx, btnToggle, highlightId === btnToggle.id, isOn ? '#ffb700' : '#00e5ff');

      startY += 54;
    });

    // Barra de Macros e Cenas Rápidas (Question 20)
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 560);
    ctx.lineTo(1000, 560);
    ctx.stroke();

    const scenes = [
      { id: 'macro-lab', label: '⚡ MODO LABORATÓRIO', action: 'macro_lab' },
      { id: 'macro-cinema', label: '🎬 MODO CINEMA', action: 'macro_cinema' },
      { id: 'macro-night', label: '🌙 MODO NOITE', action: 'macro_night' },
      { id: 'macro-all-off', label: '⭕ DESLIGAR TUDO', action: 'macro_off' }
    ];

    let scX = 24;
    scenes.forEach(sc => {
      const btn: PanelButtonArea = {
        id: sc.id,
        x: scX,
        y: 585,
        width: 232,
        height: 52,
        label: sc.label,
        action: sc.action
      };
      panel.buttons.push(btn);
      this.drawHoloButton(ctx, btn, highlightId === btn.id);
      scX += 248;
    });
  }

  /**
   * PAINEL 2: PROXMOX VE // CLUSTER STARK (Medidores Radiais de CPU/RAM e VMs)
   */
  private drawProxmoxContent(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const pve = this.telemetry.pve;
    const isReal = pve && pve.configured && pve.status === 'operational';

    const cpu = isReal ? pve.cpu_usage_percent : 14.5;
    const ram = isReal ? pve.ram_usage_percent : 58.2;
    const ramUsed = isReal ? pve.ram_used_gb : 18.6;
    const ramTotal = isReal ? pve.ram_total_gb : 32.0;

    // Medidores Circulares de Energia (Question 22)
    this.drawRadialGauge(ctx, 160, 210, 80, cpu, 'CPU', '%', '#00e5ff');
    this.drawRadialGauge(ctx, 360, 210, 80, ram, 'RAM', '%', '#ffb700');

    // Resumo de Nós e Cluster
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fillRect(490, 120, 510, 180);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.strokeRect(490, 120, 510, 180);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`CLUSTER: ${isReal ? pve.cluster_name.toUpperCase() : 'PVE-PRIMARY'}`, 510, 155);
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px monospace';
    ctx.fillText(`• Nós Online: ${isReal ? pve.nodes_online : 1} / ${isReal ? pve.total_nodes : 1}`, 510, 195);
    ctx.fillText(`• VMs & Containers: ${isReal ? pve.vms_running : 5} ativos de ${isReal ? pve.total_vms : 6}`, 510, 230);
    ctx.fillText(`• Memória Utilizada: ${ramUsed.toFixed(1)} GB / ${ramTotal.toFixed(0)} GB`, 510, 265);

    // Lista de Máquinas Virtuais com Ações Protegidas (Question 21 e 23)
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('MÁQUINAS VIRTUAIS // CONTROLO TÁTIL', 24, 340);

    const vms: ProxmoxVM[] = isReal && pve.vms && pve.vms.length > 0
      ? pve.vms.slice(0, 3)
      : [
          { vmid: 100, name: 'Cosmos-LXC-Proxy', status: 'running', type: 'lxc', cpu: 0.1, mem: 1024, maxmem: 4096, node: 'pve' },
          { vmid: 101, name: 'Home-Assistant-OS', status: 'running', type: 'qemu', cpu: 0.2, mem: 4096, maxmem: 8192, node: 'pve' },
          { vmid: 102, name: 'AdGuard-DNS-Shield', status: 'running', type: 'lxc', cpu: 0.05, mem: 512, maxmem: 1024, node: 'pve' }
        ];

    let vmY = 365;
    vms.forEach((vm) => {
      const isRunning = vm.status === 'running';

      ctx.fillStyle = 'rgba(0, 15, 30, 0.6)';
      ctx.fillRect(24, vmY, 976, 68);
      ctx.strokeStyle = isRunning ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 51, 102, 0.4)';
      ctx.strokeRect(24, vmY, 976, 68);

      // Estado dot
      ctx.beginPath();
      ctx.arc(48, vmY + 34, 8, 0, Math.PI * 2);
      ctx.fillStyle = isRunning ? '#00ff9d' : '#ff3366';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(`[${vm.vmid}] ${vm.name}`, 72, vmY + 40);

      // Botões de Ação Protegidos
      const btnReboot: PanelButtonArea = {
        id: `btn-vm-reboot-${vm.vmid}`,
        x: 670,
        y: vmY + 12,
        width: 150,
        height: 44,
        label: '⟳ REINICIAR',
        action: 'action_vm',
        data: { vmid: vm.vmid, action: 'reboot', vmName: vm.name }
      };
      const btnPower: PanelButtonArea = {
        id: `btn-vm-power-${vm.vmid}`,
        x: 835,
        y: vmY + 12,
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

    // Botão de Atualização Geral no fundo
    const btnRefreshPve: PanelButtonArea = {
      id: 'btn-pve-refresh',
      x: 24,
      y: 615,
      width: 976,
      height: 45,
      label: '⟳ ATUALIZAR TELEMETRIA DO CLUSTER',
      action: 'refresh_data'
    };
    panel.buttons.push(btnRefreshPve);
    this.drawHoloButton(ctx, btnRefreshPve, highlightId === btnRefreshPve.id);
  }

  /**
   * PAINEL 3: ESCUDO CIBERNÉTICO // DNS & REDE (AdGuard Holográfico)
   */
  private drawNetworkContent(ctx: CanvasRenderingContext2D, panel: FloatingPanel3D, highlightId?: string) {
    const dns = this.telemetry.dns;
    const isReal = dns && dns.configured && dns.status === 'operational';

    const queries = isReal ? dns.queries_today : 34820;
    const blocked = isReal ? dns.blocked_today : 9410;
    const blockPercent = isReal ? dns.block_percentage : 27.0;
    const clients = isReal ? dns.clients_active : 14;

    // Escudo Central Holográfico (Question 24)
    this.drawShieldEmblem(ctx, 220, 270, 110, blockPercent);

    // Estatísticas em Grelha
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fillRect(440, 110, 560, 320);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.strokeRect(440, 110, 560, 320);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`FORNECEDOR: ${isReal ? dns.provider.toUpperCase() : 'ADGUARD SHIELD'}`, 470, 160);

    ctx.fillStyle = '#ffffff';
    ctx.font = '17px monospace';
    ctx.fillText(`• Consultas DNS Hoje: ${queries.toLocaleString()}`, 470, 215);
    ctx.fillStyle = '#ff3366';
    ctx.fillText(`• Ameaças Bloqueadas: ${blocked.toLocaleString()} (${blockPercent}%)`, 470, 270);
    ctx.fillStyle = '#00ff9d';
    ctx.fillText(`• Dispositivos Ativos na LAN: ${clients} IPs`, 470, 325);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`• Estado: ESCUDO HOLOGRÁFICO ATIVO`, 470, 380);

    // Controlos Rápidos de Rede (Question 26)
    const btnPauseDns: PanelButtonArea = {
      id: 'btn-dns-pause-5m',
      x: 40,
      y: 470,
      width: 440,
      height: 60,
      label: '⏸️ PAUSAR PROTEÇÃO (5 MIN)',
      action: 'pause_dns_5m'
    };
    const btnFlushCache: PanelButtonArea = {
      id: 'btn-dns-flush',
      x: 520,
      y: 470,
      width: 440,
      height: 60,
      label: '🛡️ FORÇAR ATUALIZAÇÃO REGRAS',
      action: 'refresh_dns'
    };
    panel.buttons.push(btnPauseDns, btnFlushCache);
    this.drawHoloButton(ctx, btnPauseDns, highlightId === btnPauseDns.id, '#ffb700');
    this.drawHoloButton(ctx, btnFlushCache, highlightId === btnFlushCache.id);

    // Indicador de Tráfego em Fluxo (Question 25)
    ctx.fillStyle = 'rgba(0, 229, 255, 0.5)';
    ctx.font = '13px monospace';
    ctx.fillText('FLUXO DE PACOTES // PROTEÇÃO ATIVA EM TEMPO REAL NO ROUTER', 40, 600);
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
   * PAINEL 5: DIAGNÓSTICO DO SISTEMA & LOGS (Question 27 e 28)
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

    // Cascata de Logs de Telemetria (Question 28)
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
   * DOCK DE PULSO TÁTICO // WRIST MENU (Question 29)
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
    this.grabbedPanel.group.rotateY(Math.PI);
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
  // PERSISTÊNCIA ESPACIAL (Question 3)
  // ==========================================

  private loadSavedLayout() {
    try {
      const raw = localStorage.getItem('jarvis_spatial_positions_v5');
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
            dummy.rotateY(Math.PI);
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
      localStorage.setItem('jarvis_spatial_positions_v5', JSON.stringify(layout));
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
