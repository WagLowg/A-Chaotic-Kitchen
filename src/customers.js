import * as THREE from 'three';
import { box, cyl, sphere, mat, Label, pick, rand, clamp, rng } from './util.js';
import { sfx } from './audio.js';

const SHIRTS = [0xe85d4a, 0x3d8bd9, 0x4caf6e, 0xf2b134, 0x9b59b6, 0xff8fb1, 0x2ec4b6, 0xffffff];
const SKINS = [0xf1c9a5, 0xe0ac82, 0xc68b59, 0xf5d6b8];
const PANTS = [0x2d3142, 0x4a4e69, 0x6b4f3a, 0x1d3557, 0x3c3c3c];
const HAIR = [0x1b1b1b, 0x3b2a20, 0x5a3b28, 0x2a2a2a];

const OUTSIDE = new THREE.Vector3(4.3, 0, 9.8);
const DOOR = new THREE.Vector3(4.3, 0, 7.2);
const AISLE_X = 2.7;
const BUBBLE = { scale: 0.14, fg: '#222', bg: 'rgba(255,255,255,0.92)' };

/** Dựng người khách. Cùng `seed` → cùng ngoại hình trên mọi máy. */
export function buildPerson(seed) {
  const r = rng(seed);
  const pk = (a) => a[Math.floor(r() * a.length)];
  const group = new THREE.Group();
  const body = new THREE.Group();
  const shirt = pk(SHIRTS);
  const skin = pk(SKINS);
  const pants = pk(PANTS);
  const torso = cyl(0.17, 0.19, 0.55, shirt, 12);
  torso.position.y = 1.08;
  const head = sphere(0.13, skin);
  head.position.y = 1.5;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.137, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(pk(HAIR)));
  hair.position.y = 1.52;
  hair.rotation.x = -0.25;
  const eyeM = mat(0x111111);
  const e1 = sphere(0.016, eyeM, undefined, 6, 4);
  e1.position.set(-0.045, 1.52, 0.118);
  const e2 = e1.clone();
  e2.position.x = 0.045;
  body.add(torso, head, hair, e1, e2);
  if (r() < 0.3) {
    // Nón lá
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.17, 18), mat(0xe8d39a, { roughness: 0.9 }));
    hat.position.y = 1.68;
    hat.castShadow = true;
    body.add(hat);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.23, 1.32, 0);
    const arm = box(0.08, 0.5, 0.09, shirt);
    arm.position.y = -0.25;
    const hand = sphere(0.045, skin, undefined, 8, 6);
    hand.position.y = -0.52;
    pivot.add(arm, hand);
    body.add(pivot);
    arms.push(pivot);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.09, 0.8, 0);
    const leg = box(0.11, 0.78, 0.12, pants);
    leg.position.y = -0.39;
    pivot.add(leg);
    body.add(pivot);
    legs.push(pivot);
  }
  group.add(body);
  return { group, body, arms, legs };
}

function poseSit(o) {
  o.p.legs.forEach((l) => (l.rotation.x = -Math.PI / 2));
  o.p.arms.forEach((a) => (a.rotation.x = -0.5));
  o.p.body.position.y = -0.36;
  o.bubble.sprite.position.y = 1.6;
  o.sitting = true;
}
function poseStand(o) {
  o.p.legs.forEach((l) => (l.rotation.x = 0));
  o.p.arms.forEach((a) => (a.rotation.x = 0));
  o.p.body.position.y = 0;
  o.bubble.sprite.position.y = 1.95;
  o.sitting = false;
}
function walkAnim(o, dt) {
  o.walkT += dt * 9;
  const sw = Math.sin(o.walkT) * 0.5;
  o.p.legs[0].rotation.x = sw;
  o.p.legs[1].rotation.x = -sw;
  o.p.arms[0].rotation.x = -sw * 0.7;
  o.p.arms[1].rotation.x = sw * 0.7;
}

let nextCid = 1;

/** Khách thật – chỉ chạy trên máy Host (hoặc khi chơi 1 mình). */
class Customer {
  constructor(mgr, table) {
    this.id = nextCid++;
    this.seed = Math.floor(Math.random() * 2147483000) + 1;
    this.mgr = mgr;
    this.game = mgr.game;
    this.table = table;
    table.customer = this;
    this.order = { noPepper: Math.random() < 0.3 };
    this.patienceMax = mgr.patienceFor();
    this.patience = this.patienceMax;
    this.p = buildPerson(this.seed);
    this.mesh = this.p.group;
    this.mesh.position.copy(OUTSIDE);
    const aisleZ = table.tz + 1.35;
    this.path = [DOOR.clone(), new THREE.Vector3(AISLE_X, 0, aisleZ), new THREE.Vector3(table.tx, 0, aisleZ), new THREE.Vector3(table.tx, 0, table.tz + 0.75)];
    this.state = 'arriving';
    this.sitting = false;
    this.walkT = Math.random() * 10;
    this.bubble = new Label('', BUBBLE);
    this.mesh.add(this.bubble.sprite);
    poseStand(this);
    this.setBubble('🙂');
    mgr.scene.add(this.mesh);
  }
  setBubble(t) {
    this.bubbleText = t;
    this.bubble.set(t);
  }

  walk(dt) {
    const tgt = this.path[0];
    if (!tgt) return true;
    const pos = this.mesh.position;
    const dx = tgt.x - pos.x;
    const dz = tgt.z - pos.z;
    const d = Math.hypot(dx, dz);
    const step = 1.5 * dt;
    if (d <= step) {
      pos.x = tgt.x;
      pos.z = tgt.z;
      this.path.shift();
    } else {
      pos.x += (dx / d) * step;
      pos.z += (dz / d) * step;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    walkAnim(this, dt);
    return this.path.length === 0;
  }

  update(dt) {
    switch (this.state) {
      case 'arriving':
        if (this.walk(dt)) {
          this.mesh.rotation.y = Math.PI;
          poseSit(this);
          this.state = 'waiting';
          sfx.customer();
          this.game.toast(`Khách mới ở ${this.table.name}${this.order.noPepper ? ' – dặn KHÔNG TIÊU' : ''}`);
        }
        break;
      case 'waiting': {
        this.patience -= dt;
        const r = this.patience / this.patienceMax;
        const note = this.order.noPepper ? '\nkhông tiêu' : '';
        this.setBubble(r > 0.5 ? `🍤${note}` : r > 0.25 ? `😐${note}` : `😠${note}`);
        if (this.patience <= 0) this.leave(true);
        break;
      }
      case 'eating':
        this.eatT -= dt;
        this.p.arms[1].rotation.x = -0.9 + Math.sin(this.eatT * 6) * 0.35;
        if (this.eatT <= 0) {
          this.plate.s.dish = null;
          this.plate.s.dirty = true;
          this.plate.refresh();
          this.game.pay(this);
          this.leave(false);
        }
        break;
      case 'leaving':
        if (this.walk(dt)) this.state = 'gone';
        break;
    }
  }

  serve(plate) {
    const d = plate.s.dish;
    this.plate = plate;
    this.dish = d;
    this.waitRatio = this.patience / this.patienceMax;
    if (d.burnt || d.q < 25) {
      plate.s.dish = null;
      plate.s.dirty = true;
      plate.refresh();
      this.game.onRefuse(this);
      this.leave(true, false);
      return;
    }
    this.state = 'eating';
    this.eatT = rand(7, 10);
    this.setBubble('😋');
    sfx.done();
  }

  leave(angry, countWalkout = true) {
    if (this.table.customer === this) this.table.customer = null;
    poseStand(this);
    const t = this.table;
    const aisleZ = t.tz + 1.35;
    this.path = [new THREE.Vector3(t.tx, 0, aisleZ), new THREE.Vector3(AISLE_X, 0, aisleZ), DOOR.clone(), OUTSIDE.clone()];
    this.state = 'leaving';
    this.setBubble(angry ? '😡' : '😊');
    if (angry && countWalkout) this.game.onWalkout(this);
  }
}

/** Bản sao khách trên máy người chơi khác – chỉ hiển thị theo dữ liệu từ Host. */
export class CustomerView {
  constructor(scene, s, tables) {
    this.id = s.id;
    this.p = buildPerson(s.seed);
    this.mesh = this.p.group;
    this.bubble = new Label('', BUBBLE);
    this.mesh.add(this.bubble.sprite);
    this.mesh.position.set(s.x, 0, s.z);
    this.walkT = Math.random() * 10;
    this.sitting = false;
    this.order = { noPepper: s.np };
    poseStand(this);
    scene.add(this.mesh);
    this.apply(s, tables);
  }
  apply(s, tables) {
    this.state = s.st;
    this.table = tables[s.ti];
    this.patience = s.pa;
    this.patienceMax = s.pm;
    this.order.noPepper = s.np;
    this.tx = s.x;
    this.tz = s.z;
    this.mesh.rotation.y = s.ry;
    if (s.sit !== this.sitting) (s.sit ? poseSit : poseStand)(this);
    this.bubble.set(s.b);
  }
  update(dt) {
    const pos = this.mesh.position;
    const dx = this.tx - pos.x;
    const dz = this.tz - pos.z;
    const k = 1 - Math.exp(-dt * 12);
    pos.x += dx * k;
    pos.z += dz * k;
    if (!this.sitting && Math.hypot(dx, dz) > 0.01) walkAnim(this, dt);
    if (this.state === 'eating') this.p.arms[1].rotation.x = -0.9 + Math.sin(performance.now() / 160) * 0.35;
  }
  dispose() {
    this.mesh.removeFromParent();
  }
}

export class CustomerManager {
  constructor(scene, game, tables) {
    this.scene = scene;
    this.game = game;
    this.tables = tables;
    this.list = [];
    this.spawnT = 6;
  }
  reset() {
    this.list.forEach((c) => c.mesh.removeFromParent());
    this.list = [];
    this.tables.forEach((t) => (t.customer = null));
    this.spawnT = 6;
  }
  patienceFor() {
    // Đông người chơi thì khách khó tính hơn một chút
    const extra = Math.max(0, this.game.onlineCount() - 1);
    // Ngày đầu khách rất kiên nhẫn (3 phút), khó dần theo ngày
    return clamp(190 - this.game.day * 10 - extra * 8, 90, 180);
  }
  interval() {
    const g = this.game;
    const crowd = 1 + Math.max(0, g.onlineCount() - 1) * 0.35; // nhiều người → nhiều khách hơn
    const easy = Math.max(0, 3 - g.day) * 12; // ngày 1–2 khách đến thưa hơn
    return (clamp(55 + easy - g.rep * 0.15 - g.day * 2.5, 20, 80) / crowd) * rand(0.8, 1.2);
  }
  activeCount() {
    return this.list.length;
  }
  update(dt) {
    if (this.game.phase === 'service') {
      this.spawnT -= dt;
      if (this.spawnT <= 0) this.spawnT = this.trySpawn() ? this.interval() : 4;
    }
    for (const c of this.list) c.update(dt);
    this.list = this.list.filter((c) => {
      if (c.state === 'gone') {
        c.mesh.removeFromParent();
        return false;
      }
      return true;
    });
  }
  trySpawn() {
    // Bàn còn đĩa bẩn thì khách không ngồi – phải dọn bàn!
    const free = this.tables.filter((t) => !t.customer && !t.slot);
    if (!free.length) return false;
    this.list.push(new Customer(this, pick(free)));
    return true;
  }
}
