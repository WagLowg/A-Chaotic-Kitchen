// Luật tương tác: [E] cầm/đặt/cho vào, [Chuột trái] thao tác, [Lăn chuột] chỉnh lửa/chọn đồ.
// Mỗi hàm trả về { text, run } – run = null nghĩa là chỉ hiện thông báo (không làm được).
import { Item, BOTTLES, CONTAINERS, potStatus, potReady, potEmpty, canStir, wokHasFood, wokEmpty } from './items.js';
import { doughQuality, evaluateWok, stars, starText } from './recipes.js';
import { sfx } from './audio.js';
import { clamp } from './util.js';

const msg = (text) => ({ text, run: null });
const act = (text, run) => ({ text, run });

// ======================= [E] =======================
export function getInteraction(g, st) {
  const h = g.held;
  switch (st.kind) {
    case 'source': return sourceInteract(g, st, h);
    case 'trash': return trashInteract(g, h);
    case 'plates': return platesInteract(g, st, h);
    case 'tray': return trayInteract(g, st, h);
    case 'table': return tableInteract(g, st, h);
    case 'bell':
      if (g.phase === 'prep') return act('Rung chuông – MỞ CỬA đón khách', () => g.openShop());
      if (!h) return msg(g.phase === 'service' ? 'Quán đang mở cửa' : 'Quán đã đóng cửa');
      break;
    case 'press':
      if (h && h.type === 'pot') {
        if (st.dough > 0) return msg('Khuôn còn bột – ép hết trước đã');
        if (!potReady(h.s)) return msg(`Nồi bột chưa sẵn sàng (${potStatus(h.s)})`);
        return act('Đổ bột vào khuôn ép', () => {
          st.dough = 6;
          st.dq = doughQuality(h.s);
          st.progress = 0;
          h.reset();
          sfx.pour();
          g.toast(`Đã đổ bột (chất lượng ${st.dq}) – giữ chuột trái để ép`, 'good');
        });
      }
      break;
    case 'sink':
      if (h && (h.type === 'pot' || h.type === 'basin')) {
        const c = h.s;
        if (h.type === 'pot' && c.burnt) return msg('Nồi bị khét – đổ vào thùng rác');
        if (c.water) return msg(`${h.type === 'pot' ? 'Nồi' : 'Thau'} đã có nước`);
        return act(`Thêm nước vào ${h.type === 'pot' ? 'nồi' : 'thau'}`, () => {
          c.water = true;
          h.refresh();
          sfx.pour();
        });
      }
      break;
  }
  return slotInteract(g, st, h, st.slot);
}

function slotInteract(g, st, h, s) {
  if (!h && !s) return null;
  if (!h && s) {
    return act(`Cầm ${s.name}`, () => {
      g.setHeld(st.take());
      sfx.pick();
    });
  }
  if (h && !s) {
    if (st.accepts && !st.accepts.includes(h.type)) return msg(`Không đặt ${h.name} ở ${st.name}`);
    return act(`Đặt ${h.name} lên ${st.name}`, () => {
      st.place(g.takeHeld());
      sfx.place();
    });
  }
  return combine(g, st, h, s) || msg(`${st.name} đang có ${s.name}`);
}

function combine(g, st, h, s) {
  if (h.type === 'plate' && s.type === 'wok') return plateFrom(g, h, s);
  if (h.type === 'wok' && s.type === 'plate') return plateFrom(g, s, h);
  if (CONTAINERS.has(s.type)) {
    const r = addTo(g, s, h, st, () => g.clearHeld());
    if (r) return r;
  }
  if (CONTAINERS.has(h.type)) {
    const r = addTo(g, h, s, null, () => st.take().dispose());
    if (r) return r;
  }
  return null;
}

/** Cho nguyên liệu `ing` vào vật chứa `c`. stc = trạm đang đặt vật chứa (nếu có). */
function addTo(g, c, ing, stc, consume) {
  const t = ing.type;
  const k = c.s;
  const use = (text, fn) =>
    act(text, () => {
      fn();
      if (!BOTTLES.has(t)) consume();
      c.refresh(g.now);
      sfx.place();
    });

  if (c.type === 'pot') {
    if (k.burnt) return msg('Nồi bột đã khét – đổ vào thùng rác');
    if (t === 'rice_flour' || t === 'tapioca') {
      const key = t === 'rice_flour' ? 'rice' : 'tapioca';
      if (k[key]) return msg(`Nồi đã có ${ing.name}`);
      if (k.thick > 0) return msg('Bột đang nấu, không thêm bột được');
      return use(`Cho ${ing.name} vào nồi`, () => (k[key] = true));
    }
    if (t === 'oil') {
      if (k.thick < 75) return msg('Nấu bột tới khi sánh dẻo rồi mới thêm dầu');
      if (stc && stc.kind === 'stove' && stc.heat > 0) return msg('Tắt bếp trước khi thêm dầu');
      if (k.oil) return msg('Đã có dầu – khuấy đều');
      return use('Thêm dầu ăn vào nồi bột', () => (k.oil = true));
    }
    return null;
  }

  if (c.type === 'basin') {
    if (t === 'ice') {
      if (k.ice) return msg('Thau đã có đá');
      return use('Cho đá vào thau', () => (k.ice = true));
    }
    return null;
  }

  if (c.type === 'wok') {
    if (k.burnt) return msg('Chảo bị khét – đổ vào thùng rác');
    switch (t) {
      case 'oil':
        if (k.oil) return msg('Chảo đã có dầu');
        return use('Thêm dầu vào chảo', () => (k.oil = true));
      case 'shrimp':
        if (k.shrimp) return msg('Chảo đã có tôm');
        if (ing.s.stage === 'raw') return msg('Tôm chưa sơ chế – bóc vỏ ở Thớt');
        if (ing.s.stage === 'peeled') return msg('Tôm chưa rửa – rửa ở Bồn rửa');
        return use('Cho tôm vào chảo', () => {
          k.shrimp = { cook: 0 };
          if (k.noodle) k.noodleEarly = true;
        });
      case 'noodle':
        if (k.noodle) return msg('Chảo đã có bánh lọt');
        return use('Cho bánh lọt vào chảo', () => {
          k.noodle = { cook: 0, q: ing.s.q };
          if (k.shrimp && k.shrimp.cook < 40) k.noodleEarly = true;
        });
      case 'bean':
        if (k.bean) return msg('Chảo đã có giá');
        if (!ing.s.washed) return msg('Giá chưa rửa – rửa ở Bồn rửa');
        return use('Cho giá đỗ vào chảo', () => (k.bean = { cook: 0 }));
      case 'chive':
        if (k.chive) return msg('Chảo đã có hẹ');
        if (!ing.s.washed) return msg('Hẹ chưa rửa – rửa ở Bồn rửa');
        if (!ing.s.cut) return msg('Hẹ chưa cắt khúc – dùng Thớt');
        return use('Cho hẹ vào chảo', () => (k.chive = { cook: 0 }));
      case 'fishsauce':
        if (k.fishsauce) return msg('Đã nêm nước mắm');
        return use('Nêm nước mắm', () => (k.fishsauce = true));
      case 'pepper':
        if (k.pepper) return msg('Đã rắc tiêu');
        return use('Rắc tiêu', () => (k.pepper = true));
    }
    return null;
  }
  return null;
}

function plateFrom(g, plate, wok) {
  if (plate.s.dirty) return msg('Đĩa bẩn – rửa ở Bồn rửa trước');
  if (plate.s.dish) return msg('Đĩa đã có món');
  const w = wok.s;
  if (w.burnt) return msg('Chảo khét – đổ vào thùng rác');
  if (!w.noodle) return msg('Chưa có bánh lọt trong chảo');
  return act('Múc ra đĩa', () => {
    const d = evaluateWok(w);
    plate.s.dish = d;
    wok.reset();
    plate.refresh(g.now);
    sfx.done();
    const s = stars(d.q);
    g.toast(`${starText(s)} Chất lượng ${d.q}${d.notes.length ? ' – ' + d.notes.slice(0, 2).join(', ') : ' – Hoàn hảo!'}`, s >= 2 ? 'good' : 'warn');
  });
}

function isFresh(it) {
  switch (it.type) {
    case 'shrimp': return it.s.stage === 'raw' && it.s.peel === 0;
    case 'bean': return !it.s.washed && it.s.wash === 0;
    case 'chive': return !it.s.washed && it.s.wash === 0;
    default: return true;
  }
}

function sourceInteract(g, st, h) {
  if (h) {
    if (h.type === 'basin' && st.options.some((o) => o.type === 'ice')) {
      if (h.s.ice) return msg('Thau đã có đá');
      return act('Cho đá vào thau', () => {
        h.s.ice = true;
        h.refresh();
        sfx.place();
      });
    }
    const o = st.options.find((x) => x.type === h.type);
    if (o && isFresh(h)) {
      return act(`Cất lại ${h.name}`, () => {
        if (o.stock) g.stock[o.type]++;
        g.clearHeld();
        sfx.place();
      });
    }
    return msg('Tay đang cầm đồ – đặt xuống trước');
  }
  const o = st.options[st.sel];
  if (o.stock) {
    const n = g.stock[o.type];
    if (n <= 0) return msg(`Hết ${o.label}! Mua thêm vào buổi sáng`);
    return act(`Lấy ${o.label} (còn ${n})`, () => {
      g.stock[o.type]--;
      g.setHeld(new Item(o.type));
      sfx.pick();
    });
  }
  return act(`Lấy ${o.label}`, () => {
    g.setHeld(new Item(o.type));
    sfx.pick();
  });
}

function trashInteract(g, h) {
  if (!h) return msg('Thùng rác');
  switch (h.type) {
    case 'pot':
      if (potEmpty(h.s)) return msg('Nồi đang trống');
      return act('Đổ bỏ nồi bột', () => { h.reset(); sfx.pour(); });
    case 'wok':
      if (wokEmpty(h.s)) return msg('Chảo đang trống');
      return act('Đổ bỏ đồ trong chảo', () => { h.reset(); sfx.pour(); });
    case 'basin':
      if (!h.s.water && !h.s.ice && !h.s.noodles) return msg('Thau đang trống');
      return act(h.s.noodles ? 'Đổ bỏ thau (mất bánh lọt!)' : 'Đổ nước trong thau', () => { h.reset(); sfx.pour(); });
    case 'plate':
      if (h.s.dish) return act('Bỏ món trên đĩa', () => { h.s.dish = null; h.s.dirty = true; h.refresh(); sfx.pour(); });
      return msg(h.s.dirty ? 'Đĩa bẩn – mang đi rửa' : 'Đĩa sạch – cất ở Chồng đĩa');
  }
  if (BOTTLES.has(h.type)) return msg('Cất chai lọ lại Kệ gia vị');
  return act(`Vứt ${h.name}`, () => { g.clearHeld(); sfx.place(); });
}

function platesInteract(g, st, h) {
  if (!h) {
    if (st.count <= 0) return msg('Hết đĩa sạch – rửa đĩa bẩn!');
    return act(`Lấy đĩa sạch (còn ${st.count})`, () => {
      st.count--;
      g.setHeld(new Item('plate'));
      sfx.pick();
    });
  }
  if (h.type === 'plate') {
    if (h.s.dirty) return msg('Rửa đĩa trước khi cất');
    if (h.s.dish) return msg('Đĩa đang có món – mang ra cho khách');
    return act('Cất đĩa sạch', () => { st.count++; g.clearHeld(); sfx.place(); });
  }
  if (h.type === 'wok') return msg('Đặt chảo xuống, cầm đĩa rồi múc món');
  return msg('Chồng đĩa');
}

function trayInteract(g, st, h) {
  if (h && h.type === 'basin') {
    if (h.s.noodles <= 0) return msg('Thau chưa có bánh lọt');
    if (st.count >= 12) return msg('Khay đầy');
    return act(`Vớt ${Math.min(h.s.noodles, 12 - st.count)} phần bánh lọt ra khay`, () => {
      const n = Math.min(h.s.noodles, 12 - st.count);
      const avg = h.s.qsum / h.s.noodles;
      st.count += n;
      st.qsum += avg * n;
      h.s.noodles -= n;
      h.s.qsum -= avg * n;
      h.refresh();
      sfx.place();
    });
  }
  if (h && h.type === 'noodle') {
    return act('Để lại phần bánh lọt', () => { st.count++; st.qsum += h.s.q; g.clearHeld(); sfx.place(); });
  }
  if (h && h.type === 'wok') {
    if (st.count <= 0) return msg('Khay trống – làm mẻ bánh lọt mới');
    if (h.s.noodle) return msg('Chảo đã có bánh lọt');
    if (h.s.burnt) return msg('Chảo khét – đổ vào thùng rác');
    return act('Cho 1 phần bánh lọt vào chảo', () => {
      const q = st.qsum / st.count;
      st.count--;
      st.qsum -= q;
      h.s.noodle = { cook: 0, q };
      if (h.s.shrimp && h.s.shrimp.cook < 40) h.s.noodleEarly = true;
      h.refresh();
      sfx.place();
    });
  }
  if (!h) {
    if (st.count <= 0) return msg('Khay trống – làm mẻ bánh lọt mới');
    return act(`Lấy 1 phần bánh lọt (còn ${st.count})`, () => {
      const q = st.qsum / st.count;
      st.count--;
      st.qsum -= q;
      const n = new Item('noodle');
      n.s.q = Math.round(q);
      n.refresh();
      g.setHeld(n);
      sfx.pick();
    });
  }
  return msg('Khay để ráo');
}

function tableInteract(g, st, h) {
  const c = st.customer;
  if (h && h.type === 'plate' && h.s.dish) {
    if (c && c.state === 'waiting') {
      return act(`Phục vụ khách ${st.name}`, () => {
        const plate = g.takeHeld();
        st.place(plate);
        c.serve(plate);
      });
    }
    return msg('Bàn này chưa có khách đang chờ');
  }
  if (!h && st.slot && st.slot.s.dirty) {
    return act('Dọn đĩa bẩn', () => {
      g.setHeld(st.take());
      sfx.pick();
    });
  }
  if (c && c.state === 'waiting') return msg(`Khách gọi: Bánh lọt xào tôm${c.order.noPepper ? ' (KHÔNG TIÊU)' : ''}`);
  if (c && c.state === 'eating') return msg('Khách đang ăn 😋');
  return null;
}

// ======================= [Chuột trái] =======================
export function getAction(g, st) {
  const s = st.slot;
  if (st.kind === 'press' && st.dough > 0) {
    return { mode: 'hold', key: 'press', text: st.slot ? 'Giữ: ép bột (giữ áp lực vùng xanh)' : 'Giữ: ép bột – ⚠ chưa có thau!', run: () => {} };
  }
  if (!s) return null;
  if (s.type === 'pot' && (st.kind === 'counter' || st.kind === 'stove') && canStir(s.s)) {
    return {
      mode: 'stir', key: 'stir', text: 'Giữ + xoay chuột: khuấy',
      run: (amt) => {
        const p = s.s;
        p.lastStir = g.now;
        p.spin += amt * 0.25;
        if (p.oil && p.oilMix < 100) p.oilMix = Math.min(100, p.oilMix + amt);
        else if (p.mix < 100) p.mix = Math.min(100, p.mix + amt);
      },
    };
  }
  if (s.type === 'wok' && st.kind === 'stove' && wokHasFood(s.s) && !s.s.burnt) {
    return {
      mode: 'click', key: 'toss', text: 'Click: đảo chảo',
      run: () => {
        s.s.lastToss = g.now;
        s.s.tosses++;
        sfx.toss();
      },
    };
  }
  if (st.kind === 'board') {
    if (s.type === 'shrimp' && s.s.stage === 'raw') {
      return {
        mode: 'hold', key: 'peel', text: 'Giữ: bóc vỏ, bỏ đầu, rút chỉ',
        run: (dt) => {
          const before = s.s.peel;
          s.s.peel = Math.min(100, s.s.peel + dt * 32);
          if (Math.floor(before / 12) !== Math.floor(s.s.peel / 12)) sfx.click();
          if (s.s.peel >= 100) {
            s.s.stage = 'peeled';
            g.toast('Đã bóc tôm – mang đi rửa', 'good');
          }
        },
      };
    }
    if (s.type === 'chive' && s.s.washed && !s.s.cut) {
      return {
        mode: 'click', key: 'chop', text: `Click: cắt hẹ (${s.s.chops}/8)`,
        run: () => {
          s.s.chops++;
          sfx.chop();
          if (s.s.chops >= 8) s.s.cut = true;
        },
      };
    }
    if (s.type === 'chive' && !s.s.washed) return { mode: null, key: 'none', text: 'Hẹ chưa rửa – rửa ở Bồn rửa trước' };
  }
  if (st.kind === 'sink') {
    const washable =
      (s.type === 'shrimp' && s.s.stage === 'peeled') ||
      ((s.type === 'bean' || s.type === 'chive') && !s.s.washed) ||
      (s.type === 'plate' && s.s.dirty);
    if (washable) {
      return {
        mode: 'hold', key: 'wash', text: `Giữ: rửa ${s.name}`,
        run: (dt) => {
          const before = s.s.wash;
          s.s.wash = Math.min(100, s.s.wash + dt * (s.type === 'plate' ? 40 : 50));
          if (Math.floor(before / 20) !== Math.floor(s.s.wash / 20)) sfx.wash();
          if (s.s.wash >= 100) {
            if (s.type === 'shrimp') s.s.stage = 'clean';
            else if (s.type === 'plate') { s.s.dirty = false; s.s.wash = 0; }
            else s.s.washed = true;
          }
        },
      };
    }
    if (s.type === 'shrimp' && s.s.stage === 'raw') return { mode: null, key: 'none', text: 'Bóc vỏ tôm ở Thớt trước' };
  }
  return null;
}

// ======================= [Lăn chuột / Z X] =======================
export function getScroll(g, st) {
  if (st.kind === 'stove') {
    return {
      text: 'chỉnh lửa',
      run: (dir) => {
        const before = st.heat;
        st.heat = clamp(st.heat + dir, 0, 3);
        if (st.heat !== before) sfx.click();
      },
    };
  }
  if (st.kind === 'source' && st.options.length > 1) {
    return {
      text: 'chọn nguyên liệu',
      run: (dir) => {
        const n = st.options.length;
        st.sel = (st.sel + (dir > 0 ? 1 : -1) + n) % n;
        sfx.click();
      },
    };
  }
  return null;
}
