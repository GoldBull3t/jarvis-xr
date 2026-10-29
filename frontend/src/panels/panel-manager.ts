/**
 * Gestor de Painéis Espaciais 3D em Three.js (Hologramas no Espaço XR com Interatividade)
 */
import * as THREE from 'three';

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

    // Barra de Título Superior
    ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
    ctx.fillRect(4, 4, 504, 50);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 20px "SF Mono", monospace, Courier';
    ctx.fillText(title, 18, 36);

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

    // Linhas de Conteúdo
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px "SF Mono", monospace, Courier';
    let startY = 88;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 20, startY);
      startY += 30;
    }

    // Botões de Ação na base do painel (ex.: Atualizar dados ou Alternar luz)
    if (panel.id === 'home') {
      const toggleLightBtn: PanelButtonArea = {
        id: 'btn-toggle-light',
        x: 20,
        y: 280,
        width: 220,
        height: 42,
        label: '💡 LUZ ESCRITÓRIO',
        action: 'toggle_light',
        data: { entity_id: 'light.escritorio' }
      };
      panel.buttons.push(toggleLightBtn);
      this.drawButton(ctx, toggleLightBtn, highlightButtonId === toggleLightBtn.id);
    }

    const refreshBtn: PanelButtonArea = {
      id: 'btn-refresh',
      x: panel.id === 'home' ? 260 : 20,
      y: 280,
      width: 230,
      height: 42,
      label: '⟳ ATUALIZAR MÉTRICAS',
      action: 'refresh_data'
    };
    panel.buttons.push(refreshBtn);
    this.drawButton(ctx, refreshBtn, highlightButtonId === refreshBtn.id);

    panel.texture.needsUpdate = true;
  }

  private drawButton(ctx: CanvasRenderingContext2D, btn: PanelButtonArea, isHovered: boolean) {
    ctx.fillStyle = isHovered ? 'rgba(0, 229, 255, 0.6)' : 'rgba(0, 229, 255, 0.2)';
    ctx.fillRect(btn.x, btn.y, btn.width, btn.height);

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);

    ctx.fillStyle = isHovered ? '#000000' : '#00e5ff';
    ctx.font = 'bold 15px monospace';
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
        // Flash visual de clique
        this.drawHoloPanel(panel, btn.id);
        setTimeout(() => this.drawHoloPanel(panel), 150);

        if (btn.action === 'close_panel') {
          this.setVisible(panelId, false);
        }

        if (this.onPanelAction) {
          this.onPanelAction(btn.action, panelId, btn.data);
        }
        break;
      }
    }
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
    if (p) p.group.visible = visible;
  }

  /**
   * Mostra ou oculta todos os painéis
   */
  public setAllVisible(visible: boolean) {
    this.panels.forEach((p) => {
      p.group.visible = visible;
    });
  }
}
