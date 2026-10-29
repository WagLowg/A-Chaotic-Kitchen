import { potStatus, wokHasFood } from './items.js';
import { ZONES, stars, starText } from './recipes.js';
import { SHOP_ITEMS, CONFIG } from './game.js';
import { vnd, clamp } from './util.js';
import { initAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const HEAT = ['Tắt', 'Nhỏ', 'Vừa', 'Lớn'];
const ok = (b) => (b ? '<span class="ok">✓</span>' : '<span class="no">✗</span>');

function bar(label, v, max, zone, opts = {}) {
  const pct = clamp((v / max) * 100, 0, 100);
  const z = zone ? `<div class="zone" style="left:${(zone[0] / max) * 100}%;width:${((zone[1] - zone[0]) / max) * 100}%"></div>` : '';
  const inZone = zone && v >= zone[0] && v <= zone[1];
  const cls = opts.danger ? 'fill danger' : inZone ? 'fill in' : 'fill';
  return `<div class="row"><span class="lbl">${label}</span><div class="bar">${z}<div class="${cls}" style="width:${pct}%"></div></div><span class="val">${opts.text ?? Math.round(v)}</span></div>`;
}
function heatRow(h) {
  return `<div class="row"><span class="lbl">Lửa</span><div class="heat">${[1, 2, 3].map((i) => `<i class="${i <= h ? 'on' : ''}"></i>`).join('')}</div><span class="val">${HEAT[h]}</span></div>`;
}

function itemRows(g, it, st) {
  const s = it.s;
  const out = [];
  switch (it.type) {
    case 'pot':
      out.push(`<div class="checks">Bột gạo ${ok(s.rice)} · Bột năng ${ok(s.tapioca)} · Nước ${ok(s.water)}${s.thick >= 75 ? ` · Dầu ${ok(s.oil)}` : ''}</div>`);
      if (s.water && (s.rice || s.tapioca)) out.push(bar('Đồng nhất', s.mix, 100, [90, 100]));
      if (s.thick > 0 || st?.kind === 'stove') out.push(bar('Độ sánh', s.thick, 130, ZONES.thick));
      if (s.burn > 0) out.push(bar('Bén nồi', s.burn, 100, null, { danger: true }));
      if (s.oil) out.push(bar('Trộn dầu', s.oilMix, 100, [ZONES.oilMix, 100]));
      if (s.lumpy) out.push('<div class="warn">Bột bị vón cục (chưa khuấy đều trước khi nấu)</div>');
      if (st?.kind === 'stove' && st.heat > 0 && s.thick > 8 && g.now - s.lastStir > 0.6 && !s.burnt) out.push('<div class="warn">⚠ Khuấy liên tục kẻo bén nồi!</div>');
      out.push(`<div class="status">${potStatus(s)}</div>`);
      break;
    case 'wok':
      out.push(`<div class="checks">Dầu ${ok(s.oil)} · Nước mắm ${ok(s.fishsauce)} · Tiêu ${ok(s.pepper)}</div>`);
      if (s.shrimp) out.push(bar('Tôm', s.shrimp.cook, 140, ZONES.shrimp));
      if (s.noodle) out.push(bar('Bánh lọt', s.noodle.cook, 130, ZONES.noodle));
      if (s.bean) out.push(bar('Giá', s.bean.cook, 100, ZONES.veg));
      if (s.chive) out.push(bar('Hẹ', s.chive.cook, 100, ZONES.veg));
      if (s.burn > 0) out.push(bar('Cháy', s.burn, 100, null, { danger: true }));
      if (st?.kind === 'stove' && st.heat >= 2 && wokHasFood(s) && g.now - s.lastToss > 1.2 && !s.burnt) out.push('<div class="warn">⚠ Đảo chảo đi kẻo cháy!</div>');
      if (s.burnt) out.push('<div class="no">Khét rồi! Đổ vào thùng rác</div>');
      break;
    case 'basin':
      out.push(`<div class="checks">Nước ${ok(s.water)} · Đá ${ok(s.ice)}</div>`);
      if (s.noodles) out.push(`<div>Bánh lọt: <b>${s.noodles}</b> phần · chất lượng ${Math.round(s.qsum / s.noodles)}</div>`);
      break;
    case 'shrimp':
      if (s.stage === 'raw') out.push(bar(s.peel < 50 ? 'Bóc vỏ' : s.peel < 75 ? 'Bỏ đầu' : 'Rút chỉ', s.peel, 100));
      if (s.stage === 'peeled') out.push(bar('Rửa', s.wash, 100));
      if (s.stage === 'clean') out.push('<div class="ok">Sẵn sàng xào</div>');
      break;
    case 'bean':
      out.push(s.washed ? '<div class="ok">Đã rửa</div>' : bar('Rửa', s.wash, 100));
      break;
    case 'chive':
      if (!s.washed) out.push(bar('Rửa', s.wash, 100));
      else if (!s.cut) out.push(bar('Cắt khúc', s.chops, 8, null, { text: `${s.chops}/8` }));
      else out.push('<div class="ok">Sẵn sàng xào</div>');
      break;
    case 'plate':
      if (s.dish) {
        const st2 = stars(s.dish.q);
        out.push(`<div>${starText(st2)} Chất lượng <b>${s.dish.q}</b>${s.dish.pepper ? '' : ' · không tiêu'}</div>`);
        if (s.dish.notes.length) out.push(`<ul class="note-list">${s.dish.notes.map((n) => `<li>${n}</li>`).join('')}</ul>`);
      } else if (s.dirty) out.push(bar('Rửa', s.wash, 100));
      break;
    case 'noodle':
      out.push(`<div>Chất lượng sợi: <b>${Math.round(s.q)}</b></div>`);
      break;
  }
  return out;
}

function describe(g, st) {
  const rows = [];
  switch (st.kind) {
    case 'stove':
      rows.push(heatRow(st.heat));
      break;
    case 'source':
      rows.push(st.options.map((o, i) => `<div class="opt ${i === st.sel ? 'sel' : ''}">${i === st.sel ? '▶ ' : ''}${o.label}${o.stock ? ` · còn <b>${g.stock[o.type]}</b>` : ''}</div>`).join(''));
      break;
    case 'press':
      rows.push(`<div>Bột trong khuôn: <b>${st.dough}</b>/6 phần</div>`);
      if (st.dough > 0) {
        rows.push(bar('Áp lực', st.pressure, 100, ZONES.pressure));
        rows.push(bar('Sợi', st.progress, 100));
      }
      if (!st.slot) rows.push('<div class="warn">Đặt thau nước đá dưới khuôn!</div>');
      break;
    case 'tray':
      rows.push(`<div>Bánh lọt: <b>${st.count}</b>/12 phần${st.count ? ` · chất lượng ${Math.round(st.qsum / st.count)}` : ''}</div>`);
      break;
    case 'plates':
      rows.push(`<div>Đĩa sạch: <b>${st.count}</b></div>`);
      break;
    case 'table': {
      const c = st.customer;
      if (!c) rows.push(st.slot?.s.dirty ? '<div class="warn">Còn đĩa bẩn – khách mới không ngồi bàn bẩn</div>' : '<div>Bàn trống</div>');
      else if (c.state === 'arriving') rows.push('<div>Khách đang tới…</div>');
      else if (c.state === 'waiting') {
        rows.push(`<div>Gọi: <b>Bánh lọt xào tôm</b>${c.order.noPepper ? ' – <span class="no">KHÔNG TIÊU</span>' : ''}</div>`);
        rows.push(bar('Kiên nhẫn', c.patience, c.patienceMax, null, { text: `${Math.ceil(c.patience)}s` }));
      } else if (c.state === 'eating') rows.push('<div>Khách đang ăn 😋</div>');
      break;
    }
  }
  if (st.slot) {
    rows.push(`<div class="sub">${st.slot.name}</div>`);
    rows.push(...itemRows(g, st.slot, st));
  }
  return `<h3>${st.name}</h3>${rows.join('')}`;
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.panelT = 0;
    this.recipeOpen = false;
    this.onResume = null;
    this.onStartDay = null;
    this.flashT = 0;
    this.onBeforeShop = null; // async (online, name) – main mở phòng online nếu cần
    this.onJoin = null; // async (code, name) → thông báo lỗi hoặc null
    this.onQuit = null; // → true nếu main tự xử lý (chế độ online)
    this.roomHtml = '';
    $('btn-resume').onclick = () => this.onResume?.();
    try {
      $('opt-name').value = localStorage.getItem('ack.name') || '';
    } catch {}
    const roomParam = new URLSearchParams(location.search).get('room');
    if (roomParam) $('opt-code').value = roomParam.toUpperCase().slice(0, 4);
    $('opt-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('btn-join').click();
    });
    $('btn-join').onclick = async () => {
      const code = $('opt-code').value.trim().toUpperCase();
      if (code.length !== 4) {
        $('menu-error').textContent = 'Nhập mã phòng 4 ký tự (chủ quán sẽ gửi cho bạn)';
        return;
      }
      initAudio();
      $('menu-error').textContent = 'Đang kết nối…';
      const err = await this.onJoin?.(code, this.playerName());
      $('menu-error').textContent = err || '';
      if (!err) this.show('menu', false);
    };
    $('btn-menu').onclick = () => {
      if (this.onQuit?.()) return;
      this.game.quitToMenu();
      this.show('pause', false);
      this.show('hud', false);
      this.show('recipe', false);
      this.recipeOpen = false;
      this.buildMenu();
      this.show('menu', true);
    };
    this.buildMenu();
  }

  show(id, on) {
    $(id).classList.toggle('hidden', !on);
  }

  buildMenu() {
    const g = this.game;
    const box = $('menu-buttons');
    box.innerHTML = '';
    const info = g.peekSave();
    const btn = (text, fn, cls = '') => {
      const b = document.createElement('button');
      b.textContent = text;
      if (cls) b.className = cls;
      b.onclick = fn;
      box.appendChild(b);
    };
    if (info) {
      btn(`Tiếp tục – Ngày ${info.day} · ${vnd(info.money)}`, () => {
        g.load();
        this.afterMenu();
      });
      $('opt-service').value = String(info.serviceSeconds || 300);
    }
    btn('Mở quán mới', () => {
      if (info && !confirm('Mở quán mới sẽ xoá bản lưu hiện tại. Tiếp tục?')) return;
      g.newGame();
      this.afterMenu();
    }, info ? 'secondary' : '');
  }
  playerName() {
    const n = ($('opt-name').value || '').trim().slice(0, 14) || `Đầu bếp ${Math.floor(Math.random() * 90) + 10}`;
    $('opt-name').value = n;
    try {
      localStorage.setItem('ack.name', n);
    } catch {}
    return n;
  }
  async afterMenu() {
    initAudio();
    this.game.serviceSeconds = +$('opt-service').value;
    this.show('menu', false);
    await this.onBeforeShop?.($('opt-online').checked, this.playerName());
    this.showShop();
  }

  // ---------- phòng online ----------
  setRoom(code, ips = [], port = location.port) {
    const links = [];
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (!local) links.push(`${location.origin}/?room=${code}`);
    else for (const ip of ips) links.push(`${location.protocol}//${ip}:${port}/?room=${code}`);
    this.roomHtml = `<div class="room">
      <div>🔑 Mã phòng: <b class="code">${code}</b></div>
      ${links.length ? `<div class="tip">Gửi link cho bạn bè: ${links.map((l) => `<code>${l}</code>`).join(' hoặc ')}</div>` : ''}
      ${local && links.length ? '<div class="tip">Link trên dùng cho bạn bè cùng mạng Wi-Fi. Chơi qua Internet: xem mục “Chơi online qua Internet” trong README.</div>' : ''}
    </div>`;
    $('room-info').innerHTML = this.roomHtml;
    $('hud-room').classList.remove('hidden');
    this.roomCode = code;
    this.setRoomCount(1, []);
  }
  setRoomCount(n, names) {
    if (!this.roomCode) return;
    const text = `🔑 ${this.roomCode} · 👥 ${n}/4`;
    const el = $('hud-room');
    if (el.textContent !== text) {
      el.textContent = text;
      el.title = names.join(', ');
    }
  }
  /** Máy khách: màn chờ khi chủ quán đang đi chợ / kết nối. */
  showWaiting(title, text) {
    $('shop-card').innerHTML = `<h2>${title}</h2><p class="waiting">${text}</p>${this.roomHtml}`;
    this.show('hud', false);
    this.show('summary', false);
    this.show('recipe', false);
    this.recipeOpen = false;
    this.show('shop', true);
  }
  enterKitchen() {
    this.show('shop', false);
    this.show('summary', false);
    this.show('menu', false);
    this.show('hud', true);
  }

  showPause(on) {
    this.show('pause', on);
  }
  toggleRecipe() {
    this.recipeOpen = !this.recipeOpen;
    this.show('recipe', this.recipeOpen);
  }

  showShop() {
    const g = this.game;
    const card = $('shop-card');
    const cart = {};
    SHOP_ITEMS.forEach((i) => (cart[i.type] = 0));
    const render = () => {
      const total = SHOP_ITEMS.reduce((s, i) => s + cart[i.type] * i.price, 0);
      card.innerHTML = `
        <h2>☀️ Sáng ngày ${g.day} – Đi chợ</h2>
        <p class="sub">Tiền: <b>${vnd(g.money)}</b> · Danh tiếng: <b>${Math.round(g.rep)}</b>/100</p>
        ${this.roomHtml}
        <table class="shop">
          <tr><th>Nguyên liệu</th><th>Giá</th><th>Trong kho</th><th>Mua thêm</th></tr>
          ${SHOP_ITEMS.map((i) => `<tr>
            <td>${i.label}<small>${i.note}</small></td>
            <td>${vnd(i.price)}</td>
            <td>${g.stock[i.type]} / ${i.max}</td>
            <td class="qty"><button data-t="${i.type}" data-d="-1">−</button><span>${cart[i.type]}</span><button data-t="${i.type}" data-d="1">+</button></td>
          </tr>`).join('')}
        </table>
        <div class="total">Tổng: <b>${vnd(total)}</b> · Còn lại: <b class="${g.money - total < 0 ? 'neg' : ''}">${vnd(g.money - total)}</b></div>
        <p class="tip">1 gói bột gạo + 1 gói bột năng = 1 mẻ <b>6 phần</b> bánh lọt. Mỗi đĩa cần 1 tôm, 1 giá, 1 hẹ.
        Cuối ngày trả tiền mặt bằng ${vnd(CONFIG.rent)} + gas/điện ${vnd(CONFIG.utilities)}. Giữ Shift khi bấm để +/−5.</p>
        <div class="actions"><button id="shop-go">🛵 Mua &amp; đến quán</button></div>`;
      card.querySelectorAll('button[data-t]').forEach((b) => {
        b.onclick = (e) => {
          const t = b.dataset.t;
          const item = SHOP_ITEMS.find((i) => i.type === t);
          const d = +b.dataset.d * (e.shiftKey ? 5 : 1);
          cart[t] = clamp(cart[t] + d, 0, Math.max(0, item.max - g.stock[t]));
          render();
        };
      });
      $('shop-go').onclick = () => {
        if (total > g.money) return;
        g.buy(cart);
        this.show('shop', false);
        this.show('hud', true);
        g.startDay();
        this.onStartDay?.();
      };
    };
    render();
    this.show('hud', false);
    this.show('summary', false);
    this.show('shop', true);
  }

  showSummary(readOnly = false) {
    const g = this.game;
    const s = g.stats;
    const avg = s.served ? (s.starsSum / s.served).toFixed(1) : '–';
    const net = s.revenue + s.tips - s.expenses - s.purchases;
    $('summary-card').innerHTML = `
      <h2>🌙 Kết thúc ngày ${g.day}</h2>
      <div class="stats">
        <span>Món đã phục vụ</span><span class="v">${s.served}</span>
        <span>Sao trung bình</span><span class="v">${avg} ★</span>
        <span>Khách bỏ về (chờ lâu)</span><span class="v">${s.walkouts}</span>
        <span>Khách chê món</span><span class="v">${s.refused}</span>
        <span class="sep"></span>
        <span>Doanh thu</span><span class="v pos">+${vnd(s.revenue)}</span>
        <span>Tiền tip</span><span class="v pos">+${vnd(s.tips)}</span>
        <span>Đi chợ sáng nay</span><span class="v neg">−${vnd(s.purchases)}</span>
        <span>Mặt bằng + gas/điện</span><span class="v neg">−${vnd(s.expenses)}</span>
        <span class="sep"></span>
        <span><b>Lợi nhuận hôm nay</b></span><span class="v ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${vnd(Math.abs(net))}</span>
        <span>Tiền hiện có</span><span class="v">${vnd(g.money)}</span>
        <span>Danh tiếng</span><span class="v">${Math.round(g.rep)}/100</span>
      </div>
      ${s.spoiled && (s.spoiled.bean || s.spoiled.chive) ? `<p class="tip">Rau héo bỏ đi: ${s.spoiled.bean} giá, ${s.spoiled.chive} hẹ.</p>` : ''}
      ${g.money < 0 ? '<p class="warn">Quán đang âm tiền! Mua ít nguyên liệu lại và phục vụ thật tốt nhé.</p>' : ''}
      ${readOnly
        ? '<p class="waiting">Chờ chủ quán cho cả nhóm về nhà nghỉ ngơi…</p>'
        : '<div class="actions"><button id="sum-sleep">🏠 Cả nhóm về nhà ngủ (tự động lưu)</button></div>'}`;
    if (!readOnly) {
      $('sum-sleep').onclick = () => {
        g.sleep();
        this.showShop();
      };
    }
    this.show('hud', false);
    this.show('recipe', false);
    this.recipeOpen = false;
    this.show('summary', true);
  }

  toast(text, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = text;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }
  flash() {
    this.flashT = 0.5;
  }

  showStir(on) {
    this.show('stir', on);
  }
  updateStir(angle) {
    const d = $('stir-dot');
    d.style.left = `${50 + Math.sin(angle) * 50}%`;
    d.style.top = `${50 - Math.cos(angle) * 50}%`;
  }

  update(dt, ctx) {
    const g = this.game;
    $('hud-day').textContent = `Ngày ${g.day}`;
    const clock = $('hud-clock');
    if (g.phase === 'prep') {
      clock.textContent = '🔧 Chuẩn bị – chưa mở cửa';
      clock.className = '';
    } else if (g.phase === 'service') {
      const frac = g.serviceT / g.serviceSeconds;
      const mins = 10 * 60 + 30 + Math.floor(frac * 180);
      const left = Math.max(0, Math.ceil(g.serviceSeconds - g.serviceT));
      clock.textContent = `🕐 ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} · còn ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      clock.className = 'open';
    } else if (g.phase === 'closing') {
      clock.textContent = '🚪 Đã đóng cửa – phục vụ nốt khách';
      clock.className = 'closing';
    }
    $('hud-money').textContent = `💰 ${vnd(g.money)}`;
    $('hud-rep').textContent = `⭐ ${Math.round(g.rep)}`;

    const p = $('prompt');
    const lines = [];
    if (ctx.inter) lines.push(ctx.inter.run ? `<div><kbd>E</kbd> ${ctx.inter.text}</div>` : `<div class="msg">${ctx.inter.text}</div>`);
    if (ctx.act) lines.push(ctx.act.mode ? `<div><kbd>Chuột trái</kbd> ${ctx.act.text}</div>` : `<div class="msg">${ctx.act.text}</div>`);
    if (ctx.scroll) lines.push(`<div><kbd>Lăn chuột</kbd> ${ctx.scroll.text}</div>`);
    const html = lines.join('');
    if (html !== this.lastPrompt) {
      p.innerHTML = html;
      this.lastPrompt = html;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    p.classList.toggle('flash', this.flashT > 0);
    $('crosshair').classList.toggle('on', !!ctx.target);

    const heldHtml = g.held ? `✋ <b>${g.held.name}</b>` : '';
    if (heldHtml !== this.lastHeld) {
      $('held').innerHTML = heldHtml;
      this.lastHeld = heldHtml;
    }

    this.panelT -= dt;
    if (this.panelT <= 0) {
      this.panelT = 0.1;
      const panel = $('panel');
      if (ctx.target) {
        panel.innerHTML = describe(g, ctx.target);
        panel.classList.remove('hidden');
      } else panel.classList.add('hidden');

      const tickets = g.customers.list
        .filter((c) => c.state === 'waiting' || c.state === 'eating')
        .sort((a, b) => (a.state === 'eating') - (b.state === 'eating') || a.patience - b.patience);
      $('orders').innerHTML = tickets
        .map((c) => {
          if (c.state === 'eating') return `<div class="ticket eating"><b>${c.table.name}</b>Đang ăn 😋</div>`;
          const r = c.patience / c.patienceMax;
          const cls = r > 0.5 ? '' : r > 0.25 ? 'mid' : 'low';
          return `<div class="ticket ${cls}"><b>${c.table.name}</b>Bánh lọt xào tôm${c.order.noPepper ? '<em>KHÔNG TIÊU</em>' : ''}<div class="pbar"><i style="width:${r * 100}%"></i></div></div>`;
        })
        .join('');
    }
  }
}
