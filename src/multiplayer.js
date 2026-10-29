// Chơi online: Host chạy game thật, máy khách gửi thao tác và nhận bản sao trạng thái.
//
//  Máy khách ──(pose, e, lmb, stir, scroll)──▶ Host
//  Host ──(state ~15 lần/giây, toast, sfx)──▶ mọi máy khách
//
// Tiền, kho, đơn hàng và đồ trên tay đều do Host quyết định → không bị nhân đôi hay mất khi lag.
import { Item } from './items.js';
import { Avatar, PLAYER_COLORS } from './avatar.js';
import { CustomerView } from './customers.js';
import { getInteraction, getAction, getScroll } from './interact.js';
import { setSfxHook, playSfx } from './audio.js';
import { SPAWNS, applyHeldTransform } from './game.js';

const SNAP_HZ = 15;
const snapItem = (it) => (it ? { id: it.id, t: it.type, s: it.s } : null);
const PLAYING = new Set(['prep', 'service', 'closing']);

// =====================================================================
export class HostSession {
  constructor({ net, game, world, scene, hud, code }) {
    Object.assign(this, { net, game, world, scene, hud, code });
    this.snapT = 0;
    this.countT = 0;
    game.onBroadcastToast = (text, type) => net.send({ t: 'toast', text, type });
    game.onToastTo = (p, text, type) => net.send({ t: 'toast', text, type, to: p.id });
    setSfxHook((n) => net.send({ t: 'sfx', n }));
    net.onMessage = (m) => this.onMessage(m);
  }

  remote() {
    return [...this.game.players.values()].filter((p) => !p.isLocal);
  }

  onMessage(m) {
    const g = this.game;
    if (m.t === 'peerJoin') return this.join(m.from, m.name);
    const p = g.players.get(m.from);
    if (!p) return;
    const st = m.st != null ? this.world.stations[m.st] : null;
    const f = g.actor(p);
    switch (m.t) {
      case 'peerLeave':
        p.online = false;
        p.active = null;
        p.avatar.setVisible(false);
        g.toast(`${p.name} đã rời quán (vào lại bằng đúng tên để tiếp tục)`, 'warn');
        break;
      case 'pose':
        p.x = +m.x || 0;
        p.z = +m.z || 0;
        p.yaw = +m.yaw || 0;
        p.pitch = +m.pitch || 0;
        p.avatar.setPose(p.x, p.z, p.yaw);
        break;
      case 'e': {
        if (!st || !g.isPlaying()) break;
        const it = getInteraction(f, st);
        if (it?.run) {
          p.active = null;
          it.run();
        }
        break;
      }
      case 'lmb': {
        if (!m.down) {
          p.active = null;
          break;
        }
        if (!st || !g.isPlaying()) break;
        const a = getAction(f, st);
        if (!a || !a.mode) break;
        if (a.mode === 'click') a.run();
        else {
          p.active = { st, key: a.key };
          p.stirQ = 0;
        }
        break;
      }
      case 'stir':
        p.stirQ = Math.min(80, p.stirQ + Math.max(0, Math.min(40, +m.amt || 0)));
        break;
      case 'scroll':
        if (st && g.isPlaying()) getScroll(f, st)?.run(m.dir > 0 ? 1 : -1);
        break;
    }
  }

  join(id, rawName) {
    const g = this.game;
    const name = String(rawName || 'Bạn').trim().slice(0, 14) || 'Bạn';
    // Người rớt mạng vào lại bằng đúng tên → giữ nguyên đồ đang cầm
    let p = this.remote().find((q) => !q.online && q.name === name);
    if (p) {
      g.players.delete(p.id);
      p.id = id;
      g.players.set(id, p);
      p.online = true;
      p.avatar.setVisible(true);
      g.toast(`${name} đã quay lại quán`, 'good');
    } else {
      if (g.onlineCount() >= 4) {
        this.net.send({ t: 'kick', to: id, msg: 'Quán đã đủ 4 người' });
        return;
      }
      const used = new Set([...g.players.values()].filter((q) => q.online).map((q) => q.colorIdx));
      let ci = 0;
      while (used.has(ci)) ci++;
      // Dọn người chơi cũ đã rời hẳn đang giữ màu này
      for (const q of this.remote()) {
        if (!q.online && q.colorIdx === ci) {
          g.clearHeld(q);
          q.avatar.dispose();
          g.players.delete(q.id);
        }
      }
      const av = new Avatar(this.scene, name, PLAYER_COLORS[ci % 4]);
      p = g.addPlayer(id, name, av.hand, false, ci);
      p.avatar = av;
      const [sx, sz] = SPAWNS[ci % 4];
      p.x = sx;
      p.z = sz;
      av.setPose(sx, sz, 0);
      av.snap();
      g.toast(`${name} đã vào quán! 👋`, 'good');
    }
    this.net.send({ t: 'welcome', to: id, color: p.colorIdx });
    this.snapT = 0;
  }

  isPressing(st) {
    return this.remote().some((p) => p.online && p.active && p.active.st === st && p.active.key === 'press');
  }

  update(dt) {
    const g = this.game;
    for (const p of this.remote()) {
      if (p.online && p.active && g.isPlaying()) {
        const a = getAction(g.actor(p), p.active.st);
        if (!a || a.key !== p.active.key) p.active = null;
        else if (a.mode === 'hold') a.run(dt);
        else if (a.mode === 'stir') {
          const amt = Math.min(p.stirQ, 55 * dt);
          p.stirQ -= amt;
          if (amt > 0) a.run(amt);
        }
      }
      p.avatar.update(dt);
      p.held?.refresh(g.now);
    }
    this.countT -= dt;
    if (this.countT <= 0) {
      this.countT = 0.5;
      this.hud.setRoomCount(g.onlineCount(), [...g.players.values()].filter((p) => p.online).map((p) => p.name));
    }
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 1 / SNAP_HZ;
      this.net.send(this.snapshot());
    }
  }

  snapshot() {
    const g = this.game;
    const w = this.world;
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      t: 'state',
      now: g.now,
      phase: g.phase,
      day: g.day,
      money: g.money,
      rep: g.rep,
      serviceT: g.serviceT,
      serviceSeconds: g.serviceSeconds,
      stock: g.stock,
      stats: g.phase === 'summary' ? g.stats : null,
      st: w.stations.map((s) => {
        const o = { i: snapItem(s.slot) };
        switch (s.kind) {
          case 'stove': o.h = s.heat; break;
          case 'source': o.sel = s.sel; break;
          case 'press': o.d = s.dough; o.p = r2(s.pressure); o.pr = r2(s.progress); o.f = s.flowing; break;
          case 'tray': o.c = s.count; o.q = s.qsum; break;
          case 'plates': o.c = s.count; break;
        }
        return o;
      }),
      pl: [...g.players.values()].map((p) => ({ id: p.id, n: p.name, c: p.colorIdx, x: r2(p.x), z: r2(p.z), y: r2(p.yaw), on: p.online, h: snapItem(p.held) })),
      cu: g.customers.list.map((c) => ({
        id: c.id, seed: c.seed, ti: w.tables.indexOf(c.table), bt: c.table.customer === c, st: c.state,
        x: r2(c.mesh.position.x), z: r2(c.mesh.position.z), ry: r2(c.mesh.rotation.y), sit: !!c.sitting,
        pa: c.patience, pm: c.patienceMax, np: c.order.noPepper, b: c.bubbleText || '',
      })),
    };
  }
}

// =====================================================================
export class ClientSession {
  constructor({ net, game, world, scene, hud, holder, player, myId, name, onEnterKitchen }) {
    Object.assign(this, { net, game, world, scene, hud, holder, player, myId, onEnterKitchen });
    this.items = new Map();
    this.avatars = new Map();
    this.custs = new Map();
    this.phase = null;
    this.frame = 0;
    this.nowBase = 0;
    this.nowAt = performance.now();
    this.poseT = 0;
    this.spawnIdx = 1;
    game.players.clear();
    game.local = game.addPlayer(myId, name, holder, true, 1);
    game.customers = { list: [], reset() {}, activeCount() { return this.list.length; } };
    net.onMessage = (m) => this.onMessage(m);
  }

  onMessage(m) {
    switch (m.t) {
      case 'state': this.apply(m); break;
      case 'toast': this.hud.toast(m.text, m.type); break;
      case 'sfx': playSfx(m.n); break;
      case 'welcome': this.spawnIdx = m.color % 4; break;
      case 'kick':
        alert(m.msg || 'Không vào được phòng');
        location.href = location.pathname;
        break;
      case 'hostLeft':
        alert('Chủ quán đã thoát – phòng đã đóng.');
        location.href = location.pathname;
        break;
    }
  }

  item(snap) {
    if (!snap) return null;
    let it = this.items.get(snap.id);
    if (!it || it.type !== snap.t) {
      if (it) it.dispose();
      it = new Item(snap.t);
      it.id = snap.id;
      this.items.set(snap.id, it);
    }
    it.s = snap.s;
    it.seen = this.frame;
    return it;
  }

  attach(it, parent, local) {
    if (it && it.mesh.parent !== parent) {
      it.mesh.removeFromParent();
      parent.add(it.mesh);
      applyHeldTransform(it, local);
    }
  }

  apply(m) {
    const g = this.game;
    const w = this.world;
    this.frame++;
    this.nowBase = m.now;
    this.nowAt = performance.now();
    g.now = m.now;
    g.phase = m.phase;
    g.day = m.day;
    g.money = m.money;
    g.rep = m.rep;
    g.serviceT = m.serviceT;
    g.serviceSeconds = m.serviceSeconds;
    g.stock = m.stock;
    if (m.stats) g.stats = m.stats;

    // Trạm & đồ trên trạm
    m.st.forEach((o, i) => {
      const st = w.stations[i];
      const it = this.item(o.i);
      if (st.slot !== it) {
        const old = st.slot;
        if (old && old.mesh.parent === st.anchor) old.mesh.removeFromParent();
        st.slot = null;
      }
      if (it) {
        if (it.mesh.parent !== st.anchor) st.place(it);
        else st.slot = it;
      }
      switch (st.kind) {
        case 'stove': st.heat = o.h; break;
        case 'source': st.sel = o.sel; break;
        case 'press': st.dough = o.d; st.pressure = o.p; st.progress = o.pr; st.flowing = o.f; break;
        case 'tray': st.count = o.c; st.qsum = o.q; break;
        case 'plates': st.count = o.c; break;
      }
    });

    // Người chơi
    const seen = new Set();
    let online = 0;
    const names = [];
    for (const pl of m.pl) {
      if (pl.on) {
        online++;
        names.push(pl.n);
      }
      const it = this.item(pl.h);
      if (pl.id === this.myId) {
        const lp = g.local;
        if (lp.held !== it && lp.held && lp.held.mesh.parent === this.holder) lp.held.mesh.removeFromParent();
        lp.held = it;
        this.attach(it, this.holder, true);
        continue;
      }
      let av = this.avatars.get(pl.id);
      if (!av) {
        av = new Avatar(this.scene, pl.n, PLAYER_COLORS[pl.c % 4]);
        av.setPose(pl.x, pl.z, pl.y);
        av.snap();
        this.avatars.set(pl.id, av);
      }
      av.setPose(pl.x, pl.z, pl.y);
      av.setVisible(pl.on);
      seen.add(pl.id);
      if (av.held !== it && av.held && av.held.mesh.parent === av.hand) av.held.mesh.removeFromParent();
      av.held = it;
      this.attach(it, av.hand, false);
    }
    for (const [id, av] of this.avatars) {
      if (!seen.has(id)) {
        av.dispose();
        this.avatars.delete(id);
      }
    }
    this.hud.setRoomCount(online, names);

    // Khách hàng
    w.tables.forEach((t) => (t.customer = null));
    const seenC = new Set();
    for (const c of m.cu) {
      let v = this.custs.get(c.id);
      if (!v) {
        v = new CustomerView(this.scene, c, w.tables);
        this.custs.set(c.id, v);
      } else v.apply(c, w.tables);
      if (c.bt) v.table.customer = v;
      seenC.add(c.id);
    }
    for (const [id, v] of this.custs) {
      if (!seenC.has(id)) {
        v.dispose();
        this.custs.delete(id);
      }
    }
    g.customers.list = [...this.custs.values()];

    // Dọn đồ không còn tồn tại
    for (const [id, it] of this.items) {
      if (it.seen !== this.frame) {
        it.dispose();
        this.items.delete(id);
      }
    }

    // Chuyển giai đoạn
    if (m.phase !== this.phase) {
      const prev = this.phase;
      this.phase = m.phase;
      if (m.phase === 'shop' || m.phase === 'menu') {
        if (document.pointerLockElement) document.exitPointerLock();
        this.hud.showWaiting(`☀️ Sáng ngày ${m.day}`, 'Chủ quán đang đi chợ mua nguyên liệu.<br>Bạn sẽ vào bếp ngay khi chủ quán tới quán.');
      } else if (m.phase === 'summary') {
        if (document.pointerLockElement) document.exitPointerLock();
        this.hud.showSummary(true);
      } else if (PLAYING.has(m.phase) && !PLAYING.has(prev)) {
        this.hud.enterKitchen();
        this.player.reset(this.spawnIdx);
        this.onEnterKitchen?.();
      }
    }
  }

  update(dt) {
    const g = this.game;
    g.now = this.nowBase + (performance.now() - this.nowAt) / 1000;
    for (const av of this.avatars.values()) {
      av.update(dt);
      av.held?.refresh(g.now);
    }
    for (const v of this.custs.values()) v.update(dt);
    this.poseT -= dt;
    if (this.poseT <= 0 && PLAYING.has(g.phase)) {
      this.poseT = 0.05;
      const p = this.player;
      this.net.send({ t: 'pose', x: p.pos.x, z: p.pos.z, yaw: p.yaw, pitch: p.pitch });
    }
  }
}
