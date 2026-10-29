/**
 * Gestor de WebXR, Controladores Meta Quest Touch Plus e Hand Tracking (Three.js)
 */
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';

export interface XRInteractionEvent {
  intersectedObject: THREE.Object3D;
  point: THREE.Vector3;
  uv?: THREE.Vector2;
  controllerIndex: number;
}

export class XRManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;

  // Controladores e Modelos
  public controller1: THREE.XRTargetRaySpace;
  public controller2: THREE.XRTargetRaySpace;
  public controllerGrip1: THREE.XRGripSpace;
  public controllerGrip2: THREE.XRGripSpace;

  // Hand Tracking
  public hand1: THREE.XRHandSpace;
  public hand2: THREE.XRHandSpace;

  // Raycasting e Apontadores Visuais
  private raycaster: THREE.Raycaster;
  private tempMatrix: THREE.Matrix4;
  private rayLine1: THREE.Line;
  private rayLine2: THREE.Line;
  private reticle: THREE.Mesh;

  // Alvos interativos na cena (Painéis 3D)
  private interactiveObjects: THREE.Object3D[] = [];

  // Callbacks de interação
  public onSelectCallback?: (event: XRInteractionEvent) => void;
  public onSelectStartCallback?: (event: XRInteractionEvent) => void;
  public onSelectEndCallback?: (controllerIndex: number) => void;
  public onSqueezeStartCallback?: (event: XRInteractionEvent) => void;
  public onSqueezeEndCallback?: (controllerIndex: number) => void;
  public onHoverCallback?: (event: XRInteractionEvent | null) => void;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();

    // 1. Configurar Raios Visuais (Laser Pointers)
    this.rayLine1 = this.createRayLine();
    this.rayLine2 = this.createRayLine();

    // 2. Retículo / Cursor no Ponto de Contacto
    const reticleGeo = new THREE.RingGeometry(0.015, 0.025, 32);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    this.reticle = new THREE.Mesh(reticleGeo, reticleMat);
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    // 3. Inicializar Controladores
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    // Controlador 0 (Mão Direita/Esquerda primária)
    this.controller1 = this.renderer.xr.getController(0);
    this.controller1.add(this.rayLine1);
    this.scene.add(this.controller1);

    this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
    this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
    this.scene.add(this.controllerGrip1);

    // Controlador 1 (Secundário)
    this.controller2 = this.renderer.xr.getController(1);
    this.controller2.add(this.rayLine2);
    this.scene.add(this.controller2);

    this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
    this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
    this.scene.add(this.controllerGrip2);

    // 4. Inicializar Hand Tracking (Mãos Virtuais)
    this.hand1 = this.renderer.xr.getHand(0);
    this.hand1.add(handModelFactory.createHandModel(this.hand1, 'mesh'));
    this.scene.add(this.hand1);

    this.hand2 = this.renderer.xr.getHand(1);
    this.hand2.add(handModelFactory.createHandModel(this.hand2, 'mesh'));
    this.scene.add(this.hand2);

    // 5. Registar Eventos de Seleção (Pinch no Hand Tracking ou Trigger no Comando)
    this.setupSelectEvents();
  }

  private createRayLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2.5) // Raio estende-se 2.5 metros à frente
    ]);
    const material = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.6
    });
    return new THREE.Line(geometry, material);
  }

  private setupSelectEvents() {
    // Gestão dinâmica de ligação/desligamento de comandos e mãos (Hot-Swapping)
    this.controller1.addEventListener('connected', (event: any) => {
      this.rayLine1.visible = true;
      if (event.data?.targetRayMode === 'screen') {
        this.rayLine1.visible = false;
      }
    });
    this.controller1.addEventListener('disconnected', () => {
      this.rayLine1.visible = false;
    });

    this.controller2.addEventListener('connected', (event: any) => {
      this.rayLine2.visible = true;
      if (event.data?.targetRayMode === 'screen') {
        this.rayLine2.visible = false;
      }
    });
    this.controller2.addEventListener('disconnected', () => {
      this.rayLine2.visible = false;
    });

    // Disparo por gatilho ou pinch do controlador 0
    this.controller1.addEventListener('selectstart', () => {
      this.handleSelect(0);
      this.handleSelectStart(0);
    });
    this.controller1.addEventListener('selectend', () => {
      if (this.onSelectEndCallback) this.onSelectEndCallback(0);
    });
    this.controller1.addEventListener('squeezestart', () => {
      this.handleSqueezeStart(0);
    });
    this.controller1.addEventListener('squeezeend', () => {
      if (this.onSqueezeEndCallback) this.onSqueezeEndCallback(0);
    });
    this.controller1.addEventListener('select', () => this.triggerHaptic(0));

    // Disparo por gatilho ou pinch do controlador 1
    this.controller2.addEventListener('selectstart', () => {
      this.handleSelect(1);
      this.handleSelectStart(1);
    });
    this.controller2.addEventListener('selectend', () => {
      if (this.onSelectEndCallback) this.onSelectEndCallback(1);
    });
    this.controller2.addEventListener('squeezestart', () => {
      this.handleSqueezeStart(1);
    });
    this.controller2.addEventListener('squeezeend', () => {
      if (this.onSqueezeEndCallback) this.onSqueezeEndCallback(1);
    });
    this.controller2.addEventListener('select', () => this.triggerHaptic(1));
  }

  private handleSelectStart(controllerIndex: number) {
    const hit = this.raycastController(controllerIndex);
    if (hit) {
      this.triggerHaptic(controllerIndex, 0.4, 30);
      if (this.onSelectStartCallback) {
        this.onSelectStartCallback({
          intersectedObject: hit.object,
          point: hit.point,
          uv: hit.uv,
          controllerIndex
        });
      }
    }
  }

  private handleSqueezeStart(controllerIndex: number) {
    const hit = this.raycastController(controllerIndex);
    if (hit) {
      this.triggerHaptic(controllerIndex, 0.7, 60);
      if (this.onSqueezeStartCallback) {
        this.onSqueezeStartCallback({
          intersectedObject: hit.object,
          point: hit.point,
          uv: hit.uv,
          controllerIndex
        });
      }
    }
  }

  private raycastController(controllerIndex: number): THREE.Intersection | null {
    const controller = controllerIndex === 0 ? this.controller1 : this.controller2;
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);
    return intersects.length > 0 ? intersects[0] : null;
  }

  private handleSelect(controllerIndex: number) {
    const hit = this.raycastController(controllerIndex);
    if (hit && this.onSelectCallback) {
      this.onSelectCallback({
        intersectedObject: hit.object,
        point: hit.point,
        uv: hit.uv,
        controllerIndex
      });
    }
  }

  public getControllerRay(controllerIndex: number): { origin: THREE.Vector3; direction: THREE.Vector3 } {
    const controller = controllerIndex === 0 ? this.controller1 : this.controller2;
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(this.tempMatrix);
    return { origin, direction };
  }

  public getController(controllerIndex: number): THREE.XRTargetRaySpace {
    return controllerIndex === 0 ? this.controller1 : this.controller2;
  }

  /**
   * Feedback háptico de vibração tátil nos comandos Meta Quest Touch Plus (Question 14)
   */
  public triggerHaptic(controllerIndex: number = 0, intensity: number = 0.5, durationMs: number = 40) {
    const session = this.renderer.xr.getSession();
    if (!session || !session.inputSources) return;

    const source = session.inputSources[controllerIndex];
    if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators.length > 0) {
      try {
        source.gamepad.hapticActuators[0].pulse(intensity, durationMs);
      } catch {}
    }
  }

  /**
   * Define a lista de objetos 3D que podem ser apontados e clicados
   */
  public setInteractiveObjects(objects: THREE.Object3D[]) {
    this.interactiveObjects = objects;
  }

  /**
   * Atualização contínua por frame (executada no render loop XR)
   */
  public update() {
    if (!this.renderer.xr.isPresenting) {
      this.reticle.visible = false;
      return;
    }

    // Faz raycasting contínuo com o controlador 0 (mão dominante)
    this.tempMatrix.identity().extractRotation(this.controller1.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(this.controller1.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      this.reticle.visible = true;
      this.reticle.position.copy(hit.point);

      // Alinha o retículo com a normal da superfície atingida
      if (hit.face) {
        this.reticle.lookAt(hit.point.clone().add(hit.face.normal));
      }

      if (this.onHoverCallback) {
        this.onHoverCallback({
          intersectedObject: hit.object,
          point: hit.point,
          uv: hit.uv,
          controllerIndex: 0
        });
      }
    } else {
      this.reticle.visible = false;
      if (this.onHoverCallback) {
        this.onHoverCallback(null);
      }
    }
  }
}

