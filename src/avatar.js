// Nhân vật đầu bếp của người chơi khác (mũ đầu bếp, tạp dề màu riêng, tên trên đầu).
import * as THREE from 'three';
import { box, cyl, sphere, mat, Label } from './util.js';

export const PLAYER_COLORS = ['#ff7a45', '#3d8bd9', '#4caf6e', '#b35ad9'];

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Avatar {
  constructor(scene, name, color) {
    const g = new THREE.Group();
    const c = new THREE.Color(color).getHex();
    this.legs = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.09, 0.8, 0);
      const leg = box(0.11, 0.78, 0.12, 0x2d3142);
      leg.position.y = -0.39;
      pivot.add(leg);
      g.add(pivot);
      this.legs.push(pivot);
    }
    const torso = cyl(0.18, 0.2, 0.56, 0xf7f7f2, 14);
    torso.position.y = 1.08;
    const apron = box(0.3, 0.5, 0.03, c);
    apron.position.set(0, 0.95, 0.19);
    const head = sphere(0.13, 0xf1c9a5);
    head.position.y = 1.5;
    const eyeM = mat(0x111111);
    const e1 = sphere(0.016, eyeM, undefined, 6, 4);
    e1.position.set(-0.045, 1.52, 0.118);
    const e2 = e1.clone();
    e2.position.x = 0.045;
    const hatBand = cyl(0.12, 0.12, 0.14, 0xffffff, 14);
    hatBand.position.y = 1.66;
    const puff = sphere(0.16, 0xffffff, undefined, 14, 10);
    puff.scale.set(1, 0.6, 1);
    puff.position.y = 1.78;
    g.add(torso, apron, head, e1, e2, hatBand, puff);
    this.arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.23, 1.32, 0);
      const arm = box(0.08, 0.5, 0.09, 0xf7f7f2);
      arm.position.y = -0.25;
      const hand = sphere(0.045, 0xf1c9a5, undefined, 8, 6);
      hand.position.y = -0.52;
      pivot.add(arm, hand);
      pivot.rotation.x = -1.1;
      g.add(pivot);
      this.arms.push(pivot);
    }
    this.hand = new THREE.Object3D();
    this.hand.position.set(0, 1.12, 0.42);
    g.add(this.hand);
    this.label = new Label(name, { scale: 0.09, bg: rgba(color, 0.9) });
    this.label.sprite.position.y = 2.08;
    g.add(this.label.sprite);
    scene.add(g);
    this.group = g;
    this.held = null;
    this.target = { x: 0, z: 0, yaw: 0 };
    this.walkT = 0;
  }
  setPose(x, z, yaw) {
    this.target.x = x;
    this.target.z = z;
    this.target.yaw = yaw;
  }
  snap() {
    this.group.position.set(this.target.x, 0, this.target.z);
    this.group.rotation.y = this.target.yaw + Math.PI;
  }
  update(dt) {
    const g = this.group;
    const k = 1 - Math.exp(-dt * 14);
    const dx = this.target.x - g.position.x;
    const dz = this.target.z - g.position.z;
    g.position.x += dx * k;
    g.position.z += dz * k;
    let d = this.target.yaw + Math.PI - g.rotation.y;
    d = ((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    g.rotation.y += d * k;
    const moving = Math.hypot(dx, dz) > 0.03;
    if (moving) this.walkT += dt * 10;
    const sw = moving ? Math.sin(this.walkT) * 0.5 : 0;
    this.legs[0].rotation.x += (sw - this.legs[0].rotation.x) * k;
    this.legs[1].rotation.x += (-sw - this.legs[1].rotation.x) * k;
  }
  setVisible(v) {
    this.group.visible = v;
  }
  dispose() {
    this.group.removeFromParent();
  }
}
