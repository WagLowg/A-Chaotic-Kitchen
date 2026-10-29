// Điều khiển góc nhìn thứ nhất: WASD + chuột, va chạm dạng hình tròn với các hộp AABB.
import { SPAWNS } from './game.js';

export class Player {
  constructor(camera, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.pos = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.bobT = 0;
    this.radius = 0.28;
    this.sens = 1;
    try {
      this.sens = +localStorage.getItem('ack.sens') || 1;
    } catch {}
    this.reset();
  }
  reset(spawn = 0) {
    const [x, z] = SPAWNS[spawn % SPAWNS.length];
    this.pos.x = x;
    this.pos.z = z;
    this.vel.x = this.vel.z = 0;
    this.yaw = 0;
    this.pitch = -0.28;
    this.apply(0);
  }
  look(dx, dy) {
    this.yaw -= dx * 0.0021 * this.sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0021 * this.sens));
  }
  update(dt, keys) {
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const sp = keys.ShiftLeft || keys.ShiftRight ? 5.2 : 3.3;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * r;
    let wz = -cy * f - sy * r;
    const l = Math.hypot(wx, wz);
    if (l > 0) {
      wx = (wx / l) * sp;
      wz = (wz / l) * sp;
    }
    const k = 1 - Math.exp(-dt * 12);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collide();
    this.collide();
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.bobT += dt * speed * 2.2;
    this.apply(speed);
  }
  collide() {
    const r = this.radius;
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(this.pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(this.pos.z, b.maxZ));
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        this.pos.x = cx + (dx / d) * r;
        this.pos.z = cz + (dz / d) * r;
      } else {
        // Tâm nằm trong hộp: đẩy ra theo hướng ngắn nhất
        const pen = [this.pos.x - b.minX, b.maxX - this.pos.x, this.pos.z - b.minZ, b.maxZ - this.pos.z];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) this.pos.x = b.minX - r;
        else if (i === 1) this.pos.x = b.maxX + r;
        else if (i === 2) this.pos.z = b.minZ - r;
        else this.pos.z = b.maxZ + r;
      }
    }
  }
  apply(speed) {
    const bob = Math.sin(this.bobT * 2) * 0.025 * Math.min(1, speed / 3);
    this.camera.position.set(this.pos.x, 1.62 + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
