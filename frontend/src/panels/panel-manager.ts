/**
 * Gestor de Painéis Espaciais 3D em Three.js (Hologramas no Espaço XR com Interatividade, Agarrar/Mover e Câmara)
 */
import * as THREE from 'three';
import { soundFX } from '../scene/audio-fx';

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
  lines: string[];
}

export class SpatialPanelManager3D {
  public group: THREE.Group;
  private panels: Map<string, FloatingPanel3D> = new Map();

  // Estados de Manipulação Espacial 3D (Pilar 2: Agarrar e Reposicionar)
  private grabbedPanel: FloatingPanel3D | null = null;
  private grabControllerIndex: number = 0;
  private grabDistance: number = 1.8;

  // Estado da Câmara 3D
  private cameraSnapshotUrl: string = '';
  private cameraImageObj: HTMLImageElement | null = null;
  private isCameraLoading: boolean = false;
  private lastCameraUpdate: string = '';

  // Callback chamado quando um botão dentro do painel 3D é premido por laser/toque
  public onPanelAction?: (action: string, panelId: string, data?: any) => void;

  constructor() {
    this.group = new THREE.Group();
    this.createPanelsArc();
  }

  private createPanelsArc() {
    // 1. Painel Esquerdo: Domótica (Home Assistant)
    this.createPanel('home', 'DOMÓTICA // HOME', -1.4, 0.05, -1.8, Math.PI / 9);

    // 2. Painel Direito: Virtualização (Proxmox VE)
    this.createPanel('proxmox', 'PROXMOX // VE HOST', 1.4, 0.05, -1.8, -Math.PI / 9);

    // 3. Painel Superior Central: Rede & DNS Shield
    this.createPanel('network', 'REDE & DNS // SHIELD', 0, 1.05, -1.9, 0);

    // 4. Painel Inferior Central: Câmara & Vigilância (Pilar 2)
    this.createPanel('camera', 'VIGILÂNCIA // CÂMARA EM TEMPO REAL', 0, -0.65, -1.8, 0);
    this.setVisible('camera', false);
  }

  private createPanel(id: string, title: string, x: number, y: number, z: number, rotY: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 340;
    const ctx = canvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    // Plano holográfico 3D (1.0m x 0.65m no espaço)
    const geometry = new THREE.PlaneGeometry(1.0, 0.65);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.90,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { panelId: id, isPanelMesh: true };

    // Borda exterior luminosa wireframe
    const borderGeo = new THREE.EdgesGeometry(geometry);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2 });
    const wireframe = new THREE.LineSegments(borderGeo, borderMat);
    mesh.add(wireframe);

    const panelGroup = new THREE.Group();
    panelGroup.position.set(x, y, z);
    panelGroup.rotation.y = rotY;
    panelGroup.add(mesh);

    this.group.add(panelGroup);

    const panelObj: FloatingPanel3D = {
      id,
      group: panelGroup,
      canvas,
      context: ctx,
      texture,
      mesh,
      buttons: [],
      title,
      lines: ['A carregar telemetria espacial...']
    };

    this.panels.set(id, panelObj);
    this.drawHoloPanel(panelObj);
  }

  private drawHoloPanel(panel: FloatingPanel3D, highlightButtonId?: string) {
    const ctx = panel.context;
    const { title, lines } = panel;

    // Limpar e desenhar fundo azul translúcido
    ctx.clearRect(0, 0, 512, 340);
    ctx.fillStyle = 'rgba(5, 11, 20, 0.88)';
    ctx.fillRect(0, 0, 512, 340);

    // Borda interior ciano
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 506, 334);

    // Barra de Título Superior (Área de Agarrar / Drag)
    ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
    ctx.fillRect(4, 4, 504, 50);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 18px "SF Mono", monospace, Courier';
    ctx.fillText(title, 16, 34);

    // Indicador visual de agarrar
    ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
    ctx.font = '11px monospace';
    ctx.fillText('[✛ AGARRAR]', 350, 32);

    // Botão Fechar [X] no topo direito
    const closeBtn: PanelButtonArea = {
      id: 'btn-close',
      x: 465,
      y: 10,
      width: 35,
      height: 35,
      label: '✕',
      action: 'close_panel'
    };

    panel.buttons = [closeBtn];

    // Desenhar botão fechar
    ctx.fillStyle = highlightButtonId === 'btn-close' ? '#ff3366' : 'rgba(255, 51, 102, 0.3)';
    ctx.fillRect(closeBtn.x, closeBtn.y, closeBtn.width, closeBtn.height);
    ctx.strokeStyle = '#ff3366';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(closeBtn.x, closeBtn.y, closeBtn.width, closeBtn.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('✕', closeBtn.x + 11, closeBtn.y + 24);

    // Se for o painel de câmara, desenha a imagem ou grelha tática
    if (panel.id === 'camera') {
      if (this.cameraImageObj) {
        try {
          ctx.drawImage(this.cameraImageObj, 16, 60, 480, 205);
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(16, 60, 480, 205);

          // Timestamp overlay
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(20, 64, 180, 24);
          ctx.fillStyle = '#00ff9d';
          ctx.font = '11px monospace';
          ctx.fillText(`LIVE // ${this.lastCameraUpdate || new Date().toLocaleTimeString()}`, 28, 80);
        } catch {}
      } else {
        // Grelha CCTV tática standby
        ctx.fillStyle = 'rgba(0, 25, 35, 0.9)';
        ctx.fillRect(16, 60, 480, 205);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(16, 60, 480, 205);

        // Mira central
        ctx.strokeStyle = '#00e5ff';
        ctx.beginPath();
        ctx.moveTo(256 - 30, 162);
        ctx.lineTo(256 + 30, 162);
        ctx.moveTo(256, 162 - 30);
        ctx.lineTo(256, 162 + 30);
        ctx.stroke();

        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.isCameraLoading ? 'A CARREGAR SNAPSHOT...' : 'SINAL DE VÍDEO // AGUARDANDO ATUALIZAÇÃO', 256, 220);
        ctx.textAlign = 'left';
      }

      // Botões específicos de câmara com suporte multi-câmara
      const prevCamBtn: PanelButtonArea = {
        id: 'btn-cam-prev',
        x: 18,
        y: 280,
        width: 95,
        height: 42,
        label: '◀ ANT',
        action: 'prev_camera'
      };
      panel.buttons.push(prevCamBtn);
      this.drawButton(ctx, prevCamBtn, highlightButtonId === prevCamBtn.id);

      const refreshCamBtn: PanelButtonArea = {
        id: 'btn-cam-refresh',
        x: 120,
        y: 280,
        width: 165,
        height: 42,
        label: '⟳ ATUALIZAR',
        action: 'refresh_camera'
      };
      panel.buttons.push(refreshCamBtn);
      this.drawButton(ctx, refreshCamBtn, highlightButtonId === refreshCamBtn.id);

      const nextCamBtn: PanelButtonArea = {
        id: 'btn-cam-next',
        x: 292,
        y: 280,
        width: 95,
        height: 42,
        label: 'SEG ▶',
        action: 'next_camera'
      };
      panel.buttons.push(nextCamBtn);
      this.drawButton(ctx, nextCamBtn, highlightButtonId === nextCamBtn.id);

      const openCamBtn: PanelButtonArea = {
        id: 'btn-cam-open',
        x: 394,
        y: 280,
        width: 100,
        height: 42,
        label: 'WEB ↗',
        action: 'open_camera_url'
      };
      panel.buttons.push(openCamBtn);
      this.drawButton(ctx, openCamBtn, highlightButtonId === openCamBtn.id);

      panel.texture.needsUpdate = true;
      return;
    }

    // Linhas de Conteúdo padrão dos outros painéis
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px "SF Mono", monospace, Courier';
    let startY = 88;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 20, startY);
      startY += 30;
    }

    // Botões de Ação na base do painel
    if (panel.id === 'home') {
      const openHaBtn: PanelButtonArea = {
        id: 'btn-open-ha',
        x: 14,
        y: 280,
        width: 140,
        height: 42,
        label: '🖥️ DASHBOARD HA',
        action: 'open_ha_native'
      };
      panel.buttons.push(openHaBtn);
      this.drawButton(ctx, openHaBtn, highlightButtonId === openHaBtn.id);

      const toggleLightBtn: PanelButtonArea = {
        id: 'btn-toggle-light',
        x: 160,
        y: 280,
        width: 105,
        height: 42,
        label: '💡 LUZES',
        action: 'toggle_light',
        data: { entity_id: 'light.escritorio' }
      };
      panel.buttons.push(toggleLightBtn);
      this.drawButton(ctx, toggleLightBtn, highlightButtonId === toggleLightBtn.id);

      const camBtn: PanelButtonArea = {
        id: 'btn-view-camera',
        x: 271,
        y: 280,
        width: 105,
        height: 42,
        label: '📷 CÂMARA',
        action: 'open_panel_camera'
      };
      panel.buttons.push(camBtn);
      this.drawButton(ctx, camBtn, highlightButtonId === camBtn.id);

      const refreshBtn: PanelButtonArea = {
        id: 'btn-refresh',
        x: 382,
        y: 280,
        width: 115,
        height: 42,
        label: '⟳ ATUALIZAR',
        action: 'refresh_data'
      };
      panel.buttons.push(refreshBtn);
      this.drawButton(ctx, refreshBtn, highlightButtonId === refreshBtn.id);
    } else {
      const refreshBtn: PanelButtonArea = {
        id: 'btn-refresh',
        x: 20,
        y: 280,
        width: 240,
        height: 42,
        label: '⟳ ATUALIZAR MÉTRICAS',
        action: 'refresh_data'
      };
      panel.buttons.push(refreshBtn);
      this.drawButton(ctx, refreshBtn, highlightButtonId === refreshBtn.id);
    }

    panel.texture.needsUpdate = true;
  }

  private drawButton(ctx: CanvasRenderingContext2D, btn: PanelButtonArea, isHovered: boolean) {
    ctx.fillStyle = isHovered ? 'rgba(0, 229, 255, 0.6)' : 'rgba(0, 229, 255, 0.2)';
    ctx.fillRect(btn.x, btn.y, btn.width, btn.height);

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);

    ctx.fillStyle = isHovered ? '#000000' : '#00e5ff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + 26);
    ctx.textAlign = 'left';
  }

  /**
   * Trata o clique espacial no painel via coordenadas UV do Raycaster (WebXR)
   */
  public handleRaycastClick(mesh: THREE.Object3D, uv?: THREE.Vector2) {
    if (!uv) return;
    const panelId = mesh.userData?.panelId;
    if (!panelId) return;

    const panel = this.panels.get(panelId);
    if (!panel) return;

    // Converter UV (0.0 a 1.0) para coordenadas de pixel no Canvas (512 x 340)
    const px = uv.x * 512;
    const py = (1.0 - uv.y) * 340;

    for (const btn of panel.buttons) {
      if (
        px >= btn.x &&
        px <= btn.x + btn.width &&
        py >= btn.y &&
        py <= btn.y + btn.height
      ) {
        soundFX.playClick();

        // Flash visual de clique
        this.drawHoloPanel(panel, btn.id);
        setTimeout(() => this.drawHoloPanel(panel), 150);

        if (btn.action === 'close_panel') {
          this.setVisible(panelId, false);
          soundFX.playHoloDeploy();
        } else if (btn.action === 'open_panel_camera') {
          this.setVisible('camera', true);
          soundFX.playHoloDeploy();
        }

        if (this.onPanelAction) {
          this.onPanelAction(btn.action, panelId, btn.data);
        }
        break;
      }
    }
  }

  /**
   * Inicia o agarrar espacial 3D para reposicionar o painel na sala (Pilar 2)
   */
  public startGrab(
    mesh: THREE.Object3D,
    controllerIndex: number,
    hitPoint: THREE.Vector3,
    uv?: THREE.Vector2,
    forceGrab: boolean = false
  ): boolean {
    const panelId = mesh.userData?.panelId;
    if (!panelId) return false;

    const panel = this.panels.get(panelId);
    if (!panel || !panel.group.visible) return false;

    const py = uv ? (1.0 - uv.y) * 340 : 0;
    // Agarra se clicou na barra de título (topo < 55px) ou através do gatilho lateral (grip)
    if (forceGrab || !uv || py <= 55) {
      this.grabbedPanel = panel;
      this.grabControllerIndex = controllerIndex;
      // Mantém a distância atual do utilizador ao painel
      this.grabDistance = Math.max(0.8, Math.min(3.5, hitPoint.distanceTo(panel.group.position) + 1.8));
      soundFX.playClick();
      return true;
    }
    return false;
  }

  /**
   * Solta o painel agarrado, fixando-o na nova posição tridimensional
   */
  public releaseGrab(): boolean {
    if (this.grabbedPanel) {
      soundFX.playHoloDeploy();
      this.grabbedPanel = null;
      return true;
    }
    return false;
  }

  public isGrabbing(): boolean {
    return this.grabbedPanel !== null;
  }

  /**
   * Atualiza a posição do painel durante o arrasto espacial no ciclo de renderização
   */
  public updateDragging(
    getRayFn: (index: number) => { origin: THREE.Vector3; direction: THREE.Vector3 },
    camera: THREE.Camera
  ) {
    if (!this.grabbedPanel) return;

    const ray = getRayFn(this.grabControllerIndex);
    const targetPos = ray.origin.clone().add(ray.direction.clone().multiplyScalar(this.grabDistance));

    // Interpolação suave (lerp) para movimento fluido e sem trepidação
    this.grabbedPanel.group.position.lerp(targetPos, 0.20);

    // Reorienta o painel para ficar virado para o utilizador
    this.grabbedPanel.group.lookAt(
      camera.position.x,
      this.grabbedPanel.group.position.y,
      camera.position.z
    );
  }

  /**
   * Atualiza o snapshot da câmara 3D (Pilar 2)
   */
  public setCameraSnapshot(url: string, label: string = 'CÂMARA DE VIGILÂNCIA') {
    this.cameraSnapshotUrl = url;
    const panel = this.panels.get('camera');
    if (!panel) return;

    panel.title = `VIGILÂNCIA // ${label.toUpperCase()}`;
    this.isCameraLoading = true;
    this.drawHoloPanel(panel);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.cameraImageObj = img;
      this.isCameraLoading = false;
      this.lastCameraUpdate = new Date().toLocaleTimeString();
      this.drawHoloPanel(panel);
    };
    img.onerror = () => {
      this.isCameraLoading = false;
      this.drawHoloPanel(panel);
    };
    img.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
  }

  public getCameraSnapshotUrl(): string {
    return this.cameraSnapshotUrl;
  }

  /**
   * Devolve a lista de meshes dos painéis para o Raycaster interativo
   */
  public getInteractiveMeshes(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    this.panels.forEach((p) => {
      if (p.group.visible) {
        list.push(p.mesh);
      }
    });
    return list;
  }

  /**
   * Atualiza o conteúdo textual desenhado na textura 3D do painel
   */
  public updatePanelContent(id: string, title: string, lines: string[]) {
    const p = this.panels.get(id);
    if (!p) return;
    p.title = title;
    p.lines = lines;
    this.drawHoloPanel(p);
  }

  /**
   * Mostra ou oculta painéis
   */
  public setVisible(id: string, visible: boolean) {
    const p = this.panels.get(id);
    if (p) {
      p.group.visible = visible;
      if (visible) {
        soundFX.playHoloDeploy();
      }
    }
  }

  /**
   * Mostra ou oculta todos os painéis
   */
  public setAllVisible(visible: boolean) {
    this.panels.forEach((p) => {
      p.group.visible = visible;
    });
    soundFX.playHoloDeploy();
  }
}
