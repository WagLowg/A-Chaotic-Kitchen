// Hướng dẫn từng bước: nhìn trạng thái bếp + đồ đang cầm → nói đúng 1 việc nên làm tiếp
// và chỉ trạm cần tới (mũi tên vàng trong game). Chạy riêng trên máy mỗi người chơi.
import * as THREE from 'three';
import { potReady, potEmpty, wokHasFood } from './items.js';
import { ZONES } from './recipes.js';

const step = (text, ...targets) => ({ text, target: targets.find(Boolean) || null });

export function nextStep(g, world) {
  const S = world.stations;
  const of = (k) => S.filter((s) => s.kind === k);
  const named = (n) => S.find((s) => s.name === n);
  const pantry = named('Kệ khô');
  const spice = named('Kệ gia vị');
  const fridge = named('Tủ lạnh');
  const freezer = named('Tủ đông');
  const [sink] = of('sink');
  const [trash] = of('trash');
  const [press] = of('press');
  const [tray] = of('tray');
  const [plates] = of('plates');
  const [bell] = of('bell');
  const stoves = of('stove');
  const boards = of('board');
  const counters = S.filter((s) => s.kind === 'counter');

  // Chọn trạm trống gần người chơi nhất
  const me = g.local || { x: 0, z: 0 };
  const nearest = (list) => {
    let best = null;
    let bd = Infinity;
    for (const s of list) {
      if (s.slot) continue;
      const d = Math.hypot(s.group.position.x - me.x, s.group.position.z - me.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  const freeCounter = () => nearest(counters);
  const freeStove = () => nearest(stoves);
  const freeBoard = () => nearest(boards);
  const withItem = (fn) => S.find((s) => s.slot && fn(s.slot));

  const h = g.held;
  const potSt = withItem((it) => it.type === 'pot');
  const basinSt = withItem((it) => it.type === 'basin');
  const woks = S.filter((s) => s.slot?.type === 'wok');
  const stoveWoks = woks.filter((s) => s.kind === 'stove');
  // Chảo đang nấu dở ưu tiên, sau đó chảo trống trên bếp, cuối cùng chảo bất kỳ
  const wokSt =
    stoveWoks.find((s) => wokHasFood(s.slot.s) || s.slot.s.oil) ||
    woks.find((s) => wokHasFood(s.slot.s)) ||
    stoveWoks[0] ||
    woks[0] ||
    null;
  const waiting = world.tables.filter((t) => t.customer && t.customer.state === 'waiting').sort((a, b) => a.customer.patience - b.customer.patience);
  const firstOrder = waiting[0]?.customer || null;
  const dirtyTable = world.tables.find((t) => t.slot?.s.dirty);
  const playing = g.phase === 'prep' || g.phase === 'service' || g.phase === 'closing';
  if (!playing) return null;

  const heldBasinNoodles = h?.type === 'basin' ? h.s.noodles : 0;
  const noodlesInPipeline = tray.count + (basinSt?.slot.s.noodles || 0) + heldBasinNoodles + (press.dough || 0) + (h?.type === 'noodle' ? 1 : 0);
  const potBusy = (potSt && !potEmpty(potSt.slot.s)) || (h?.type === 'pot' && !potEmpty(h.s));
  const wantNoodles = noodlesInPipeline === 0 || (g.phase === 'prep' && noodlesInPipeline < 6 && potBusy);

  // =================== Đang cầm đồ ===================
  if (h) {
    switch (h.type) {
      case 'rice_flour':
      case 'tapioca':
        if (potSt) return step(`Nhấn <kbd>E</kbd> vào <b>Nồi bột</b> để cho ${h.name} vào`, potSt);
        return step('Đặt xuống quầy trống (<kbd>E</kbd>)', freeCounter());
      case 'pot': {
        const p = h.s;
        if (p.burnt) return step('Nồi bị khét – nhấn <kbd>E</kbd> vào <b>Thùng rác</b> để đổ bỏ', trash);
        if (potEmpty(p) && !wantNoodles) return step('Đặt nồi trống xuống quầy (<kbd>E</kbd>)', freeCounter());
        if (!p.rice || !p.tapioca) return step(`Đặt nồi lên quầy (<kbd>E</kbd>), rồi lấy <b>${!p.rice ? 'Bột gạo' : 'Bột năng'}</b> ở Kệ khô`, freeCounter());
        if (!p.water) return step('Mang nồi tới <b>Bồn rửa</b>, nhấn <kbd>E</kbd> để thêm nước', sink);
        if (p.thick < 1 && p.mix < 100) return step('Đặt nồi lên <b>Quầy sơ chế</b> (<kbd>E</kbd>) để khuấy bột', freeCounter());
        if (p.thick < ZONES.potCooked) return step('Đặt nồi lên <b>Bếp</b> (<kbd>E</kbd>) để nấu', freeStove());
        if (!p.oil) return step('Đặt nồi xuống quầy, rồi lấy <b>Chai dầu ăn</b> ở Kệ gia vị', freeCounter());
        if (p.oilMix < ZONES.oilMix) return step('Đặt nồi xuống quầy và khuấy cho đều dầu', freeCounter());
        if (press.slot?.s.water) return step('Nhấn <kbd>E</kbd> vào <b>Khuôn ép</b> để đổ bột vào', press);
        return step('Đặt nồi xuống quầy, chuẩn bị <b>Thau nước đá</b> dưới Khuôn ép trước', freeCounter());
      }
      case 'basin': {
        const b = h.s;
        if (b.noodles > 0) return step('Mang thau tới <b>Khay để ráo</b>, nhấn <kbd>E</kbd> để vớt bánh', tray);
        if (!wantNoodles && !potBusy) return step('Đặt thau xuống quầy trống (<kbd>E</kbd>)', freeCounter());
        if (!b.water) return step('Mang thau tới <b>Bồn rửa</b>, nhấn <kbd>E</kbd> để thêm nước', sink);
        if (!b.ice) return step('Mang thau tới <b>Tủ đông</b>, nhấn <kbd>E</kbd> để thêm đá', freezer);
        return step('Đặt thau dưới <b>Khuôn ép bánh lọt</b> (<kbd>E</kbd>)', press);
      }
      case 'shrimp':
        if (h.s.stage === 'raw') return step('Đặt tôm lên <b>Thớt</b> (<kbd>E</kbd>) để bóc vỏ', freeBoard());
        if (h.s.stage === 'peeled') return step('Đặt tôm vào <b>Bồn rửa</b> (<kbd>E</kbd>) để rửa', sink);
        if (wokSt && wokSt.kind === 'stove' && wokSt.slot.s.oil && !wokSt.slot.s.shrimp) return step('Nhấn <kbd>E</kbd> vào <b>Chảo</b> để cho tôm vào', wokSt);
        if (wokSt && wokSt.kind === 'stove' && !wokSt.slot.s.oil) return step('Đặt tôm xuống quầy – cho <b>dầu ăn</b> vào chảo trước', freeCounter());
        return step('Đặt tôm xuống quầy, rồi đặt <b>Chảo</b> lên Bếp', freeCounter());
      case 'bean':
        if (!h.s.washed) return step('Đặt giá vào <b>Bồn rửa</b> (<kbd>E</kbd>) để rửa', sink);
        if (wokSt?.slot.s.noodle && !wokSt.slot.s.bean) return step('Nhấn <kbd>E</kbd> vào <b>Chảo</b> để cho giá vào', wokSt);
        return step('Đặt giá xuống quầy – cho vào chảo sau khi đã có bánh lọt', freeCounter());
      case 'chive':
        if (!h.s.washed) return step('Đặt hẹ vào <b>Bồn rửa</b> (<kbd>E</kbd>) để rửa', sink);
        if (!h.s.cut) return step('Đặt hẹ lên <b>Thớt</b> (<kbd>E</kbd>) để cắt khúc', freeBoard());
        if (wokSt?.slot.s.noodle && !wokSt.slot.s.chive) return step('Nhấn <kbd>E</kbd> vào <b>Chảo</b> để cho hẹ vào', wokSt);
        return step('Đặt hẹ xuống quầy – cho vào chảo sau khi đã có bánh lọt', freeCounter());
      case 'noodle':
        if (wokSt?.slot.s.shrimp && !wokSt.slot.s.noodle) return step('Nhấn <kbd>E</kbd> vào <b>Chảo</b> để cho bánh lọt vào', wokSt);
        return step('Đặt bánh lọt xuống quầy – xào tôm trước đã', freeCounter());
      case 'ice':
        return step('Nhấn <kbd>E</kbd> vào <b>Thau</b> để cho đá vào', basinSt);
      case 'oil':
        if (potSt && potSt.slot.s.thick >= ZONES.potCooked && !potSt.slot.s.oil) {
          if (potSt.kind === 'stove' && potSt.heat > 0) return step('Tắt bếp trước (lăn chuột xuống ở Bếp), rồi cho dầu vào nồi', potSt);
          return step('Nhấn <kbd>E</kbd> vào <b>Nồi bột</b> để thêm dầu', potSt);
        }
        if (potSt && potSt.slot.s.oil && potSt.slot.s.oilMix < ZONES.oilMix) return step('Cất chai về <b>Kệ gia vị</b> (<kbd>E</kbd>), rồi khuấy nồi cho đều dầu', spice);
        if (wokSt && wokSt.kind === 'stove' && !wokSt.slot.s.oil && (waiting.length || wokHasFood(wokSt.slot.s))) {
          return step('Nhấn <kbd>E</kbd> vào <b>Chảo</b> để thêm dầu', wokSt);
        }
        return step('Cất chai về <b>Kệ gia vị</b> (<kbd>E</kbd>)', spice);
      case 'fishsauce':
        if (wokSt?.slot.s.noodle && !wokSt.slot.s.fishsauce) return step('Nhấn <kbd>E</kbd> vào <b>Chảo</b> để nêm nước mắm', wokSt);
        return step('Cất chai về <b>Kệ gia vị</b> (<kbd>E</kbd>)', spice);
      case 'pepper':
        if (wokSt?.slot.s.noodle && !wokSt.slot.s.pepper && !firstOrder?.order.noPepper) return step('Nhấn <kbd>E</kbd> vào <b>Chảo</b> để rắc tiêu', wokSt);
        return step('Cất lọ tiêu về <b>Kệ gia vị</b> (<kbd>E</kbd>)', spice);
      case 'wok':
        if (h.s.burnt) return step('Chảo bị khét – nhấn <kbd>E</kbd> vào <b>Thùng rác</b>', trash);
        return step('Đặt chảo lên <b>Bếp</b> (<kbd>E</kbd>)', freeStove());
      case 'plate': {
        const s = h.s;
        if (s.dirty) return step('Đặt đĩa bẩn vào <b>Bồn rửa</b>, giữ <kbd>Chuột trái</kbd> để rửa', sink);
        if (s.dish) {
          if (s.dish.burnt) return step('Món khét – nhấn <kbd>E</kbd> vào <b>Thùng rác</b> để bỏ', trash);
          if (waiting.length) return step(`Mang món ra <b>${waiting[0].name}</b>, nhấn <kbd>E</kbd> để phục vụ`, waiting[0]);
          return step('Cầm món chờ khách gọi, hoặc đặt tạm lên quầy');
        }
        const ready = woks.find((st) => st.slot.s.noodle && !st.slot.s.burnt);
        if (ready) return step('Nhấn <kbd>E</kbd> vào <b>Chảo</b> để múc món ra đĩa', ready);
        return step('Cất đĩa về <b>Chồng đĩa</b> (<kbd>E</kbd>)', plates);
      }
    }
    return step('Đặt đồ đang cầm xuống quầy trống (<kbd>E</kbd>)', freeCounter());
  }

  // =================== Tay trống ===================
  // 1. Đồ bị khét
  const burnt = withItem((it) => (it.type === 'pot' || it.type === 'wok') && it.s.burnt);
  if (burnt) return step(`${burnt.slot.name} – cầm lên (<kbd>E</kbd>) rồi đổ vào Thùng rác`, burnt);

  // 2. Chảo đang xào (việc gấp nhất – dễ cháy)
  if (wokSt && wokSt.kind === 'stove' && wokHasFood(wokSt.slot.s)) {
    const r = wokStep(wokSt, { g, waiting, firstOrder, spice, fridge, sink, tray, plates, boards, withItem, freeBoard });
    if (r) return r;
  }

  // 3. Nồi bột trên bếp
  if (potSt && potSt.kind === 'stove' && !potEmpty(potSt.slot.s)) {
    const p = potSt.slot.s;
    if (p.thick < ZONES.potCooked) {
      if (potSt.heat === 0) return step('Bật lửa <b>NHỎ</b>: nhìn vào Bếp và <kbd>lăn chuột lên</kbd> 1 nấc', potSt);
      return step(`Giữ <kbd>Chuột trái</kbd> + xoay chuột để <b>khuấy liên tục</b>${potSt.heat > 1 ? ' (nên để lửa nhỏ)' : ''} tới khi Độ sánh vào vùng xanh`, potSt);
    }
    if (potSt.heat > 0) return step('Bột đã sánh! <b>Tắt bếp</b>: <kbd>lăn chuột xuống</kbd> tới khi lửa tắt', potSt);
  }

  // 4. Khuôn ép đang có bột
  if (press.dough > 0) {
    if (!press.slot) return step('Chưa có thau! Đặt <b>Thau nước đá</b> dưới khuôn trước khi ép', basinSt || freezer);
    return step('Giữ <kbd>Chuột trái</kbd> ở <b>Khuôn ép</b> – nhả ra khi Áp lực vượt vùng xanh', press);
  }

  // 5. Thau đã có bánh lọt
  if (basinSt && basinSt.slot.s.noodles > 0) return step('Cầm <b>Thau bánh lọt</b> (<kbd>E</kbd>) mang tới Khay để ráo', basinSt);

  // 6. Làm bánh lọt (giai đoạn A)
  if (potSt && (wantNoodles || potBusy)) {
    const p = potSt.slot.s;
    if (!p.rice || !p.tapioca) {
      const need = !p.rice ? 'Bột gạo' : 'Bột năng';
      return step(`Lấy <b>${need}</b> ở Kệ khô (<kbd>lăn chuột</kbd> để chọn, <kbd>E</kbd> để lấy)`, pantry);
    }
    if (!p.water) return step('Cầm <b>Nồi bột</b> (<kbd>E</kbd>) mang tới Bồn rửa để thêm nước', potSt);
    if (p.thick < 1 && p.mix < 100) {
      if (potSt.kind === 'counter') return step('Giữ <kbd>Chuột trái</kbd> + <b>xoay chuột thành vòng tròn</b> để khuấy bột tới 100%', potSt);
      return step('Cầm nồi đặt lên quầy để khuấy', potSt);
    }
    if (p.thick < ZONES.potCooked) return step('Cầm <b>Nồi bột</b> (<kbd>E</kbd>) đặt lên Bếp', potSt);
    if (!p.oil) return step('Lấy <b>Chai dầu ăn</b> ở Kệ gia vị (<kbd>lăn chuột</kbd> chọn) cho vào nồi', spice);
    if (p.oilMix < ZONES.oilMix) return step('Giữ <kbd>Chuột trái</kbd> + xoay chuột để trộn đều dầu', potSt);
    if (potReady(p)) {
      const b = press.slot || basinSt?.slot;
      if (!b) return step('Chuẩn bị thau: tìm <b>Thau</b>');
      if (!b.s.water) return step('Cầm <b>Thau</b> (<kbd>E</kbd>) mang tới Bồn rửa để thêm nước', basinSt || press);
      if (!b.s.ice) return step('Cầm <b>Thau</b> mang tới Tủ đông để thêm đá', basinSt || press);
      if (!press.slot) return step('Cầm <b>Thau nước đá</b> đặt dưới Khuôn ép', basinSt);
      return step('Cầm <b>Nồi bột</b> (<kbd>E</kbd>) rồi nhấn <kbd>E</kbd> vào Khuôn ép để đổ bột', potSt);
    }
  }

  // 7. Đã có bánh lọt lúc chuẩn bị → mở cửa
  if (g.phase === 'prep' && tray.count > 0 && !potBusy) {
    return step(`Đã có ${tray.count} phần bánh lọt! Nhấn <kbd>E</kbd> vào <b>Chuông</b> ở quầy để MỞ CỬA`, bell);
  }

  // 8. Hết đĩa
  if (plates.count === 0 && dirtyTable) return step(`Hết đĩa sạch! Dọn đĩa bẩn ở <b>${dirtyTable.name}</b> (<kbd>E</kbd>)`, dirtyTable);
  const dirtySink = sink.slot?.type === 'plate' && sink.slot.s.dirty;
  if (dirtySink) return step('Giữ <kbd>Chuột trái</kbd> ở Bồn rửa để rửa đĩa', sink);

  // 9. Có khách → nấu món (giai đoạn B)
  if (waiting.length && tray.count > 0) {
    if (!wokSt) return step('Không thấy chảo!');
    if (wokSt.kind !== 'stove') return step('Cầm <b>Chảo</b> (<kbd>E</kbd>) đặt lên Bếp', wokSt);
    const r = wokStep(wokSt, { g, waiting, firstOrder, spice, fridge, sink, tray, plates, boards, withItem, freeBoard });
    if (r) return r;
  }

  // 10. Việc phụ
  if (dirtyTable) return step(`Dọn đĩa bẩn ở <b>${dirtyTable.name}</b> (<kbd>E</kbd>) rồi mang đi rửa`, dirtyTable);
  if (wantNoodles && potSt) return step('Hết bánh lọt! Lấy <b>Bột gạo</b> ở Kệ khô để làm mẻ mới', pantry);
  if (g.phase === 'closing') return step('Đã đóng cửa – phục vụ nốt khách còn lại');
  if (g.phase === 'prep') return step('Nhấn <kbd>E</kbd> vào <b>Chuông</b> ở quầy để MỞ CỬA', bell);
  return step('Chờ khách gọi món… (có thể sơ chế sẵn tôm, giá, hẹ)');
}

/** Các bước xào món trong chảo. */
function wokStep(wokSt, c) {
  const w = wokSt.slot.s;
  const { firstOrder, spice, fridge, sink, tray, plates, withItem, freeBoard } = c;
  const heat = wokSt.heat;
  if (!w.oil) return step('Lấy <b>Chai dầu ăn</b> ở Kệ gia vị (<kbd>lăn chuột</kbd> chọn) cho vào chảo', spice);

  // Tôm
  if (!w.shrimp) {
    const rawOnBoard = withItem((it) => it.type === 'shrimp' && it.s.stage === 'raw');
    if (rawOnBoard?.kind === 'board') return step('Giữ <kbd>Chuột trái</kbd> ở Thớt để <b>bóc vỏ tôm</b>', rawOnBoard);
    if (rawOnBoard) return step('Cầm tôm (<kbd>E</kbd>) đặt lên Thớt', rawOnBoard);
    const peeled = withItem((it) => it.type === 'shrimp' && it.s.stage === 'peeled');
    if (peeled?.kind === 'sink') return step('Giữ <kbd>Chuột trái</kbd> ở Bồn rửa để <b>rửa tôm</b>', peeled);
    if (peeled) return step('Cầm tôm (<kbd>E</kbd>) đặt vào Bồn rửa', peeled);
    const clean = withItem((it) => it.type === 'shrimp' && it.s.stage === 'clean');
    if (clean) return step('Cầm <b>Tôm sạch</b> (<kbd>E</kbd>) cho vào chảo', clean);
    return step('Lấy <b>Tôm</b> ở Tủ lạnh (<kbd>lăn chuột</kbd> chọn, <kbd>E</kbd> lấy)', fridge);
  }
  if (heat === 0) return step('Bật lửa <b>LỚN</b>: nhìn vào Bếp và <kbd>lăn chuột lên</kbd>', wokSt);
  if (!w.noodle) {
    if (w.shrimp.cook < 50) return step(`<kbd>Click</kbd> liên tục để <b>đảo chảo</b> – chờ tôm chín ~60% (đang ${Math.round(w.shrimp.cook)}%)`, wokSt);
    if (tray.count > 0) return step('Tôm gần chín! Lấy 1 phần <b>bánh lọt</b> ở Khay để ráo (<kbd>E</kbd>) cho vào chảo', tray);
    return step('Hết bánh lọt – tắt bếp và làm mẻ bánh mới', wokSt);
  }
  if (!w.fishsauce) return step('Lấy <b>Nước mắm</b> ở Kệ gia vị nêm vào chảo (nhớ quay lại đảo chảo!)', spice);
  if (!w.pepper && !firstOrder?.order.noPepper) return step('Lấy <b>Lọ tiêu</b> ở Kệ gia vị rắc vào chảo', spice);

  for (const [type, name] of [['bean', 'Giá đỗ'], ['chive', 'Hẹ']]) {
    if (w[type]) continue;
    const ready = withItem((it) => it.type === type && it.s.washed && (type === 'bean' || it.s.cut));
    if (ready) return step(`Cầm <b>${name}</b> (<kbd>E</kbd>) cho vào chảo`, ready);
    const onBoard = type === 'chive' && withItem((it) => it.type === 'chive' && it.s.washed && !it.s.cut);
    if (onBoard?.kind === 'board') return step('<kbd>Click</kbd> liên tục ở Thớt để <b>cắt hẹ</b>', onBoard);
    if (onBoard) return step('Cầm hẹ (<kbd>E</kbd>) đặt lên Thớt để cắt', onBoard);
    const dirty = withItem((it) => it.type === type && !it.s.washed);
    if (dirty?.kind === 'sink') return step(`Giữ <kbd>Chuột trái</kbd> ở Bồn rửa để <b>rửa ${name.toLowerCase()}</b>`, dirty);
    if (dirty) return step(`Cầm ${name.toLowerCase()} (<kbd>E</kbd>) đặt vào Bồn rửa`, dirty);
    return step(`Lấy <b>${name}</b> ở Tủ lạnh (nhớ đảo chảo!)`, fridge);
  }

  if (w.noodle.cook < ZONES.noodle[0]) {
    return step(`<kbd>Click</kbd> đảo chảo tới khi Bánh lọt vào vùng xanh (đang ${Math.round(w.noodle.cook)}%, cần 75–90%)`, wokSt);
  }
  if (heat > 0) return step('Món đã chín! <b>Tắt bếp</b> (<kbd>lăn chuột xuống</kbd>) rồi lấy đĩa', wokSt);
  return step('Lấy <b>đĩa</b> ở Chồng đĩa (<kbd>E</kbd>), rồi nhấn <kbd>E</kbd> vào chảo để múc', plates);
}

/** Mũi tên vàng nhấp nhô trên trạm cần tới. */
export class GuideArrow {
  constructor(scene) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffc94a, depthTest: false, transparent: true, opacity: 0.95 });
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.34, 18), m);
    cone.rotation.x = Math.PI; // mũi nhọn chĩa xuống
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 12), m);
    stem.position.y = 0.3;
    g.add(cone, stem);
    g.renderOrder = 20;
    g.children.forEach((c) => (c.renderOrder = 20));
    g.visible = false;
    scene.add(g);
    this.group = g;
  }
  update(target, t) {
    if (!target) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const p = target.group.position;
    this.group.position.set(p.x, target.height + 0.6 + Math.sin(t * 4) * 0.08, p.z);
    this.group.rotation.y = t * 2;
  }
}
