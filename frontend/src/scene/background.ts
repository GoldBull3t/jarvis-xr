/**
 * Gestão de iluminação e fundo da cena 3D (Desktop e AR Passthrough)
 */
import * as THREE from 'three';

export class SceneBackgroundManager {
  private scene: THREE.Scene;
  private gridHelper: THREE.GridHelper | null = null;
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Iluminação ambiente futurista
    this.ambientLight = new THREE.AmbientLight(0x00e5ff, 0.4);
    this.scene.add(this.ambientLight);

    // Luz direcional pontual para reflexos nas arestas holográficas
    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.dirLight.position.set(2, 4, 3);
    this.scene.add(this.dirLight);

    this.createDesktopGrid();
  }

  private createDesktopGrid() {
    // Grelha tática suave para o modo Desktop
    this.gridHelper = new THREE.GridHelper(20, 40, 0x0077ff, 0x002244);
    this.gridHelper.position.y = -1.5;
    this.scene.add(this.gridHelper);
  }

  /**
   * Configura o modo de transparência para Passthrough (XR) ou Desktop
   */
  public setArPassthrough(enabled: boolean) {
    if (enabled) {
      if (this.gridHelper) this.gridHelper.visible = false;
      this.scene.background = null; // Transparência total para o Quest ver o mundo real
    } else {
      if (this.gridHelper) this.gridHelper.visible = true;
      this.scene.background = new THREE.Color(0x050b14);
    }
  }
}

