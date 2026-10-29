import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Bộ sinh số ngẫu nhiên có seed – để máy Host và máy khách dựng cùng một ngoại hình. */
export function rng(seed) {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const cache = new Map();
/** Shared (cached) material – do not change its color later. */
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts }));
  }
  return cache.get(key);
}
/** Own material – safe to recolor. */
export function dyn(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts });
}

export function shadow(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}
export function box(w, h, d, color, opts) {
  return shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'object' ? color : mat(color, opts)));
}
export function cyl(rt, rb, h, color, seg = 20, opts) {
  return shadow(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'object' ? color : mat(color, opts)));
}
export function sphere(r, color, opts, ws = 16, hs = 12) {
  return shadow(new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), typeof color === 'object' ? color : mat(color, opts)));
}
export function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}
export function vnd(n) {
  return Math.round(n).toLocaleString('vi-VN') + 'đ';
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text billboard (sprite) that can be updated. */
export class Label {
  constructor(text = '', { scale = 0.2, fg = '#ffffff', bg = 'rgba(25,22,30,0.72)', weight = 600 } = {}) {
    this.scale = scale;
    this.fg = fg;
    this.bg = bg;
    this.weight = weight;
    this.canvas = document.createElement('canvas');
    this.tex = null;
    this.key = null;
    this.material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 10;
    this.set(text);
  }
  set(text, fg, bg) {
    fg = fg || this.fg;
    bg = bg || this.bg;
    const key = text + '|' + fg + '|' + bg;
    if (key === this.key) return;
    this.key = key;
    if (!text) {
      this.sprite.visible = false;
      return;
    }
    this.sprite.visible = true;
    const fs = 52;
    const pad = 18;
    const lines = String(text).split('\n');
    const c = this.canvas;
    let ctx = c.getContext('2d');
    const font = `${this.weight} ${fs}px "Be Vietnam Pro", "Segoe UI", "Segoe UI Emoji", system-ui, sans-serif`;
    ctx.font = font;
    const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2;
    const h = Math.ceil(lines.length * fs * 1.25 - fs * 0.25) + pad * 2;
    c.width = w;
    c.height = h;
    ctx = c.getContext('2d');
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, w, h, Math.min(28, h / 2));
    ctx.fill();
    ctx.fillStyle = fg;
    lines.forEach((l, i) => ctx.fillText(l, w / 2, pad + fs * 0.5 + i * fs * 1.25));
    if (this.tex) this.tex.dispose();
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.material.map = this.tex;
    this.material.needsUpdate = true;
    this.sprite.scale.set((this.scale * w) / fs, (this.scale * h) / fs, 1);
  }
}
