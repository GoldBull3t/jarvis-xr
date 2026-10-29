/**
 * Gestor de WebXR, Controladores Meta Quest Touch Plus e Hand Tracking (Three.js)
 * Otimizado para Meta Quest 3S: Gatilho Frontal (Select/Click), Gatilho Lateral (Squeeze/Grab),
 * Feedback Háptico e Raios Repulsores Holográficos Tony Stark.
 */
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import type { HeadsetTelemetry } from '../types';

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

  // Raycasting e Apontadores Visuais Repulsores
  private raycaster: THREE.Raycaster;
  private tempMatrix: THREE.Matrix4;
  private rayLine1: THREE.Mesh;
  private rayLine2: THREE.Mesh;
  private reticle: THREE.Mesh;

  // Alvos interativos na cena (Painéis 3D)
  private interactiveObjects: THREE.Object3D[] = [];
  private interactiveObjectsProvider?: () => THREE.Object3D[];

  // Telemetria do Headset & Comandos
  private currentFps: number = 72;
  private currentFrameTimeMs: number = 13.8;
  private headsetBattery: number | null = null;
  private headsetIsCharging: boolean | null = null;
  private controllerBatteryLeft: number | null = null;
  private controllerBatteryRight: number | null = null;

  // Callbacks de interação
  public onSelectCallback?: (event: XRInteractionEvent) => void;
  public onSelectEndCallback?: (controllerIndex: number) => void;
  public onSqueezeStartCallback?: (event: XRInteractionEvent) => void;
  public onSqueezeEndCallback?: (controllerIndex: number) => void;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();

    // 1. Configurar Feixes Repulsores Holográficos (Laser Pointers Stark)
    this.rayLine1 = this.createRayBeam();
    this.rayLine2 = this.createRayBeam();

    // 2. Retículo / Cursor no Ponto de Contacto
    const reticleGeo = new THREE.RingGeometry(0.012, 0.024, 32);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: false
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

    // 5. Registar Eventos de Disparo e Manipulação Tátil
    this.setupSelectEvents();
    this.initBatteryMonitoring();
  }

  private initBatteryMonitoring() {
    try {
      if ('getBattery' in navigator && typeof (navigator as any).getBattery === 'function') {
        (navigator as any).getBattery().then((battery: any) => {
          this.headsetBattery = Math.round(battery.level * 100);
          this.headsetIsCharging = battery.charging;
          battery.addEventListener('levelchange', () => {
            this.headsetBattery = Math.round(battery.level * 100);
          });
          battery.addEventListener('chargingchange', () => {
            this.headsetIsCharging = battery.charging;
          });
        }).catch(() => {});
      }
    } catch {}
  }

  /**
   * Cria um feixe laser cilíndrico repulsor com espessura real e visual Stark
   */
  private createRayBeam(): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.0015, 0.0035, 1, 12);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, -0.5); // Extensão a partir da ponta do comando para -Z

    const material = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(1, 1, 2.5); // Comprimento padrão de 2.5 metros
    return mesh;
  }

  private setupSelectEvents() {
    // Gestão dinâmica de visibilidade de lasers
    this.controller1.addEventListener('connected', (event: any) => {
      this.rayLine1.visible = event.data?.targetRayMode !== 'screen';
    });
    this.controller1.addEventListener('disconnected', () => {
      this.rayLine1.visible = false;
    });

    this.controller2.addEventListener('connected', (event: any) => {
      this.rayLine2.visible = event.data?.targetRayMode !== 'screen';
    });
    this.controller2.addEventListener('disconnected', () => {
      this.rayLine2.visible = false;
    });

    // Controlador 0: Gatilho Frontal (Trigger / Select) para cliques
    this.controller1.addEventListener('selectstart', () => {
      this.handleSelect(0);
    });
    this.controller1.addEventListener('selectend', () => {
      if (this.onSelectEndCallback) this.onSelectEndCallback(0);
    });

    // Controlador 0: Gatilho Lateral (Squeeze / Grip) para agarrar painéis no espaço
    this.controller1.addEventListener('squeezestart', () => {
      this.handleSqueezeStart(0);
    });
    this.controller1.addEventListener('squeezeend', () => {
      if (this.onSqueezeEndCallback) this.onSqueezeEndCallback(0);
    });

    // Controlador 1: Gatilho Frontal (Trigger / Select) para cliques
    this.controller2.addEventListener('selectstart', () => {
      this.handleSelect(1);
    });
    this.controller2.addEventListener('selectend', () => {
      if (this.onSelectEndCallback) this.onSelectEndCallback(1);
    });

    // Controlador 1: Gatilho Lateral (Squeeze / Grip) para agarrar painéis no espaço
    this.controller2.addEventListener('squeezestart', () => {
      this.handleSqueezeStart(1);
    });
    this.controller2.addEventListener('squeezeend', () => {
      if (this.onSqueezeEndCallback) this.onSqueezeEndCallback(1);
    });
  }

  private handleSqueezeStart(controllerIndex: number) {
    const hit = this.raycastController(controllerIndex);
    if (hit) {
      this.triggerHaptic(controllerIndex, 0.8, 70);
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

  private handleSelect(controllerIndex: number) {
    const hit = this.raycastController(controllerIndex);
    if (hit) {
      this.triggerHaptic(controllerIndex, 0.6, 45);
      if (this.onSelectCallback) {
        this.onSelectCallback({
          intersectedObject: hit.object,
          point: hit.point,
          uv: hit.uv,
          controllerIndex
        });
      }
    }
  }

  /**
   * Executa raycast a partir da ponta do comando especificado
   */
  private raycastController(controllerIndex: number): THREE.Intersection | null {
    const controller = controllerIndex === 0 ? this.controller1 : this.controller2;
    if (!controller) return null;

    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix).normalize();

    const targets = this.getInteractiveTargets();
    if (!targets || targets.length === 0) return null;

    // Intersecta os planos interativos dos painéis (não recursivo para garantir ID e UV)
    const intersects = this.raycaster.intersectObjects(targets, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  public getControllerRay(controllerIndex: number): { origin: THREE.Vector3; direction: THREE.Vector3 } {
    const controller = controllerIndex === 0 ? this.controller1 : this.controller2;
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(this.tempMatrix).normalize();
    return { origin, direction };
  }

  public getController(controllerIndex: number): THREE.XRTargetRaySpace {
    return controllerIndex === 0 ? this.controller1 : this.controller2;
  }

  /**
   * Feedback háptico de vibração tátil nos comandos Meta Quest Touch Plus
   */
  public triggerHaptic(controllerIndex: number = 0, intensity: number = 0.5, durationMs: number = 40) {
    const session = this.renderer.xr.getSession();
    if (!session || !session.inputSources) return;

    // Tenta primeiro o comando correspondente ao índice
    const source = session.inputSources[controllerIndex];
    if (source?.gamepad?.hapticActuators && source.gamepad.hapticActuators.length > 0) {
      try {
        source.gamepad.hapticActuators[0].pulse(intensity, durationMs);
        return;
      } catch {}
    }

    // Fallback: faz pulsar qualquer comando ativo que possua atuadores de vibração
    for (const s of session.inputSources) {
      if (s.gamepad?.hapticActuators && s.gamepad.hapticActuators.length > 0) {
        try {
          s.gamepad.hapticActuators[0].pulse(intensity, durationMs);
          break;
        } catch {}
      }
    }
  }

  /**
   * Regista um fornecedor dinâmico dos painéis interativos na cena
   */
  public setInteractiveObjectsProvider(provider: () => THREE.Object3D[]) {
    this.interactiveObjectsProvider = provider;
  }

  /**
   * Define a lista estática de objetos 3D que podem ser apontados e clicados
   */
  public setInteractiveObjects(objects: THREE.Object3D[]) {
    this.interactiveObjects = objects;
  }

  public getInteractiveTargets(): THREE.Object3D[] {
    if (this.interactiveObjectsProvider) {
      return this.interactiveObjectsProvider();
    }
    return this.interactiveObjects;
  }

  /**
   * Atualização contínua por frame (executada no render loop XR)
   * Suporta apontar, retículo e redimensionamento dinâmico do feixe em ambos os comandos
   */
  public update(delta: number = 0.016) {
    if (delta > 0) {
      const instantFps = 1 / delta;
      this.currentFps = Math.round(this.currentFps * 0.9 + instantFps * 0.1);
      this.currentFrameTimeMs = Math.round(delta * 1000);
    }

    if (!this.renderer.xr.isPresenting) {
      this.reticle.visible = false;
      return;
    }

    // Leitura de telemetria dos comandos Touch Plus
    const session = this.renderer.xr.getSession();
    if (session && session.inputSources) {
      for (const source of session.inputSources) {
        const bat = (source as any).gamepad?.battery ?? (source as any).battery;
        const batVal = typeof bat === 'number' ? Math.round(bat * 100) : (bat?.level ? Math.round(bat.level * 100) : null);
        if (batVal !== null) {
          if (source.handedness === 'left') this.controllerBatteryLeft = batVal;
          if (source.handedness === 'right') this.controllerBatteryRight = batVal;
        }
      }
    }

    const hit1 = this.raycastController(0);
    const hit2 = this.raycastController(1);

    // Ajusta o alcance visual dos feixes repulsores para parar na superfície do painel
    if (hit1) {
      this.rayLine1.scale.z = Math.max(0.1, hit1.distance);
    } else {
      this.rayLine1.scale.z = 2.5;
    }

    if (hit2) {
      this.rayLine2.scale.z = Math.max(0.1, hit2.distance);
    } else {
      this.rayLine2.scale.z = 2.5;
    }

    // O retículo segue o comando que estiver a apontar
    const hit = hit1 || hit2;

    if (hit) {
      this.reticle.visible = true;
      this.reticle.position.copy(hit.point);

      if (hit.face) {
        // Afasta o retículo 3mm da superfície ao longo da normal para eliminar Z-fighting
        this.reticle.position.addScaledVector(hit.face.normal, 0.003);
        this.reticle.lookAt(this.reticle.position.clone().add(hit.face.normal));
      }
    } else {
      this.reticle.visible = false;
    }
  }

  public getHeadsetTelemetry(): HeadsetTelemetry {
    return {
      fps: this.currentFps,
      frame_time_ms: this.currentFrameTimeMs,
      battery_level: this.headsetBattery,
      is_charging: this.headsetIsCharging,
      controller_battery_left: this.controllerBatteryLeft,
      controller_battery_right: this.controllerBatteryRight
    };
  }
}
