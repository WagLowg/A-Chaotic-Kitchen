// A Chaotic Kitchen – máy chủ web + phòng chơi online.
// - Phục vụ file game (HTML/JS/CSS).
// - WebSocket /ws: chia phòng theo mã 4 ký tự. Máy Host (chủ quán) chạy toàn bộ logic game;
//   máy chủ chỉ chuyển tin: khách → Host (kèm `from`), Host → tất cả khách (hoặc 1 người qua `to`).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const MAX_PLAYERS = 4;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const BLOCKED = ['node_modules', '.claude', 'server.js', 'package.json', 'package-lock.json'];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || BLOCKED.some((b) => rel === b || rel.startsWith(b + path.sep))) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ---------- Phòng chơi ----------
const rooms = new Map(); // code → { host, clients: Map<id, ws> }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let nextId = 1;

function newCode() {
  let c;
  do {
    c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(c));
  return c;
}
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1 << 20 });

wss.on('connection', (ws) => {
  ws.id = nextId++;
  ws.on('message', (raw) => {
    const text = raw.toString();
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }

    if (m.t === 'create') {
      if (ws.room) return;
      const code = newCode();
      rooms.set(code, { host: ws, clients: new Map() });
      ws.room = code;
      ws.isHost = true;
      send(ws, { t: 'created', code, id: ws.id, ips: lanIPs(), port: PORT });
      console.log(`[phòng ${code}] Host tạo phòng`);
      return;
    }

    if (m.t === 'join') {
      if (ws.room) return;
      const code = String(m.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', msg: `Không tìm thấy phòng ${code}` });
      if (room.clients.size >= MAX_PLAYERS - 1) return send(ws, { t: 'error', msg: 'Phòng đã đủ 4 người' });
      room.clients.set(ws.id, ws);
      ws.room = code;
      send(ws, { t: 'joined', id: ws.id, code });
      send(room.host, { t: 'peerJoin', from: ws.id, name: String(m.name || 'Bạn').slice(0, 14) });
      console.log(`[phòng ${code}] +1 người (${room.clients.size + 1}/${MAX_PLAYERS})`);
      return;
    }

    const room = rooms.get(ws.room);
    if (!room) return;
    if (ws.isHost) {
      if (m.to != null) {
        send(room.clients.get(m.to), text);
      } else {
        for (const c of room.clients.values()) {
          // Bỏ qua bản cập nhật trạng thái nếu mạng của người đó đang nghẽn
          if (m.t === 'state' && c.bufferedAmount > 256 * 1024) continue;
          send(c, text);
        }
      }
    } else {
      m.from = ws.id;
      send(room.host, m);
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.room);
    if (!room) return;
    if (ws.isHost) {
      for (const c of room.clients.values()) send(c, { t: 'hostLeft' });
      rooms.delete(ws.room);
      console.log(`[phòng ${ws.room}] Host rời – đóng phòng`);
    } else {
      room.clients.delete(ws.id);
      send(room.host, { t: 'peerLeave', from: ws.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`A Chaotic Kitchen: http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`  Cùng mạng Wi-Fi: http://${ip}:${PORT}`);
});
