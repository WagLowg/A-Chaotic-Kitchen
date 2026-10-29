// Trạng thái trò chơi: ngày, tiền, danh tiếng, kho, người chơi, các giai đoạn trong ngày và lưu game.
// Khi chơi online, lớp này chỉ thực sự chạy trên máy Host – là nguồn sự thật duy nhất
// (tiền, kho, đơn hàng, đồ trên tay mỗi người). Máy khách chỉ nhận bản sao để hiển thị.
import { Item } from './items.js';
import { CustomerManager } from './customers.js';
import { stars, starText } from './recipes.js';
import { sfx } from './audio.js';
import { vnd, clamp } from './util.js';

export const CONFIG = { price: 45000, rent: 40000, utilities: 15000, startMoney: 250000, plates: 5 };

export const SHOP_ITEMS = [
  { type: 'shrimp', label: 'Tôm', note: '1 phần / đĩa', price: 12000, max: 20 },
  { type: 'rice_flour', label: 'Bột gạo', note: '1 gói / mẻ bánh lọt', price: 8000, max: 8 },
  { type: 'tapioca', label: 'Bột năng', note: '1 gói / mẻ bánh lọt', price: 6000, max: 8 },
  { type: 'bean', label: 'Giá đỗ', note: '1 phần / đĩa · héo qua đêm', price: 2000, max: 20 },
  { type: 'chive', label: 'Hẹ', note: '1 phần / đĩa · héo qua đêm', price: 2000, max: 20 },
];

/** Vị trí xuất hiện của 4 người chơi khi vào bếp. */
export const SPAWNS = [[0.4, -3.1], [1.6, -3.1], [-0.8, -3.1], [2.8, -3.1]];

const START_STOCK = { shrimp: 6, rice_flour: 2, tapioca: 2, bean: 6, chive: 6 };
const SAVE_KEY = 'achaotickitchen.save.v1';

/** Tư thế vật đang cầm: trước camera (người chơi của mình) hoặc trên tay nhân vật (người khác). */
export function applyHeldTransform(it, local) {
  it.mesh.position.set(0, 0, 0);
  if (local) {
    it.mesh.rotation.set(0.15, -0.5, 0);
    it.mesh.scale.setScalar(0.8);
  } else {
    it.mesh.rotation.set(0, 0, 0);
    it.mesh.scale.setScalar(0.7);
  }
}

export class Game {
  constructor(scene, world, holder) {
    this.scene = scene;
    this.world = world;
    this.now = 0;
    this.phase = 'menu'; // menu → shop → prep → service → closing → summary → shop ...
    this.day = 1;
    this.money = 0;
    this.rep = 50;
    this.stock = { ...START_STOCK };
    this.serviceSeconds = 300;
    this.serviceT = 0;
    this.stats = this.freshStats();
    this.players = new Map();
    this.local = this.addPlayer('h', 'Chủ quán', holder, true, 0);
    this.customers = new CustomerManager(scene, this, world.tables);
    this.hud = null;
    this.onBroadcastToast = null; // Host: gửi thông báo cho mọi người
    this.onToastTo = null; // Host: gửi thông báo riêng cho 1 người
  }

  // ---------- người chơi ----------
  addPlayer(id, name, holder, isLocal = false, colorIdx = 0) {
    const p = { id, name, holder, isLocal, colorIdx, held: null, x: 0, z: 0, yaw: 0, pitch: 0, online: true, active: null, stirQ: 0, avatar: null, _facade: null };
    this.players.set(id, p);
    return p;
  }
  onlineCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.online) n++;
    return n;
  }
  get held() {
    return this.local?.held || null;
  }
  /**
   * "Góc nhìn" của 1 người chơi cho luật tương tác: đồ trên tay là của người đó,
   * còn kho, thời gian, giai đoạn là của chung.
   */
  actor(p = this.local) {
    if (!p._facade) {
      const g = this;
      p._facade = {
        player: p,
        get held() { return p.held; },
        setHeld: (it) => g.setHeld(it, p),
        takeHeld: () => g.takeHeld(p),
        clearHeld: () => g.clearHeld(p),
        get now() { return g.now; },
        get phase() { return g.phase; },
        get stock() { return g.stock; },
        toast: (t, ty) => g.toastTo(p, t, ty),
        openShop: () => g.openShop(),
      };
    }
    return p._facade;
  }
  setHeld(it, p = this.local) {
    p.held = it;
    applyHeldTransform(it, p.isLocal);
    p.holder.add(it.mesh);
  }
  takeHeld(p = this.local) {
    const it = p.held;
    p.held = null;
    if (it) {
      it.mesh.removeFromParent();
      it.mesh.scale.setScalar(1);
      it.mesh.rotation.set(0, 0, 0);
    }
    return it;
  }
  clearHeld(p = this.local) {
    const it = this.takeHeld(p);
    if (it) it.dispose();
  }
  clearAllHeld() {
    for (const p of this.players.values()) {
      this.clearHeld(p);
      p.active = null;
    }
  }

  isPlaying() {
    return this.phase === 'prep' || this.phase === 'service' || this.phase === 'closing';
  }
  toast(text, type) {
    this.hud?.toast(text, type);
    this.onBroadcastToast?.(text, type);
  }
  toastTo(p, text, type) {
    if (p.isLocal) this.hud?.toast(text, type);
    else this.onToastTo?.(p, text, type);
  }
  freshStats() {
    return { served: 0, starsSum: 0, walkouts: 0, refused: 0, revenue: 0, tips: 0, purchases: 0, expenses: 0, spoiled: null };
  }

  // ---------- lưu / tải (Host giữ bản lưu) ----------
  peekSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch {
      return null;
    }
  }
  save() {
    const data = { version: 1, day: this.day, money: this.money, rep: this.rep, stock: this.stock, serviceSeconds: this.serviceSeconds, savedAt: Date.now() };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      this.toast('Không lưu được game (trình duyệt chặn bộ nhớ)', 'bad');
    }
  }
  load() {
    const d = this.peekSave();
    if (!d) return false;
    this.day = d.day;
    this.money = d.money;
    this.rep = d.rep;
    this.stock = { ...START_STOCK, ...d.stock };
    this.serviceSeconds = d.serviceSeconds || 300;
    this.stats = this.freshStats();
    this.phase = 'shop';
    return true;
  }
  newGame() {
    this.day = 1;
    this.money = CONFIG.startMoney;
    this.rep = 50;
    this.stock = { ...START_STOCK };
    this.stats = this.freshStats();
    this.phase = 'shop';
    this.save();
  }

  // ---------- vòng lặp ngày ----------
  buy(cart) {
    let cost = 0;
    for (const it of SHOP_ITEMS) cost += (cart[it.type] || 0) * it.price;
    if (cost > this.money) return false;
    this.money -= cost;
    for (const it of SHOP_ITEMS) this.stock[it.type] += cart[it.type] || 0;
    this.stats.purchases = cost;
    return true;
  }

  startDay() {
    this.phase = 'prep';
    this.serviceT = 0;
    this.customers.reset();
    this.resetKitchen();
    this.toast(`Ngày ${this.day}: chuẩn bị bánh lọt, rồi rung chuông ở quầy để mở cửa`, 'good');
  }

  resetKitchen() {
    this.clearAllHeld();
    for (const st of this.world.stations) {
      if (st.slot) st.take().dispose();
      st.resetState();
    }
    const h = this.world.homes;
    h.pot.place(new Item('pot'));
    h.basin.place(new Item('basin'));
    h.wok1.place(new Item('wok'));
    h.wok2.place(new Item('wok'));
  }

  openShop() {
    this.phase = 'service';
    this.serviceT = 0;
    this.customers.spawnT = 5;
    sfx.bell();
    this.toast('Quán đã MỞ CỬA! Khách sắp đến', 'good');
  }

  update(dt) {
    this.now += dt;
    if (this.phase === 'service') {
      this.serviceT += dt;
      if (this.serviceT >= this.serviceSeconds) {
        this.phase = 'closing';
        sfx.bell();
        this.toast('Hết giờ mở cửa – phục vụ nốt khách còn lại', 'warn');
      }
    }
    this.customers.update(dt);
    if (this.phase === 'closing' && this.customers.activeCount() === 0) this.endDay();
  }

  endDay() {
    this.phase = 'summary';
    this.clearAllHeld();
    const exp = CONFIG.rent + CONFIG.utilities;
    this.money -= exp;
    this.stats.expenses = exp;
    // Rau thừa héo một nửa qua đêm
    const spoiled = { bean: Math.ceil(this.stock.bean / 2), chive: Math.ceil(this.stock.chive / 2) };
    this.stock.bean -= spoiled.bean;
    this.stock.chive -= spoiled.chive;
    this.stats.spoiled = spoiled;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud?.showSummary();
  }

  sleep() {
    this.day++;
    this.stats = this.freshStats();
    this.phase = 'shop';
    this.save();
  }

  quitToMenu() {
    this.clearAllHeld();
    this.customers.reset();
    this.phase = 'menu';
  }

  // ---------- sự kiện khách ----------
  pay(c) {
    const d = c.dish;
    const s = stars(d.q);
    let price = CONFIG.price * (0.5 + (0.5 * d.q) / 100);
    let tip = s === 3 ? 10000 : s === 2 ? 5000 : 0;
    if (c.waitRatio > 0.5) tip += 5000;
    let rep = [-3, 0, 1, 3][s];
    let note = '';
    if (c.order.noPepper && d.pepper) {
      price *= 0.6;
      tip = 0;
      rep -= 2;
      note = ' · Khách đã dặn KHÔNG TIÊU!';
    } else if (!c.order.noPepper && !d.pepper) {
      tip = Math.max(0, tip - 5000);
      note = ' · Thiếu tiêu';
    }
    price = Math.round(price / 1000) * 1000;
    this.money += price + tip;
    this.stats.revenue += price;
    this.stats.tips += tip;
    this.stats.served++;
    this.stats.starsSum += s;
    this.rep = clamp(this.rep + rep, 0, 100);
    sfx.cash();
    this.toast(`${starText(s)} ${c.table.name} +${vnd(price)}${tip ? ` · tip ${vnd(tip)}` : ''}${note}`, s >= 2 && !note.includes('KHÔNG') ? 'good' : 'warn');
  }
  onWalkout(c) {
    this.stats.walkouts++;
    this.rep = clamp(this.rep - 4, 0, 100);
    sfx.bad();
    this.toast(`Khách ở ${c.table.name} chờ lâu quá nên bỏ về! 😡`, 'bad');
  }
  onRefuse(c) {
    this.stats.refused++;
    this.rep = clamp(this.rep - 4, 0, 100);
    sfx.bad();
    this.toast(`Khách ở ${c.table.name} chê món và bỏ về! 🤢`, 'bad');
  }
}
