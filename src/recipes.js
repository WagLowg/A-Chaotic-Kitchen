// Logic nấu món Bánh lọt xào tôm. Mọi con số ở đây là số liệu gameplay, chỉnh để cân bằng.
import { clamp } from './util.js';

export const POT_RATE = [0, 6, 10, 16]; // độ sánh tăng mỗi giây khi khuấy (theo lửa)
export const POT_BURN = [0, 6, 13, 26]; // bén nồi mỗi giây khi KHÔNG khuấy
export const WOK_RATE = [0, 3, 6, 10];  // độ chín tăng mỗi giây trong chảo

export const ZONES = {
  thick: [85, 105],
  potCooked: 75,
  oilMix: 40,
  noodle: [75, 90],
  shrimp: [80, 120],
  veg: [20, 60],
  pressure: [40, 80],
};

export function tickStove(st, dt, now, game) {
  const it = st.slot;
  if (!it || st.heat === 0) return;
  if (it.type === 'pot') tickPot(it.s, st.heat, dt, now, game);
  else if (it.type === 'wok') tickWok(it.s, st.heat, dt, now, game);
}

function tickPot(p, h, dt, now, game) {
  if (p.burnt) return;
  const flour = p.rice || p.tapioca;
  if (!flour && !p.water) return;
  if (!p.water) {
    p.burn += 20 * h * dt; // bột khô trên lửa → khét nhanh
  } else if (flour) {
    const stirring = now - p.lastStir < 0.6;
    if (p.mix < 90) p.lumpy = true; // nấu khi chưa khuấy đều → vón cục
    if (stirring) {
      p.thick += POT_RATE[h] * dt;
      if (h === 3) p.burn += 3 * dt;
    } else {
      p.thick += POT_RATE[h] * 0.3 * dt;
      if (p.thick > 8) p.burn += POT_BURN[h] * dt;
    }
    p.thick = Math.min(p.thick, 140);
  }
  if (p.burn >= 100) {
    p.burn = 100;
    p.burnt = true;
    game?.toast('Nồi bột bị khét! Đổ vào thùng rác và làm lại', 'bad');
  }
}

function tickWok(w, h, dt, now, game) {
  if (w.burnt) return;
  if (!(w.shrimp || w.noodle || w.bean || w.chive)) return;
  const tossed = now - w.lastToss < 1.2;
  const r = WOK_RATE[h] * (tossed ? 1 : 0.55) * dt;
  if (w.shrimp) w.shrimp.cook += r * 0.6;
  if (w.noodle) w.noodle.cook += r;
  if (w.bean) w.bean.cook += r * 1.8;
  if (w.chive) w.chive.cook += r * 1.8;
  if (!tossed && h >= 2) w.burn += (h === 3 ? 16 : 6) * dt;
  if (!w.oil) w.burn += 3 * h * dt;
  if (w.burn >= 100) {
    w.burn = 100;
    w.burnt = true;
    game?.toast('Chảo bị cháy khét! Đổ vào thùng rác', 'bad');
  }
}

/** Khuôn ép: giữ chuột trái để tăng áp lực; áp lực trong vùng xanh cho sợi đẹp nhất. */
export function tickPress(st, dt, pressing, game) {
  st.pressure = pressing ? Math.min(100, st.pressure + 75 * dt) : Math.max(0, st.pressure - 90 * dt);
  st.flowing = false;
  if (st.dough <= 0 || st.pressure < 25) return;
  st.flowing = true;
  const P = st.pressure;
  const rate = P < ZONES.pressure[0] ? 10 : P <= ZONES.pressure[1] ? 26 : 32;
  if (P > ZONES.pressure[1]) st.broken += dt * 30;
  st.progress += rate * dt;
  if (st.progress >= 100) {
    st.progress -= 100;
    st.dough--;
    const b = st.slot && st.slot.type === 'basin' ? st.slot : null;
    if (!b || !b.s.water) {
      game.toast('Sợi bánh rơi ra ngoài – cần thau nước dưới khuôn!', 'bad');
    } else {
      const q = st.dq - Math.min(40, st.broken) - (b.s.ice ? 0 : 20);
      b.s.noodles++;
      b.s.qsum += clamp(q, 5, 100);
      b.refresh();
      if (st.broken > 8) game.toast('Ép mạnh quá, sợi bị đứt!', 'warn');
      if (!b.s.ice) game.toast('Nước chưa có đá – sợi bánh bị dính', 'warn');
    }
    st.broken = 0;
    if (st.dough === 0) game.toast('Ép xong mẻ bánh lọt! Mang thau đến Khay để ráo', 'good');
  }
}

export function doughQuality(p) {
  let q = 100;
  if (p.lumpy) q -= 20;
  const t = p.thick;
  if (t < ZONES.thick[0]) q -= (ZONES.thick[0] - t) * 1.5;
  else if (t > ZONES.thick[1]) q -= (t - ZONES.thick[1]) * 1.5;
  q -= p.burn * 0.4;
  if (!p.rice || !p.tapioca) q -= 30;
  return clamp(Math.round(q), 5, 100);
}

/** Chấm điểm món khi múc ra đĩa. */
export function evaluateWok(w) {
  const has = { shrimp: !!w.shrimp, bean: !!w.bean, chive: !!w.chive };
  if (w.burnt) return { q: 0, burnt: true, pepper: w.pepper, notes: ['Món bị cháy khét!'], has };
  const notes = [];
  let q = 100;
  const n = w.noodle;
  q -= (100 - n.q) * 0.35;
  if (n.q < 70) notes.push('Sợi bánh lọt chưa đạt');
  if (n.cook < ZONES.noodle[0]) { q -= (ZONES.noodle[0] - n.cook) * 0.9; notes.push('Bánh còn sống'); }
  else if (n.cook > ZONES.noodle[1]) { q -= (n.cook - ZONES.noodle[1]) * 0.9; notes.push('Bánh xào quá tay'); }
  if (!w.oil) { q -= 10; notes.push('Quên cho dầu'); }
  if (!w.shrimp) { q -= 25; notes.push('Thiếu tôm'); }
  else {
    const c = w.shrimp.cook;
    if (c < ZONES.shrimp[0]) { q -= (ZONES.shrimp[0] - c) * 0.6; notes.push('Tôm chưa chín'); }
    else if (c > ZONES.shrimp[1]) { q -= (c - ZONES.shrimp[1]) * 0.5; notes.push('Tôm bị dai'); }
  }
  if (!w.fishsauce) { q -= 15; notes.push('Thiếu nước mắm'); }
  for (const [k, name] of [['bean', 'giá'], ['chive', 'hẹ']]) {
    if (!w[k]) { q -= 8; notes.push(`Thiếu ${name}`); }
    else if (w[k].cook > ZONES.veg[1]) { q -= (w[k].cook - ZONES.veg[1]) * 0.4; notes.push(`${name[0].toUpperCase() + name.slice(1)} bị héo`); }
  }
  if (w.noodleEarly) { q -= 5; notes.push('Cho bánh khi tôm còn sống'); }
  q -= w.burn * 0.25;
  if (w.burn > 40) notes.push('Hơi khét');
  return { q: clamp(Math.round(q), 0, 100), burnt: false, pepper: w.pepper, notes, has };
}

export const stars = (q) => (q >= 85 ? 3 : q >= 65 ? 2 : q >= 40 ? 1 : 0);
export const starText = (s) => '★'.repeat(s) + '☆'.repeat(3 - s);
