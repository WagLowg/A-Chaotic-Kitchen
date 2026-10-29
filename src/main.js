import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { getInteraction, getAction, getScroll } from './interact.js';
import { tickStove, tickPress } from './recipes.js';
import { wokHasFood } from './items.js';
import { Net } from './net.js';
import { HostSession, ClientSession } from './multiplayer.js';
import { nextStep, GuideArrow } from './guide.js';
import * as audio from './audio.js';

// ---------- Khởi tạo ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc7e6);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 80);
scene.add(camera);

const world = buildWorld(scene);
const holder = new THREE.Group(); // vật đang cầm, gắn trước camera
holder.position.set(0.32, -0.32, -0.62);
camera.add(holder);

const game = new Game(scene, world, holder);
const player = new Player(camera, world.colliders);
const hud = new HUD(game);
game.hud = hud;

// Chế độ chơi: 'solo' | 'host' | 'client'
const net = new Net();
const mp = { mode: 'solo', host: null, client: null };
const isClient = () => mp.mode === 'client';
window.__ack = { game, world, player, camera, scene, mp, net }; // tiện debug trong console

// ---------- Cài đặt: độ nhạy chuột, hướng dẫn ----------
const guideArrow = new GuideArrow(scene);
let guideOn = true;
try {
  guideOn = localStorage.getItem('ack.guide') !== '0';
} catch {}
function syncSettings() {
  document.querySelectorAll('.opt-sens').forEach((el) => (el.value = String(player.sens)));
  document.querySelectorAll('.sens-val').forEach((el) => (el.textContent = player.sens.toFixed(1)));
  document.querySelectorAll('.opt-guide').forEach((el) => (el.checked = guideOn));
}
function setGuide(on) {
  guideOn = on;
  try {
    localStorage.setItem('ack.guide', on ? '1' : '0');
  } catch {}
  syncSettings();
  guideT = 0;
}
document.querySelectorAll('.opt-sens').forEach((el) =>
  el.addEventListener('input', () => {
    player.sens = +el.value;
    try {
      localStorage.setItem('ack.sens', el.value);
    } catch {}
    syncSettings();
  }));
document.querySelectorAll('.opt-guide').forEach((el) => el.addEventListener('change', () => setGuide(el.checked)));
syncSettings();
let guideT = 0;
let guideStep = null;
let guideText = '';

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Mở phòng / vào phòng ----------
hud.onBeforeShop = async (online, name) => {
  game.local.name = name;
  if (!online || mp.mode !== 'solo') return;
  try {
    await net.connect();
    net.send({ t: 'create' });
    const m = await net.waitFor(['created']);
    mp.mode = 'host';
    mp.host = new HostSession({ net, game, world, scene, hud, code: m.code });
    hud.setRoom(m.code, m.ips, m.port);
    net.onClose = () => {
      hud.toast('Mất kết nối máy chủ – bạn bè không còn thấy quán', 'bad');
    };
  } catch (e) {
    hud.toast(`Không mở được phòng online (${e.message}) – chơi 1 mình`, 'warn');
  }
};

hud.onJoin = async (code, name) => {
  try {
    await net.connect();
    net.send({ t: 'join', code, name });
    const m = await net.waitFor(['joined', 'error']);
    if (m.t === 'error') {
      net.ws.close();
      return m.msg;
    }
    mp.mode = 'client';
    mp.client = new ClientSession({
      net, game, world, scene, hud, holder, player, myId: m.id, name,
      onEnterKitchen: () => {
        hud.showPause(!locked);
        document.getElementById('pause-title').textContent = 'Vào bếp thôi!';
      },
    });
    net.onClose = () => {
      alert('Mất kết nối với phòng chơi.');
      location.href = location.pathname;
    };
    hud.setRoom(m.code);
    hud.showWaiting('Đang vào quán…', 'Đang nhận dữ liệu từ chủ quán.');
    return null;
  } catch (e) {
    return e.message || 'Không kết nối được';
  }
};

hud.onQuit = () => {
  if (mp.mode === 'solo') return false;
  if (mp.mode === 'host' && !confirm('Thoát sẽ đóng phòng của cả nhóm. Ngày đang chơi sẽ không được lưu. Thoát?')) return true;
  location.href = location.pathname;
  return true;
};

// ---------- Khoá chuột ----------
let locked = false;
let freeMouse = false; // fallback khi trình duyệt không cho khoá chuột
let skipMoves = 0; // bỏ vài sự kiện chuột đầu tiên sau khi khoá (thường bị nhảy)
function lock() {
  audio.initAudio();
  hud.showPause(false);
  if (!canvas.requestPointerLock) {
    freeMouse = true;
    return;
  }
  const fallback = () => {
    try {
      const r2 = canvas.requestPointerLock();
      if (r2 && r2.catch) r2.catch(() => (freeMouse = true));
    } catch {
      freeMouse = true;
    }
  };
  try {
    // unadjustedMovement = đọc chuột "thô", tránh lỗi Chrome/Windows làm camera giật mạnh khi xoay
    const r = canvas.requestPointerLock({ unadjustedMovement: true });
    if (r && r.catch) r.catch(fallback);
  } catch {
    fallback();
  }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) {
    skipMoves = 2;
    freeMouse = false;
    hud.showPause(false);
    document.getElementById('pause-title').textContent = mp.mode === 'solo' ? 'Tạm dừng' : 'Đang chơi online (quán vẫn chạy!)';
  } else if (game.isPlaying()) {
    document.getElementById('pause-title').textContent = mp.mode === 'solo' ? 'Tạm dừng' : 'Đang chơi online (quán vẫn chạy!)';
    hud.showPause(true);
    endActive();
  }
});
document.addEventListener('pointerlockerror', () => {
  freeMouse = true;
  hud.showPause(false);
});
canvas.addEventListener('click', () => {
  if (game.isPlaying() && !locked) lock();
});
hud.onResume = lock;
hud.onStartDay = () => {
  player.reset(0);
  lock();
};

const pauseHidden = () => document.getElementById('pause').classList.contains('hidden');
/** Người chơi trên máy này có đang điều khiển được không. */
const inputOn = () => game.isPlaying() && (locked || freeMouse) && pauseHidden();
/** Máy này có chạy mô phỏng quán không (chỉ Host / chơi 1 mình; online thì không dừng khi mở menu). */
const simOn = () => !isClient() && game.isPlaying() && (mp.mode === 'host' || inputOn());

// ---------- Nhập liệu ----------
const keys = {};
let target = null;
let active = null; // thao tác chuột trái đang giữ: { a, st }
let stirPx = 0;
let stirAngle = 0;
let stirSend = 0;
let stirSendT = 0;
const me = () => game.actor(game.local);

function endActive() {
  if (!active) return;
  if (active.a.mode === 'stir') hud.showStir(false);
  if (isClient()) net.send({ t: 'lmb', down: false });
  active = null;
}
function doInteract() {
  if (!target) return;
  const it = getInteraction(me(), target);
  if (!it?.run) {
    if (it?.text) hud.flash();
    return;
  }
  endActive();
  if (isClient()) net.send({ t: 'e', st: target.index });
  else it.run();
}
function doScroll(dir) {
  if (!target) return;
  const s = getScroll(me(), target);
  if (!s) return;
  if (isClient()) net.send({ t: 'scroll', st: target.index, dir });
  else s.run(dir);
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Tab') {
    e.preventDefault();
    if (game.isPlaying()) hud.toggleRecipe();
    return;
  }
  keys[e.code] = true;
  if (e.code === 'KeyH' && !e.repeat && game.isPlaying()) {
    setGuide(!guideOn);
    hud.toast(guideOn ? 'Đã bật hướng dẫn từng bước' : 'Đã tắt hướng dẫn (bấm H để bật lại)');
    return;
  }
  if (!inputOn()) return;
  if (e.code === 'KeyE' && !e.repeat) doInteract();
  if (e.code === 'KeyZ') doScroll(-1);
  if (e.code === 'KeyX') doScroll(1);
});
addEventListener('keyup', (e) => (keys[e.code] = false));
addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  endActive();
});

addEventListener('mousedown', (e) => {
  if (!inputOn() || e.button !== 0 || !target) return;
  const a = getAction(me(), target);
  if (!a || !a.mode) return;
  if (isClient()) net.send({ t: 'lmb', st: target.index, down: true });
  if (a.mode === 'click') {
    if (!isClient()) a.run();
  } else {
    active = { a, st: target };
    if (a.mode === 'stir') {
      stirPx = 0;
      hud.showStir(true);
    }
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) endActive();
});
addEventListener('mousemove', (e) => {
  if (!inputOn()) return;
  if (active?.a.mode === 'stir') {
    stirPx += Math.hypot(e.movementX, e.movementY);
    return; // khi khuấy, camera đứng yên
  }
  if (!(locked || (freeMouse && e.buttons === 0))) return;
  if (skipMoves > 0) {
    skipMoves--;
    return;
  }
  const dx = e.movementX;
  const dy = e.movementY;
  // Lọc cú nhảy bất thường: một sự kiện chuột thật hiếm khi vượt quá vài trăm pixel
  if (Math.abs(dx) > 220 || Math.abs(dy) > 220) return;
  player.look(dx, dy);
});
addEventListener('wheel', (e) => {
  if (!inputOn()) return;
  doScroll(e.deltaY > 0 ? -1 : 1);
}, { passive: true });

// ---------- Ngắm vào trạm ----------
const ray = new THREE.Raycaster();
ray.far = 2.6;
const center = new THREE.Vector2(0, 0);
function findTarget() {
  ray.setFromCamera(center, camera);
  const hits = ray.intersectObjects(world.stationGroups, true);
  for (const h of hits) {
    if (h.object.isSprite) continue;
    let o = h.object;
    while (o && !o.userData.station) o = o.parent;
    if (o) return o.userData.station;
  }
  return null;
}

// ---------- Vòng lặp ----------
let last = performance.now();
const tmp = new THREE.Vector3();
let lastRaf = 0;
function frame(t) {
  requestAnimationFrame(frame);
  lastRaf = performance.now();
  step(lastRaf, true);
}

// Khi tab bị ẩn / thu nhỏ (chủ quán alt-tab), trình duyệt dừng requestAnimationFrame.
// Bộ đếm trong Web Worker vẫn chạy → Host tiếp tục chạy quán và gửi dữ liệu cho bạn bè.
const ticker = new Worker(URL.createObjectURL(new Blob(
  ['setInterval(()=>postMessage(0),33);'],
  { type: 'text/javascript' })));
ticker.onmessage = () => {
  const now = performance.now();
  if (mp.mode !== 'solo' && now - lastRaf > 100) step(now, false);
};

function step(t, render) {
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  const inp = inputOn() && render;

  if (inp) {
    player.update(dt, keys);
    target = findTarget();
  } else if (!game.isPlaying()) target = null;
  game.local.x = player.pos.x;
  game.local.z = player.pos.z;
  game.local.yaw = player.yaw;
  game.local.pitch = player.pitch;

  // Thao tác chuột trái đang giữ
  if (active) {
    const a = getAction(me(), active.st);
    if (!inp || !a || a.key !== active.a.key || target !== active.st) endActive();
    else {
      active.a = a;
      if (a.mode === 'hold' && !isClient()) a.run(dt);
      else if (a.mode === 'stir') {
        const amt = Math.min(stirPx * 0.12, 55 * dt);
        stirPx = 0;
        if (amt > 0) {
          if (isClient()) stirSend += amt;
          else a.run(amt);
          stirAngle += amt * 0.35;
        }
        hud.updateStir(stirAngle);
      }
    }
  }
  stirSendT -= dt;
  if (stirSend > 0 && stirSendT <= 0) {
    net.send({ t: 'stir', amt: stirSend });
    stirSend = 0;
    stirSendT = 0.05;
  }

  // Mô phỏng quán (Host / 1 mình)
  if (simOn()) {
    game.update(dt);
    for (const st of world.stations) {
      if (st.kind === 'stove') tickStove(st, dt, game.now, game);
      else if (st.kind === 'press') {
        const pressing = !!(active && active.st === st && active.a.key === 'press') || !!mp.host?.isPressing(st);
        tickPress(st, dt, pressing, game);
      }
    }
  }
  mp.host?.update(dt);
  mp.client?.update(dt);
  if (!render) return;

  // Hình ảnh luôn cập nhật
  let sizzle = 0;
  for (const st of world.stations) {
    if (st.update) st.update(dt, game.now, game);
    if (st.slot) st.slot.refresh(game.now);
    if (st.kind === 'stove' && st.slot?.type === 'wok' && st.heat > 0 && wokHasFood(st.slot.s)) {
      const d = camera.position.distanceTo(st.group.getWorldPosition(tmp));
      sizzle += (st.heat / 3) * Math.max(0.2, 1 - d / 12);
    }
    st.label.sprite.visible = camera.position.distanceTo(st.group.getWorldPosition(tmp)) < 5;
  }
  game.held?.refresh(game.now);
  audio.setSizzle(game.isPlaying() ? sizzle : 0);

  // Hướng dẫn từng bước
  guideT -= dt;
  if (guideT <= 0) {
    guideT = 0.2;
    guideStep = guideOn && game.isPlaying() ? nextStep(game, world) : null;
    const el = document.getElementById('guide');
    el.classList.toggle('hidden', !guideStep);
    if (guideStep && guideStep.text !== guideText) {
      guideText = guideStep.text;
      document.getElementById('guide-text').innerHTML = guideText;
      el.classList.remove('pulse');
      void el.offsetWidth; // chạy lại hiệu ứng nhấp nháy khi đổi bước
      el.classList.add('pulse');
    }
  }
  guideArrow.update(guideStep?.target || null, t / 1000);

  const ctx = { target: inp ? target : null };
  if (ctx.target) {
    ctx.inter = getInteraction(me(), target);
    ctx.act = active ? active.a : getAction(me(), target);
    ctx.scroll = getScroll(me(), target);
  }
  hud.update(dt, ctx);
  renderer.render(scene, camera);
}

player.reset();
requestAnimationFrame(frame);
