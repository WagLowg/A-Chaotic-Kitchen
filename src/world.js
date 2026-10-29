import * as THREE from 'three';
import { box, cyl, sphere, mat, canvasTexture } from './util.js';
import { Station } from './stations.js';

// Kích thước quán: x ∈ [-6, 6], z ∈ [-8, 8]. Bếp ở phía sau (z < -1.6), khu ăn ở phía trước.
export const ROOM = { minX: -6, maxX: 6, minZ: -8, maxZ: 8, h: 3.2, passZ: -1.6, doorX: 4.3 };

export function buildWorld(scene) {
  const stations = [];
  const colliders = [];
  const tables = [];

  addLights(scene);
  addRoom(scene, colliders);

  const add = (st, x, z, col) => {
    st.group.position.set(x, 0, z);
    scene.add(st.group);
    st.index = stations.length; // mọi máy dựng cùng thứ tự → dùng chỉ số này để gửi qua mạng
    stations.push(st);
    colliders.push(col || { minX: x - st.w / 2, maxX: x + st.w / 2, minZ: z - st.d / 2, maxZ: z + st.d / 2 });
    return st;
  };

  // ---- Dãy sát tường sau ----
  add(new Station('source', 'Kệ khô', 1.2, 0.55, { variant: 'pantry', options: [
    { type: 'rice_flour', label: 'Bột gạo', stock: true },
    { type: 'tapioca', label: 'Bột năng', stock: true },
  ] }), -5.2, -7.55);
  add(new Station('source', 'Kệ gia vị', 1.0, 0.6, { variant: 'spice', options: [
    { type: 'oil', label: 'Chai dầu ăn' },
    { type: 'fishsauce', label: 'Chai nước mắm' },
    { type: 'pepper', label: 'Lọ tiêu' },
  ] }), -4.0, -7.5);
  add(new Station('source', 'Tủ lạnh', 1.1, 0.7, { variant: 'fridge', options: [
    { type: 'shrimp', label: 'Tôm', stock: true },
    { type: 'bean', label: 'Giá đỗ', stock: true },
    { type: 'chive', label: 'Hẹ', stock: true },
  ] }), -2.85, -7.5);
  add(new Station('source', 'Tủ đông', 1.0, 0.7, { variant: 'freezer', options: [{ type: 'ice', label: 'Đá viên' }] }), -1.7, -7.5);
  add(new Station('sink', 'Bồn rửa', 1.5, 0.7, { accepts: ['shrimp', 'bean', 'chive', 'plate'] }), -0.35, -7.5);
  add(new Station('stove', 'Bếp 1', 1.2, 0.7, { accepts: ['pot', 'wok'] }), 1.15, -7.5);
  const stove2 = add(new Station('stove', 'Bếp 2', 1.2, 0.7, { accepts: ['pot', 'wok'] }), 2.4, -7.5);
  const backC = add(new Station('counter', 'Quầy', 1.1, 0.7), 3.6, -7.5);
  add(new Station('counter', 'Quầy', 1.1, 0.7), 4.75, -7.5);
  add(new Station('trash', 'Thùng rác', 0.5, 0.5), 5.6, -7.5);

  // ---- Đảo bếp giữa ----
  const IZ = -4.7;
  add(new Station('board', 'Thớt', 1.0, 0.9, { accepts: ['shrimp', 'chive'], wood: true }), -3.4, IZ);
  add(new Station('board', 'Thớt', 1.0, 0.9, { accepts: ['shrimp', 'chive'], wood: true }), -2.35, IZ);
  const islandA = add(new Station('counter', 'Quầy sơ chế', 1.0, 0.9, { wood: true }), -1.3, IZ);
  const islandB = add(new Station('counter', 'Quầy sơ chế', 1.0, 0.9, { wood: true }), -0.25, IZ);
  add(new Station('press', 'Khuôn ép bánh lọt', 1.1, 0.9, { accepts: ['basin'] }), 0.85, IZ);
  add(new Station('tray', 'Khay để ráo', 1.1, 0.9), 2.0, IZ);
  add(new Station('counter', 'Quầy sơ chế', 1.0, 0.9, { wood: true }), 3.1, IZ);

  // ---- Quầy ra món (ngăn bếp và khu ăn) ----
  const PZ = ROOM.passZ;
  const deco = box(4.9, 0.9, 0.7, 0x8e5b37, { roughness: 0.7 });
  deco.position.set(-3.45, 0.45, PZ);
  const decoTop = box(4.92, 0.04, 0.72, 0xe1e5e9, { metalness: 0.5, roughness: 0.3 });
  decoTop.position.set(-3.45, 0.9, PZ);
  scene.add(deco, decoTop);
  colliders.push({ minX: -5.9, maxX: -1.0, minZ: PZ - 0.35, maxZ: PZ + 0.35 });
  for (let i = 0; i < 4; i++) {
    const c = cyl(0.04, 0.035, 0.12, 0xd64541, 10);
    c.position.set(-5.4 + i * 1.2, 0.98, PZ);
    const sticks = box(0.01, 0.2, 0.01, 0xd9b77a);
    sticks.position.set(-5.4 + i * 1.2, 1.06, PZ);
    scene.add(c, sticks);
  }
  add(new Station('bell', 'Chuông mở cửa', 1.1, 0.7, { wood: true }), -0.45, PZ);
  add(new Station('counter', 'Quầy ra món', 1.1, 0.7, { wood: true }), 0.65, PZ);
  add(new Station('plates', 'Chồng đĩa', 1.2, 0.7, { plates: 5, wood: true }), 1.8, PZ);

  // ---- Bàn khách ----
  [[-4.2, 1.2], [-1.4, 1.2], [-4.2, 4.6], [-1.4, 4.6]].forEach(([x, z], i) => {
    const t = add(new Station('table', `Bàn ${i + 1}`, 0.9, 0.7), x, z,
      { minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.95, maxZ: z + 0.95 });
    t.tx = x;
    t.tz = z;
    tables.push(t);
  });

  return {
    stations,
    colliders,
    tables,
    stationGroups: stations.map((s) => s.group),
    homes: { pot: islandA, basin: islandB, wok1: stove2, wok2: backC },
  };
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x6a5a48, 1.4));
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.5);
  sun.position.set(4, 12, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 30;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const lampM = new THREE.MeshBasicMaterial({ color: 0xfff2d6 });
  for (const [x, z] of [[-3, -5.5], [1.5, -5.5], [-3, 2.8], [0.5, 4]]) {
    const l = new THREE.PointLight(0xffe2b8, 8, 10, 1.6);
    l.position.set(x, 2.95, z);
    const lamp = cyl(0.35, 0.35, 0.04, lampM, 20);
    lamp.castShadow = false;
    lamp.position.set(x, 3.17, z);
    scene.add(l, lamp);
  }
}

function tileTexture(c1, c2, n, size = 512, grout = 'rgba(0,0,0,0.15)') {
  const t = canvasTexture(size, size, (x, w) => {
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        x.fillStyle = (i + j) % 2 ? c1 : c2;
        x.fillRect(i * s, j * s, s, s);
      }
    }
    x.strokeStyle = grout;
    x.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, w); x.stroke();
      x.beginPath(); x.moveTo(0, i * s); x.lineTo(w, i * s); x.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function woodTexture() {
  const t = canvasTexture(512, 512, (x, w, h) => {
    const rows = 8;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r * 137) % w;
      for (let k = -2; k < 2; k++) {
        const shade = 150 + ((r * 31 + k * 17) % 40);
        x.fillStyle = `rgb(${shade},${Math.round(shade * 0.68)},${Math.round(shade * 0.42)})`;
        x.fillRect(off + k * 256, r * rh, 256, rh);
        x.fillStyle = 'rgba(0,0,0,0.25)';
        x.fillRect(off + k * 256, r * rh, 2, rh);
      }
      x.fillStyle = 'rgba(0,0,0,0.3)';
      x.fillRect(0, r * rh, w, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function addRoom(scene, colliders) {
  const { minX, maxX, minZ, maxZ, h, passZ } = ROOM;
  const W = maxX - minX;

  // Sàn
  const kTex = tileTexture('#e9ecef', '#c9d2da', 8);
  kTex.repeat.set(W / 4, (passZ - minZ) / 4);
  const kFloor = new THREE.Mesh(new THREE.PlaneGeometry(W, passZ - minZ), new THREE.MeshStandardMaterial({ map: kTex, roughness: 0.6 }));
  kFloor.rotation.x = -Math.PI / 2;
  kFloor.position.set(0, 0, (minZ + passZ) / 2);
  kFloor.receiveShadow = true;
  const dTex = woodTexture();
  dTex.repeat.set(W / 4, (maxZ - passZ) / 4);
  const dFloor = new THREE.Mesh(new THREE.PlaneGeometry(W, maxZ - passZ), new THREE.MeshStandardMaterial({ map: dTex, roughness: 0.7 }));
  dFloor.rotation.x = -Math.PI / 2;
  dFloor.position.set(0, 0, (passZ + maxZ) / 2);
  dFloor.receiveShadow = true;
  scene.add(kFloor, dFloor);

  // Đường phố bên ngoài cửa
  const street = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9 }));
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, -0.01, maxZ + 6);
  street.receiveShadow = true;
  scene.add(street);

  // Trần
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, maxZ - minZ), new THREE.MeshStandardMaterial({ color: 0xf5efe6, roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, h, 0);
  scene.add(ceil);

  // Tường
  const wallKitchen = tileTexture('#ffffff', '#f1f4f6', 16, 512, 'rgba(0,0,0,0.08)');
  wallKitchen.repeat.set(W / 3, 1);
  const kitchenWallM = new THREE.MeshStandardMaterial({ map: wallKitchen, roughness: 0.5 });
  const diningWallM = new THREE.MeshStandardMaterial({ color: 0xf3dfb5, roughness: 0.85 });
  const wainM = new THREE.MeshStandardMaterial({ color: 0x4f7d5c, roughness: 0.7 });

  const wall = (w, hh, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const t = 0.2;
  wall(W + 2 * t, h, t, 0, h / 2, minZ - t / 2, kitchenWallM);
  // Tường bên: phần bếp lát gạch, phần khu ăn sơn vàng + ốp chân tường xanh
  for (const sx of [minX - t / 2, maxX + t / 2]) {
    const kd = passZ - minZ;
    wall(t, h, kd, sx, h / 2, minZ + kd / 2, kitchenWallM);
    const dd = maxZ - passZ;
    wall(t, h, dd, sx, h / 2, passZ + dd / 2, diningWallM);
    wall(t + 0.04, 1.0, dd, sx, 0.5, passZ + dd / 2, wainM);
  }
  // Tường trước có cửa ra vào (x 3.6 → 5.0)
  const d0 = 3.6, d1 = 5.0;
  wall(d0 - minX, h, t, (minX + d0) / 2, h / 2, maxZ + t / 2, diningWallM);
  wall(maxX - d1, h, t, (d1 + maxX) / 2, h / 2, maxZ + t / 2, diningWallM);
  wall(d1 - d0, h - 2.3, t, (d0 + d1) / 2, 2.3 + (h - 2.3) / 2, maxZ + t / 2, diningWallM);
  // Khung cửa
  const frameM = mat(0x6b4428);
  for (const x of [d0, d1]) {
    const f = box(0.08, 2.3, 0.26, frameM);
    f.position.set(x, 1.15, maxZ);
    scene.add(f);
  }
  // Cửa sổ
  const glass = new THREE.MeshBasicMaterial({ color: 0xbfe3ff });
  for (const x of [-4, -1]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), glass);
    g.position.set(x, 1.7, maxZ - 0.01);
    g.rotation.y = Math.PI;
    const fr = box(1.9, 1.3, 0.05, frameM);
    fr.position.set(x, 1.7, maxZ + 0.01);
    scene.add(fr, g);
  }

  // Va chạm tường (người chơi không ra khỏi quán)
  colliders.push(
    { minX: minX - 1, maxX: maxX + 1, minZ: minZ - 1, maxZ: minZ },
    { minX: minX - 1, maxX: maxX + 1, minZ: maxZ, maxZ: maxZ + 1 },
    { minX: minX - 1, maxX: minX, minZ: minZ - 1, maxZ: maxZ + 1 },
    { minX: maxX, maxX: maxX + 1, minZ: minZ - 1, maxZ: maxZ + 1 },
  );

  // Bảng hiệu trên quầy ra món
  const signTex = canvasTexture(1024, 256, (x, w, hh) => {
    x.fillStyle = '#b3261e';
    x.fillRect(0, 0, w, hh);
    x.strokeStyle = '#f2c94c';
    x.lineWidth = 10;
    x.strokeRect(12, 12, w - 24, hh - 24);
    x.fillStyle = '#f9d65c';
    x.textAlign = 'center';
    x.font = '800 92px "Be Vietnam Pro", "Segoe UI", sans-serif';
    x.fillText('A CHAOTIC KITCHEN', w / 2, 120);
    x.fillStyle = '#fff7ee';
    x.font = '600 50px "Be Vietnam Pro", "Segoe UI", sans-serif';
    x.fillText('Quán Bánh Lọt Xào Tôm', w / 2, 200);
  });
  const signM = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), signM);
  sign.position.set(-2.4, 2.55, passZ);
  scene.add(sign);
  const beam = box(12, 0.25, 0.25, 0x6b4428);
  beam.position.set(0, h - 0.125, passZ);
  scene.add(beam);

  // Bảng thực đơn trên tường trái khu ăn
  const menuTex = canvasTexture(768, 512, (x, w, hh) => {
    x.fillStyle = '#23302a';
    x.fillRect(0, 0, w, hh);
    x.strokeStyle = '#a8794e';
    x.lineWidth = 16;
    x.strokeRect(8, 8, w - 16, hh - 16);
    x.fillStyle = '#f9d65c';
    x.font = '800 64px "Be Vietnam Pro", sans-serif';
    x.textAlign = 'center';
    x.fillText('THỰC ĐƠN', w / 2, 90);
    x.fillStyle = '#ffffff';
    x.font = '600 44px "Be Vietnam Pro", sans-serif';
    x.textAlign = 'left';
    x.fillText('Bánh lọt xào tôm', 60, 190);
    x.textAlign = 'right';
    x.fillText('45.000đ', w - 60, 190);
    x.textAlign = 'left';
    x.fillStyle = '#9fb5a8';
    x.font = '500 34px "Be Vietnam Pro", sans-serif';
    ['Phở bò', 'Bánh xèo', 'Cơm tấm', 'Gỏi cuốn'].forEach((n, i) => x.fillText(`${n} — sắp có`, 60, 270 + i * 52));
  });
  const menuBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshStandardMaterial({ map: menuTex, roughness: 0.8 }));
  menuBoard.rotation.y = Math.PI / 2;
  menuBoard.position.set(minX + 0.02, 1.9, 3);
  scene.add(menuBoard);

  // Đèn lồng
  const lanternM = new THREE.MeshStandardMaterial({ color: 0xd8342a, emissive: 0x9a1a10, emissiveIntensity: 0.6, roughness: 0.6 });
  const goldM = mat(0xe0b040, { metalness: 0.8, roughness: 0.3 });
  for (const [x, z] of [[-4.2, 1.2], [-1.4, 1.2], [-4.2, 4.6], [-1.4, 4.6], [2.5, 2.5]]) {
    const g = new THREE.Group();
    const body = sphere(0.22, lanternM, undefined, 16, 12);
    body.scale.set(1, 1.15, 1);
    const capT = cyl(0.1, 0.1, 0.05, goldM, 12);
    capT.position.y = 0.26;
    const capB = capT.clone();
    capB.position.y = -0.26;
    const string = cyl(0.005, 0.005, 0.4, 0x222222, 4);
    string.position.y = 0.48;
    const tassel = cyl(0.02, 0.005, 0.18, 0xe0b040, 6);
    tassel.position.y = -0.38;
    g.add(body, capT, capB, string, tassel);
    g.position.set(x, h - 0.72, z);
    g.traverse((o) => (o.castShadow = false));
    scene.add(g);
  }

  // Chậu cây
  for (const [x, z] of [[-5.6, 7.5], [5.5, -0.9], [-5.6, -0.9], [2.9, 7.5]]) {
    const pot = cyl(0.22, 0.17, 0.4, 0xb5653a, 14);
    pot.position.set(x, 0.2, z);
    const leaves = sphere(0.38, mat(0x3f8f45), undefined, 12, 10);
    leaves.position.set(x, 0.75, z);
    leaves.scale.set(1, 1.3, 1);
    scene.add(pot, leaves);
    colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
  }
}
