import * as THREE from 'three';
import { mat, dyn, box, cyl, shadow, clamp } from './util.js';

export const BOTTLES = new Set(['oil', 'fishsauce', 'pepper']);
export const CONTAINERS = new Set(['pot', 'basin', 'wok', 'plate']);

const BASE_NAMES = {
  rice_flour: 'Bột gạo',
  tapioca: 'Bột năng',
  oil: 'Chai dầu ăn',
  fishsauce: 'Chai nước mắm',
  pepper: 'Lọ tiêu',
  ice: 'Đá viên',
  noodle: 'Phần bánh lọt',
};

export function defaults(type) {
  switch (type) {
    case 'shrimp': return { stage: 'raw', peel: 0, wash: 0 };
    case 'bean': return { washed: false, wash: 0 };
    case 'chive': return { washed: false, cut: false, wash: 0, chops: 0 };
    case 'noodle': return { q: 80 };
    case 'pot':
      return { rice: false, tapioca: false, water: false, mix: 0, thick: 0, burn: 0, burnt: false,
        lumpy: false, oil: false, oilMix: 0, lastStir: -99, spin: 0 };
    case 'basin': return { water: false, ice: false, noodles: 0, qsum: 0 };
    case 'wok':
      return { oil: false, shrimp: null, noodle: null, bean: null, chive: null, fishsauce: false,
        pepper: false, burn: 0, burnt: false, tosses: 0, lastToss: -99, noodleEarly: false };
    case 'plate': return { dirty: false, dish: null, wash: 0 };
    default: return {};
  }
}

// ---------- trạng thái dẫn xuất ----------
export function potStatus(p) {
  if (p.burnt) return 'Khét';
  if (!p.rice && !p.tapioca && !p.water) return 'Trống';
  if (!p.water) return 'Bột khô – cần nước';
  if (!(p.rice && p.tapioca)) return 'Thiếu bột';
  if (p.thick <= 0.5) return p.mix >= 100 ? 'Bột đã khuấy đều' : 'Bột sống – cần khuấy';
  if (p.thick < 75) return 'Đang nấu';
  if (!p.oil) return 'Bột đã chín – cần dầu';
  if (p.oilMix < 40) return 'Đang trộn dầu';
  return 'Sẵn sàng ép';
}
export const potReady = (p) => !p.burnt && p.thick >= 75 && p.oil && p.oilMix >= 40;
export const potEmpty = (p) => !p.rice && !p.tapioca && !p.water && !p.burnt;
export const canStir = (p) => !p.burnt && p.water && (p.rice || p.tapioca);
export const wokHasFood = (w) => !!(w.shrimp || w.noodle || w.bean || w.chive);
export const wokEmpty = (w) => !wokHasFood(w) && !w.oil && !w.fishsauce && !w.pepper && !w.burnt;

export function itemName(it) {
  const s = it.s;
  switch (it.type) {
    case 'shrimp': return s.stage === 'raw' ? 'Tôm tươi' : s.stage === 'peeled' ? 'Tôm đã bóc (chưa rửa)' : 'Tôm sạch';
    case 'bean': return s.washed ? 'Giá đỗ đã rửa' : 'Giá đỗ';
    case 'chive': return s.cut ? 'Hẹ cắt khúc' : s.washed ? 'Hẹ đã rửa' : 'Hẹ';
    case 'pot': return `Nồi bột (${potStatus(s).toLowerCase()})`;
    case 'basin':
      return s.noodles > 0 ? `Thau bánh lọt (${s.noodles} phần)` : s.water && s.ice ? 'Thau nước đá' : s.water ? 'Thau nước' : s.ice ? 'Thau đá' : 'Thau rỗng';
    case 'wok': return s.burnt ? 'Chảo (khét!)' : wokHasFood(s) ? 'Chảo đang xào' : s.oil ? 'Chảo có dầu' : 'Chảo';
    case 'plate': return s.dirty ? 'Đĩa bẩn' : s.dish ? (s.dish.burnt ? 'Đĩa món khét' : 'Đĩa bánh lọt xào tôm') : 'Đĩa sạch';
    default: return BASE_NAMES[it.type] || it.type;
  }
}

// ---------- hình khối dùng chung ----------
const GEO = {
  shrimp: new THREE.TorusGeometry(0.04, 0.017, 8, 14, Math.PI * 1.35),
  head: new THREE.SphereGeometry(0.022, 8, 6),
  noodle: new THREE.CapsuleGeometry(0.011, 0.045, 3, 6),
  sprout: new THREE.CylinderGeometry(0.006, 0.006, 0.07, 5),
  chiveLong: new THREE.CylinderGeometry(0.005, 0.005, 0.32, 5),
  chivePiece: new THREE.CylinderGeometry(0.006, 0.006, 0.035, 5),
  ice: new THREE.BoxGeometry(0.035, 0.035, 0.035),
};

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Rải các mảnh nhỏ trong một đường tròn. yFn(d) cho độ cao theo khoảng cách từ tâm. */
function scatter(group, geo, material, n, radius, yFn, seed, flat = true) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius;
    const m = new THREE.Mesh(geo, material);
    m.position.set(Math.cos(a) * d, yFn(d), Math.sin(a) * d);
    if (flat) m.rotation.set(0, r() * Math.PI, Math.PI / 2);
    else m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

function shrimpMesh(material, headMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GEO.shrimp, material);
  body.castShadow = true;
  g.add(body);
  if (headMat) {
    const h = new THREE.Mesh(GEO.head, headMat);
    h.position.set(0.04, 0, 0);
    h.scale.set(1.3, 1, 1);
    g.add(h);
  }
  g.rotation.x = -Math.PI / 2;
  return g;
}

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const BURNT = new THREE.Color(0x2a1a10);
function setMix(material, a, b, t, burn = 0) {
  _c1.set(a);
  _c2.set(b);
  material.color.copy(_c1).lerp(_c2, clamp(t, 0, 1));
  if (burn > 0) material.color.lerp(BURNT, clamp(burn, 0, 1));
}

function bag(it, band) {
  const b = box(0.18, 0.26, 0.1, 0xf6f2ea);
  b.position.y = 0.13;
  const s = box(0.182, 0.07, 0.102, band);
  s.position.y = 0.13;
  const top = box(0.12, 0.03, 0.06, 0xe9e2d4);
  top.position.y = 0.275;
  it.mesh.add(b, s, top);
}
function bottle(it, color, cap, r, h, opts = {}) {
  const b = cyl(r, r, h, color, 16, { roughness: 0.25, ...opts });
  b.position.y = h / 2;
  const neck = cyl(r * 0.45, r * 0.9, 0.05, color, 12, { roughness: 0.25, ...opts });
  neck.position.y = h + 0.025;
  const c = cyl(r * 0.45, r * 0.45, 0.03, cap, 12);
  c.position.y = h + 0.065;
  it.mesh.add(b, neck, c);
}
function smallBowl(it) {
  const b = cyl(0.085, 0.055, 0.045, 0xfbfbf8, 20, { roughness: 0.3 });
  b.position.y = 0.0225;
  it.mesh.add(b);
}

const wokR = 0.27;
const wokY = (d) => wokR - Math.sqrt(wokR * wokR - d * d) + 0.015;

const BUILD = {
  rice_flour: (it) => bag(it, 0x3a7bd5),
  tapioca: (it) => bag(it, 0x3fae5a),
  oil: (it) => bottle(it, 0xf2c94c, 0xd64541, 0.045, 0.22, { transparent: true, opacity: 0.85 }),
  fishsauce: (it) => bottle(it, 0x8a4b1f, 0xf2c94c, 0.04, 0.2),
  pepper(it) {
    const b = cyl(0.035, 0.035, 0.1, 0x2b2b2b);
    b.position.y = 0.05;
    const t = cyl(0.036, 0.03, 0.025, 0xcfd5da, 16, { metalness: 0.8, roughness: 0.3 });
    t.position.y = 0.112;
    it.mesh.add(b, t);
  },
  ice(it) {
    smallBowl(it);
    const m = mat(0xdff4ff, { transparent: true, opacity: 0.8, roughness: 0.1 });
    scatter(it.mesh, GEO.ice, m, 7, 0.05, () => 0.05, 11, false);
  },
  shrimp(it) {
    it.parts.m = dyn(0x9fb0b2);
    it.parts.hm = dyn(0x7d8e90);
    it.parts.list = [];
    for (let i = 0; i < 3; i++) {
      const s = shrimpMesh(it.parts.m, it.parts.hm);
      const a = i * 2.1;
      s.position.set(Math.cos(a) * 0.045, 0.018, Math.sin(a) * 0.045);
      s.rotation.z = a;
      it.mesh.add(s);
      it.parts.list.push(s);
    }
  },
  bean(it) {
    it.parts.m = dyn(0xe8e3c4);
    scatter(it.mesh, GEO.sprout, it.parts.m, 16, 0.07, () => 0.01, 7);
    scatter(it.mesh, GEO.sprout, it.parts.m, 8, 0.05, () => 0.024, 9);
  },
  chive(it) {
    it.parts.m = dyn(0x2f8f3e);
    const long = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(GEO.chiveLong, it.parts.m);
      c.rotation.z = Math.PI / 2;
      c.position.set(0, 0.008 + (i % 3) * 0.008, (i - 4) * 0.009);
      c.castShadow = true;
      long.add(c);
    }
    const band = cyl(0.03, 0.03, 0.02, 0xd64541, 10);
    band.rotation.z = Math.PI / 2;
    band.position.y = 0.012;
    long.add(band);
    const cut = scatter(new THREE.Group(), GEO.chivePiece, it.parts.m, 20, 0.08, () => 0.008, 5);
    it.parts.long = long;
    it.parts.cut = cut;
    it.mesh.add(long, cut);
  },
  noodle(it) {
    smallBowl(it);
    it.parts.m = dyn(0xe9f0e2, { transparent: true, opacity: 0.9, roughness: 0.3 });
    scatter(it.mesh, GEO.noodle, it.parts.m, 9, 0.05, () => 0.05, 3);
  },
  pot(it) {
    const g = it.mesh;
    const wall = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.2, 24, 1, true),
      mat(0x9aa3ab, { metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide })));
    wall.position.y = 0.1;
    const bottom = cyl(0.16, 0.16, 0.012, 0x8a939b, 24, { metalness: 0.75, roughness: 0.4 });
    bottom.position.y = 0.006;
    const h1 = box(0.06, 0.02, 0.03, 0x333333);
    h1.position.set(0.2, 0.17, 0);
    const h2 = h1.clone();
    h2.position.x = -0.2;
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.163, 0.16, 1, 24), dyn(0xf4f1ea));
    const pivot = new THREE.Group();
    const spoon = cyl(0.01, 0.012, 0.34, 0xb07a45, 8);
    spoon.position.set(0.07, 0.17, 0);
    spoon.rotation.z = 0.3;
    pivot.add(spoon);
    it.parts.fill = fill;
    it.parts.pivot = pivot;
    g.add(wall, bottom, h1, h2, fill, pivot);
  },
  basin(it) {
    const g = it.mesh;
    const wall = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.21, 0.13, 28, 1, true),
      mat(0x3f7fd0, { side: THREE.DoubleSide, roughness: 0.5 })));
    wall.position.y = 0.065;
    const bottom = cyl(0.21, 0.21, 0.01, 0x3672bd, 28);
    bottom.position.y = 0.005;
    const water = cyl(0.25, 0.25, 0.01, dyn(0x8cc8ff, { transparent: true, opacity: 0.55, roughness: 0.05 }), 28);
    water.position.y = 0.095;
    const ice = scatter(new THREE.Group(), GEO.ice, mat(0xeefaff, { transparent: true, opacity: 0.85, roughness: 0.1 }),
      8, 0.18, () => 0.1, 21, false);
    it.parts.noodleM = dyn(0xe9f0e2, { transparent: true, opacity: 0.9, roughness: 0.3 });
    const noodles = scatter(new THREE.Group(), GEO.noodle, it.parts.noodleM, 24, 0.18, () => 0.05, 17);
    it.parts.water = water;
    it.parts.ice = ice;
    it.parts.noodles = noodles;
    g.add(wall, bottom, water, ice, noodles);
  },
  wok(it) {
    const g = it.mesh;
    const bowl = shadow(new THREE.Mesh(
      new THREE.SphereGeometry(wokR, 28, 10, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.32),
      mat(0x2b2c30, { metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide })));
    bowl.position.y = wokR;
    const handle = cyl(0.018, 0.022, 0.26, 0x6b4428, 10);
    handle.rotation.z = Math.PI / 2 - 0.25;
    handle.position.set(0.36, 0.15, 0);
    const conn = box(0.08, 0.02, 0.03, 0x2b2c30, { metalness: 0.6 });
    conn.position.set(0.24, 0.12, 0);
    conn.rotation.z = -0.25;
    const content = new THREE.Group();
    const P = it.parts;
    P.oilM = dyn(0xe8c547, { transparent: true, opacity: 0.45, roughness: 0.05 });
    P.shrimpM = dyn(0x9fb0b2);
    P.noodleM = dyn(0xeef1e6, { roughness: 0.35 });
    P.beanM = dyn(0xeee9cf);
    P.chiveM = dyn(0x3fa34d);
    P.oil = cyl(0.13, 0.13, 0.004, P.oilM, 24);
    P.oil.position.y = 0.012;
    P.shrimp = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = shrimpMesh(P.shrimpM);
      const a = i * 1.7 + 0.4;
      const d = 0.06 + (i % 2) * 0.04;
      s.position.set(Math.cos(a) * d, wokY(d) + 0.012, Math.sin(a) * d);
      s.rotation.z = a;
      P.shrimp.add(s);
    }
    P.noodle = scatter(new THREE.Group(), GEO.noodle, P.noodleM, 18, 0.13, (d) => wokY(d) + 0.008, 31);
    P.bean = scatter(new THREE.Group(), GEO.sprout, P.beanM, 12, 0.12, (d) => wokY(d) + 0.02, 41);
    P.chive = scatter(new THREE.Group(), GEO.chivePiece, P.chiveM, 12, 0.12, (d) => wokY(d) + 0.022, 51);
    content.add(P.oil, P.shrimp, P.noodle, P.bean, P.chive);
    P.content = content;
    g.add(bowl, handle, conn, content);
  },
  plate(it) {
    const g = it.mesh;
    const p = cyl(0.17, 0.13, 0.025, 0xfbfbf8, 28, { roughness: 0.3 });
    p.position.y = 0.0125;
    const P = it.parts;
    P.noodleM = dyn(0xeee6c4, { roughness: 0.35 });
    P.shrimpM = dyn(0xff7b42);
    P.greenM = dyn(0x3fa34d);
    P.beanM = dyn(0xe4dfb8);
    const dish = new THREE.Group();
    P.dNoodle = scatter(new THREE.Group(), GEO.noodle, P.noodleM, 18, 0.1, (d) => 0.04 - d * 0.15, 61);
    P.dShrimp = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = shrimpMesh(P.shrimpM);
      const a = i * 2.1;
      s.position.set(Math.cos(a) * 0.05, 0.05, Math.sin(a) * 0.05);
      s.rotation.z = a;
      P.dShrimp.add(s);
    }
    P.dBean = scatter(new THREE.Group(), GEO.sprout, P.beanM, 8, 0.09, () => 0.045, 71);
    P.dChive = scatter(new THREE.Group(), GEO.chivePiece, P.greenM, 10, 0.09, () => 0.05, 81);
    dish.add(P.dNoodle, P.dShrimp, P.dBean, P.dChive);
    P.dish = dish;
    P.dirt = cyl(0.11, 0.11, 0.003, dyn(0x8a6b3e, { transparent: true, opacity: 0.55 }), 20);
    P.dirt.position.y = 0.027;
    g.add(p, dish, P.dirt);
  },
};

const REFRESH = {
  shrimp(it) {
    const s = it.s;
    if (s.stage === 'raw') setMix(it.parts.m, 0x9fb0b2, 0x9fb0b2, 0);
    else setMix(it.parts.m, 0xe9b9a6, 0xf4c8b6, s.stage === 'clean' ? 1 : 0);
    it.parts.list.forEach((g) => {
      const head = g.children[1];
      if (head) head.visible = s.stage === 'raw' && s.peel < 60;
    });
  },
  bean(it) {
    setMix(it.parts.m, 0xd9d3b0, 0xf6f3e2, it.s.washed ? 1 : 0);
  },
  chive(it) {
    const s = it.s;
    it.parts.long.visible = !s.cut;
    it.parts.cut.visible = s.cut;
    setMix(it.parts.m, 0x2a7a35, 0x3fb04f, s.washed ? 1 : 0);
  },
  noodle(it) {
    setMix(it.parts.m, 0xc9c2a8, 0xeef4e8, it.s.q / 100);
  },
  pot(it, now) {
    const p = it.s;
    const f = it.parts.fill;
    f.visible = p.rice || p.tapioca || p.water;
    let h = p.water ? 0.12 : p.rice && p.tapioca ? 0.05 : 0.03;
    if (p.thick > 0) h *= 1 - (Math.min(p.thick, 120) / 120) * 0.25;
    f.scale.y = h;
    f.position.y = 0.012 + h / 2;
    if (!p.water) setMix(f.material, 0xf6f3ec, 0xf6f3ec, 0, p.burn / 100);
    else if (p.thick < 1) setMix(f.material, 0xe6dcc4, 0xf7f4ec, p.mix / 100, p.burn / 100);
    else setMix(f.material, 0xf1ece0, 0xcfe0cf, p.thick / 100, (p.burn / 100) * 0.9);
    f.material.roughness = p.oil ? 0.2 : 0.6;
    it.parts.pivot.visible = now - p.lastStir < 0.4;
    it.parts.pivot.rotation.y = p.spin;
  },
  basin(it) {
    const s = it.s;
    it.parts.water.visible = s.water;
    it.parts.ice.visible = s.ice;
    const n = Math.min(24, s.noodles * 4);
    it.parts.noodles.children.forEach((c, i) => (c.visible = i < n));
    const q = s.noodles ? s.qsum / s.noodles : 80;
    setMix(it.parts.noodleM, 0xc9c2a8, 0xeef4e8, q / 100);
  },
  wok(it, now) {
    const s = it.s;
    const P = it.parts;
    const burn = s.burn / 100;
    P.oil.visible = s.oil && !s.burnt;
    P.shrimp.visible = !!s.shrimp;
    P.noodle.visible = !!s.noodle;
    P.bean.visible = !!s.bean;
    P.chive.visible = !!s.chive;
    if (s.shrimp) setMix(P.shrimpM, 0x9fb0b2, 0xff7b42, s.shrimp.cook / 80, burn);
    if (s.noodle) setMix(P.noodleM, 0xeef1e6, 0xe2c98a, s.noodle.cook / 110, burn);
    if (s.bean) setMix(P.beanM, 0xf3efd8, 0xc9c48a, s.bean.cook / 90, burn);
    if (s.chive) setMix(P.chiveM, 0x3fb04f, 0x2a6a30, s.chive.cook / 90, burn);
    const t = now - s.lastToss;
    if (t >= 0 && t < 0.35) {
      const k = Math.sin((t / 0.35) * Math.PI);
      P.content.position.y = k * 0.12;
      P.content.rotation.z = k * 0.25;
    } else {
      P.content.position.y = 0;
      P.content.rotation.z = 0;
    }
  },
  plate(it) {
    const s = it.s;
    const P = it.parts;
    P.dish.visible = !!s.dish;
    P.dirt.visible = s.dirty;
    if (s.dish) {
      const d = s.dish;
      const b = d.burnt ? 0.85 : 0;
      setMix(P.noodleM, 0xeee6c4, 0xeee6c4, 0, b);
      setMix(P.shrimpM, 0xff7b42, 0xff7b42, 0, b);
      setMix(P.greenM, 0x3fa34d, 0x3fa34d, 0, b);
      setMix(P.beanM, 0xe4dfb8, 0xe4dfb8, 0, b);
      P.dShrimp.visible = d.has?.shrimp ?? true;
      P.dBean.visible = d.has?.bean ?? true;
      P.dChive.visible = d.has?.chive ?? true;
    }
  },
};

let uid = 1;
export class Item {
  constructor(type) {
    this.id = uid++;
    this.type = type;
    this.s = defaults(type);
    this.mesh = new THREE.Group();
    this.mesh.userData.item = this;
    this.parts = {};
    (BUILD[type] || (() => {}))(this);
    this.refresh(0);
  }
  get name() {
    return itemName(this);
  }
  reset() {
    this.s = defaults(this.type);
    this.refresh(0);
  }
  refresh(now = 0) {
    const f = REFRESH[this.type];
    if (f) f(this, now);
  }
  dispose() {
    this.mesh.removeFromParent();
  }
}
