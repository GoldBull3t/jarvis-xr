/**
 * Núcleo Holográfico 3D Animado do JARVIS (Three.js)
 */
import * as THREE from 'three';

export class JarvisCoreVisualizer {
  public group: THREE.Group;
  private innerCore: THREE.Mesh;
  private wireframeShell: THREE.Mesh;
  private ring1: THREE.Mesh;
  private ring2: THREE.Mesh;
  private ring3: THREE.Mesh;
  private pointLight: THREE.PointLight;
  private particles: THREE.Points;

  constructor() {
    this.group = new THREE.Group();

    // 1. Esfera interior brilhante
    const coreGeo = new THREE.SphereGeometry(0.35, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.85
    });
    this.innerCore = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this.innerCore);

    // 2. Concha geodésica exterior (wireframe)
    const shellGeo = new THREE.IcosahedronGeometry(0.55, 2);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x0077ff,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    this.wireframeShell = new THREE.Mesh(shellGeo, shellMat);
    this.group.add(this.wireframeShell);

    // 3. Anéis concêntricos com rotações independentes
    this.ring1 = this.createRing(0.75, 0.015, 0x00e5ff, 0.7);
    this.ring2 = this.createRing(0.95, 0.012, 0x0077ff, 0.5);
    this.ring3 = this.createRing(1.15, 0.008, 0x00ffff, 0.3);

    this.group.add(this.ring1);
    this.group.add(this.ring2);
    this.group.add(this.ring3);

    // 4. Luz pontual reativa ao pulsar do núcleo
    this.pointLight = new THREE.PointLight(0x00e5ff, 2, 6);
    this.group.add(this.pointLight);

    // 5. Nuvem orbital de partículas
    this.particles = this.createParticles(120);
    this.group.add(this.particles);

    // Posição inicial no espaço 3D (ao centro e ligeiramente recuado)
    this.group.position.set(0, 0, -2);
  }

  private createRing(radius: number, tube: number, color: number, opacity: number): THREE.Mesh {
    const geo = new THREE.TorusGeometry(radius, tube, 8, 64);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      wireframe: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private createParticles(count: number): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const dist = 0.8 + Math.random() * 0.7;

      positions[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = dist * Math.cos(phi);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00e5ff,
      size: 0.035,
      transparent: true,
      opacity: 0.6
    });

    return new THREE.Points(geo, mat);
  }

  /**
   * Atualiza a animação a cada frame
   */
  public update(delta: number, elapsed: number) {
    // Rotação dos anéis em eixos diferentes
    this.ring1.rotation.z += delta * 0.8;
    this.ring1.rotation.y += delta * 0.3;

    this.ring2.rotation.z -= delta * 0.6;
    this.ring2.rotation.x += delta * 0.4;

    this.ring3.rotation.y += delta * 0.5;
    this.ring3.rotation.z += delta * 0.2;

    // Rotação da concha geodésica
    this.wireframeShell.rotation.y += delta * 0.25;
    this.wireframeShell.rotation.x += delta * 0.15;

    // Rotação das partículas
    this.particles.rotation.y += delta * 0.1;

    // Pulso suave senoidal de luz e escala
    const pulse = 1 + Math.sin(elapsed * 2.5) * 0.08;
    this.innerCore.scale.set(pulse, pulse, pulse);
    this.pointLight.intensity = 1.8 + Math.sin(elapsed * 2.5) * 0.6;
  }

  /**
   * Modifica a cor do núcleo conforme o estado (Normal, Aviso, Erro, A Ouvir)
   */
  public setStatus(status: 'normal' | 'warning' | 'error' | 'listening') {
    let colorHex = 0x00e5ff;
    if (status === 'warning') colorHex = 0xffb700;
    if (status === 'error') colorHex = 0xff3366;
    if (status === 'listening') colorHex = 0x00ff9d;

    (this.innerCore.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
    this.pointLight.color.setHex(colorHex);
  }
}

