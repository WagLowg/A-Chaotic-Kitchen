import * as THREE from 'three';
import { box, cyl, sphere, mat, Label } from './util.js';

const STEEL = 0xb7bec6;
const STEEL_TOP = 0xe1e5e9;
const WOOD = 0x8e5b37;
const metal = { metalness: 0.45, roughness: 0.45 };

/**
 * Một vị trí tương tác trong quán: quầy, bếp, tủ, bàn khách...
 * Mỗi trạm (trừ tủ nguồn) có một "slot" để đặt 1 vật phẩm.
 */
export class Station {
  constructor(kind, name, w, d, opts = {}) {
    Object.assign(this, { kind, name, w, d, opts });
    this.group = new THREE.Group();
    this.group.userData.station = this;
    this.anchor = new THREE.Object3D();
    this.anchor.position.y = 0.9;
    this.group.add(this.anchor);
    this.slot = null;
    this.height = 0.9;
    this.accepts = opts.accepts || null;
    this.options = opts.options || null;
    this.update = null;
    (BUILD[kind] || BUILD.counter)(this, opts);
    this.resetState();
    this.label = new Label(name, { scale: 0.075 });
    this.label.sprite.position.y = this.height + 0.22;
    this.group.add(this.label.sprite);
  }
  resetState() {
    if (this.kind === 'stove') this.heat = 0;
    if (this.kind === 'source') this.sel = 0;
    if (this.kind === 'press') Object.assign(this, { dough: 0, dq: 0, pressure: 0, progress: 0, broken: 0, flowing: false });
    if (this.kind === 'tray') Object.assign(this, { count: 0, qsum: 0 });
    if (this.kind === 'plates') this.count = this.opts.plates ?? 5;
    if (this.kind === 'table') this.customer = null;
  }
  place(item) {
    this.slot = item;
    item.mesh.position.set(0, 0, 0);
    item.mesh.rotation.set(0, 0, 0);
    item.mesh.scale.setScalar(1);
    this.anchor.add(item.mesh);
  }
  take() {
    const it = this.slot;
    this.slot = null;
    if (it) it.mesh.removeFromParent();
    return it;
  }
}

function counterBody(st, body = STEEL, top = STEEL_TOP) {
  const b = box(st.w, 0.86, st.d, body, body === WOOD ? { roughness: 0.7 } : metal);
  b.position.y = 0.43;
  const t = box(st.w + 0.02, 0.04, st.d + 0.02, top, { metalness: 0.5, roughness: 0.3 });
  t.position.y = 0.88;
  const kick = box(st.w - 0.04, 0.08, 0.02, 0x2a2c30);
  kick.position.set(0, 0.04, st.d / 2 + 0.001);
  st.group.add(b, t, kick);
}

const BUILD = {
  counter(st, o) {
    counterBody(st, o.wood ? WOOD : STEEL);
  },
  board(st, o) {
    counterBody(st, o.wood ? WOOD : STEEL);
    const bd = box(0.55, 0.03, 0.38, 0xd2a26a);
    bd.position.y = 0.915;
    const knife = box(0.2, 0.005, 0.04, 0xdfe3e7, { metalness: 0.8, roughness: 0.2 });
    knife.position.set(0.36, 0.905, 0.1);
    const kh = box(0.09, 0.02, 0.025, 0x2b2b2b);
    kh.position.set(0.5, 0.91, 0.1);
    st.group.add(bd, knife, kh);
    st.anchor.position.y = 0.93;
  },
  sink(st) {
    counterBody(st);
    const basin = box(0.75, 0.02, 0.45, 0x5d666e, { metalness: 0.6, roughness: 0.3 });
    basin.position.y = 0.9;
    const pole = cyl(0.02, 0.02, 0.32, 0xcfd5da, 10, { metalness: 0.9, roughness: 0.2 });
    pole.position.set(0, 1.06, -st.d / 2 + 0.08);
    const spout = cyl(0.015, 0.015, 0.18, 0xcfd5da, 10, { metalness: 0.9, roughness: 0.2 });
    spout.rotation.x = Math.PI / 2;
    spout.position.set(0, 1.21, -st.d / 2 + 0.17);
    st.group.add(basin, pole, spout);
    st.anchor.position.y = 0.91;
  },
  stove(st) {
    counterBody(st, 0x3a3d42, 0x1f2124);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 8, 24), mat(0x555555, { metalness: 0.6 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.905;
    const g1 = box(0.42, 0.02, 0.025, 0x222222);
    g1.position.y = 0.915;
    const g2 = box(0.025, 0.02, 0.42, 0x222222);
    g2.position.y = 0.915;
    const flames = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.85 });
    const fm2 = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 6), i % 3 === 0 ? fm2 : fm);
      f.position.set(Math.cos(a) * 0.11, 0.035, Math.sin(a) * 0.11);
      flames.add(f);
    }
    flames.position.y = 0.905;
    const knob = new THREE.Group();
    const kb = cyl(0.045, 0.045, 0.035, 0x1b1b1b, 16);
    kb.rotation.x = Math.PI / 2;
    const ind = box(0.012, 0.06, 0.012, 0xff7a45);
    ind.position.set(0, 0.02, 0.02);
    knob.add(kb, ind);
    knob.position.set(0, 0.7, st.d / 2 + 0.02);
    const light = new THREE.PointLight(0xff8a3a, 0, 2.5, 2);
    light.position.y = 1.05;
    st.group.add(ring, g1, g2, flames, knob, light);
    st.anchor.position.y = 0.925;
    st.update = (dt, now) => {
      const h = st.heat;
      flames.visible = h > 0;
      if (h > 0) {
        flames.children.forEach((f, i) => {
          f.scale.y = 0.5 + h * 0.55 + Math.sin(now * 25 + i * 1.7) * 0.15;
          f.position.y = 0.035 * f.scale.y;
        });
      }
      knob.rotation.z = -h * 0.8;
      light.intensity = h * 1.2;
    };
  },
  source(st, o) {
    const v = o.variant;
    if (v === 'pantry') {
      st.height = 1.8;
      const wood = 0xa8794e;
      const back = box(st.w, 1.8, 0.03, wood);
      back.position.set(0, 0.9, -st.d / 2 + 0.015);
      const l = box(0.04, 1.8, st.d, wood);
      l.position.set(-st.w / 2 + 0.02, 0.9, 0);
      const r = l.clone();
      r.position.x = st.w / 2 - 0.02;
      st.group.add(back, l, r);
      [0.05, 0.62, 1.2, 1.78].forEach((y) => {
        const s = box(st.w, 0.03, st.d, wood);
        s.position.y = y;
        st.group.add(s);
      });
      for (let i = 0; i < 3; i++) {
        for (const [y, band, x0] of [[0.07, 0x3a7bd5, -0.4], [0.64, 0x3fae5a, -0.4], [1.22, 0xd64541, -0.3]]) {
          const b = box(0.16, 0.24, 0.1, 0xf6f2ea);
          b.position.set(x0 + i * 0.22, y + 0.12, 0);
          const s = box(0.162, 0.06, 0.102, band);
          s.position.set(x0 + i * 0.22, y + 0.12, 0);
          st.group.add(b, s);
        }
      }
    } else if (v === 'fridge') {
      st.height = 1.95;
      const body = box(st.w, 1.95, st.d, 0xeef1f3, { metalness: 0.3, roughness: 0.4 });
      body.position.y = 0.975;
      const seam = box(st.w - 0.04, 0.015, 0.01, 0x9aa3ab);
      seam.position.set(0, 1.3, st.d / 2 + 0.005);
      const h1 = box(0.03, 0.35, 0.04, 0x9aa3ab, { metalness: 0.8 });
      h1.position.set(st.w / 2 - 0.12, 1.55, st.d / 2 + 0.03);
      const h2 = h1.clone();
      h2.position.y = 0.95;
      const tag = new Label('❄ TỦ LẠNH', { scale: 0.06, bg: 'rgba(60,120,200,0.9)' });
      tag.sprite.position.set(0, 1.75, st.d / 2 + 0.02);
      st.group.add(body, seam, h1, h2, tag.sprite);
    } else if (v === 'freezer') {
      const body = box(st.w, 0.84, st.d, 0xf4f6f8, { roughness: 0.4 });
      body.position.y = 0.42;
      const lid = box(st.w + 0.02, 0.06, st.d + 0.02, 0xcfe3f2, { roughness: 0.3 });
      lid.position.y = 0.87;
      const h = box(0.3, 0.03, 0.04, 0x9aa3ab, { metalness: 0.8 });
      h.position.set(0, 0.8, st.d / 2 + 0.02);
      st.group.add(body, lid, h);
    } else if (v === 'spice') {
      st.height = 1.35;
      counterBody(st);
      const back = box(st.w, 0.5, 0.03, 0xa8794e);
      back.position.set(0, 1.15, -st.d / 2 + 0.03);
      const shelf = box(st.w, 0.03, 0.22, 0xa8794e);
      shelf.position.set(0, 1.2, -st.d / 2 + 0.13);
      st.group.add(back, shelf);
      const deco = [[0xf2c94c, -0.3], [0x8a4b1f, 0], [0x2b2b2b, 0.28]];
      for (const [c, x] of deco) {
        const b = cyl(0.04, 0.04, c === 0x2b2b2b ? 0.1 : 0.2, c, 12, { roughness: 0.3 });
        b.position.set(x, c === 0x2b2b2b ? 0.95 : 1.0, 0.05);
        st.group.add(b);
      }
      for (let i = 0; i < 5; i++) {
        const j = cyl(0.035, 0.035, 0.09, [0xd64541, 0xf2b134, 0x6bbf59, 0xe8e2d4, 0x8a4b1f][i], 10);
        j.position.set(-0.36 + i * 0.18, 1.26, -st.d / 2 + 0.13);
        st.group.add(j);
      }
    }
  },
  trash(st) {
    st.height = 0.75;
    const bin = cyl(0.24, 0.2, 0.7, 0x2f8f4e, 20);
    bin.position.y = 0.35;
    const lid = cyl(0.25, 0.25, 0.04, 0x247040, 20);
    lid.position.y = 0.72;
    st.group.add(bin, lid);
  },
  press(st) {
    counterBody(st);
    st.height = 1.8;
    const pm = { metalness: 0.6, roughness: 0.4 };
    const p1 = box(0.05, 0.85, 0.05, 0x6b7279, pm);
    p1.position.set(-0.3, 1.32, -0.22);
    const p2 = p1.clone();
    p2.position.x = 0.3;
    const beam = box(0.66, 0.06, 0.08, 0x6b7279, pm);
    beam.position.set(0, 1.75, -0.22);
    const arm = box(0.05, 0.05, 0.24, 0x6b7279, pm);
    arm.position.set(0, 1.75, -0.1);
    const ringArm = box(0.04, 0.04, 0.12, 0x6b7279, pm);
    ringArm.position.set(0, 1.42, -0.12);
    const pp = box(0.04, 0.33, 0.04, 0x6b7279, pm);
    pp.position.set(0, 1.585, -0.2);
    const mold = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.2, 20, 1, true),
      mat(0xa9b1b8, { ...pm, side: THREE.DoubleSide }));
    mold.position.set(0, 1.4, 0);
    mold.castShadow = true;
    const sieve = cyl(0.085, 0.085, 0.01, 0x50565c, 20);
    sieve.position.set(0, 1.3, 0);
    const plunger = new THREE.Group();
    const disk = cyl(0.093, 0.093, 0.025, 0x6b7279, 20, pm);
    const rod = cyl(0.012, 0.012, 0.3, 0x6b7279, 8, pm);
    rod.position.y = 0.15;
    const handle = box(0.26, 0.035, 0.035, 0xd64541);
    handle.position.y = 0.3;
    plunger.add(disk, rod, handle);
    const dough = cyl(0.085, 0.08, 1, 0xe7efe0, 20, { roughness: 0.3 });
    const stream = new THREE.Group();
    const sm = mat(0xe9f0e2, { transparent: true, opacity: 0.9, roughness: 0.3 });
    for (let i = 0; i < 5; i++) {
      const s = cyl(0.007, 0.007, 0.24, sm, 6);
      const a = i * 1.26;
      s.position.set(Math.cos(a) * 0.04, 1.17, Math.sin(a) * 0.04);
      stream.add(s);
    }
    st.group.add(p1, p2, beam, arm, ringArm, pp, mold, sieve, plunger, dough, stream);
    st.update = (dt, now) => {
      plunger.position.y = 1.62 - (st.pressure / 100) * 0.08 - (1 - st.dough / 6) * 0.15 * (st.dough > 0 ? 1 : 0);
      dough.visible = st.dough > 0;
      const h = 0.02 + (0.15 * st.dough) / 6;
      dough.scale.y = h;
      dough.position.y = 1.31 + h / 2;
      stream.visible = st.flowing;
      if (st.flowing) stream.children.forEach((c, i) => (c.scale.x = c.scale.z = 0.7 + 0.5 * Math.abs(Math.sin(now * 18 + i))));
    };
  },
  tray(st) {
    counterBody(st);
    const tray = box(0.82, 0.03, 0.48, 0xcfd5da, { metalness: 0.7, roughness: 0.3 });
    tray.position.y = 0.915;
    st.group.add(tray);
    const mounds = new THREE.Group();
    const m = mat(0xe9f0e2, { transparent: true, opacity: 0.92, roughness: 0.3 });
    for (let i = 0; i < 12; i++) {
      const s = sphere(0.055, m, undefined, 12, 8);
      s.scale.set(1, 0.45, 1);
      s.position.set(-0.3 + (i % 4) * 0.2, 0.945, -0.14 + Math.floor(i / 4) * 0.14);
      mounds.add(s);
    }
    st.group.add(mounds);
    st.update = () => mounds.children.forEach((c, i) => (c.visible = i < st.count));
  },
  plates(st, o) {
    counterBody(st, o.wood ? WOOD : STEEL);
    const stack = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const p = cyl(0.17, 0.13, 0.022, 0xfbfbf8, 24, { roughness: 0.3 });
      p.position.y = 0.912 + i * 0.024;
      stack.add(p);
    }
    st.group.add(stack);
    st.update = () => stack.children.forEach((c, i) => (c.visible = i < st.count));
  },
  bell(st, o) {
    counterBody(st, o.wood ? WOOD : STEEL);
    st.height = 1.3;
    const base = cyl(0.07, 0.08, 0.02, 0x2b2b2b, 16);
    base.position.y = 0.91;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(0xe0b040, { metalness: 0.9, roughness: 0.25 }));
    bell.position.y = 0.92;
    const btn = cyl(0.012, 0.012, 0.03, 0xe0b040, 8, { metalness: 0.9 });
    btn.position.y = 1.0;
    const sign = new Label('ĐÓNG CỬA', { scale: 0.07, bg: 'rgba(200,50,40,0.95)' });
    sign.sprite.position.y = 1.18;
    st.group.add(base, bell, btn, sign.sprite);
    st.update = (dt, now, game) => {
      if (game.phase === 'service') sign.set('ĐANG MỞ CỬA', '#fff', 'rgba(40,160,80,0.95)');
      else if (game.phase === 'prep') sign.set('ĐÓNG CỬA · rung chuông để mở', '#fff', 'rgba(200,50,40,0.95)');
      else sign.set('ĐÃ ĐÓNG CỬA', '#fff', 'rgba(120,120,120,0.95)');
    };
  },
  table(st) {
    st.height = 0.64;
    const top = box(0.9, 0.04, 0.7, 0xd8cfbf, { roughness: 0.5 });
    top.position.y = 0.62;
    st.group.add(top);
    for (const [x, z] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) {
      const leg = cyl(0.02, 0.02, 0.6, 0xa0a6ad, 8, { metalness: 0.7 });
      leg.position.set(x, 0.3, z);
      st.group.add(leg);
    }
    for (const [z, c] of [[0.75, 0xd83a2a], [-0.75, 0x2f6fd0]]) {
      const s = cyl(0.16, 0.2, 0.4, c, 16, { roughness: 0.5 });
      s.position.set(0, 0.2, z);
      const t = cyl(0.17, 0.17, 0.03, c, 16, { roughness: 0.5 });
      t.position.set(0, 0.415, z);
      st.group.add(s, t);
    }
    const holder = cyl(0.03, 0.03, 0.12, 0xe8c547, 10);
    holder.position.set(-0.32, 0.7, -0.2);
    const napkin = box(0.1, 0.08, 0.06, 0xffffff);
    napkin.position.set(-0.18, 0.68, -0.22);
    const sauce = cyl(0.025, 0.025, 0.12, 0xc0392b, 10);
    sauce.position.set(0.32, 0.7, -0.22);
    st.group.add(holder, napkin, sauce);
    st.anchor.position.set(0, 0.64, 0.12);
  },
};
