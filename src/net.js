// Kết nối WebSocket tới máy chủ phòng chơi.
export class Net {
  constructor() {
    this.ws = null;
    this.onMessage = null;
    this.onClose = null;
    this.waiters = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      let ws;
      try {
        ws = new WebSocket(`${proto}://${location.host}/ws`);
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      const to = setTimeout(() => {
        reject(new Error('Hết thời gian kết nối'));
        ws.close();
      }, 6000);
      ws.onopen = () => {
        clearTimeout(to);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(to);
        reject(new Error('Không kết nối được máy chủ'));
      };
      ws.onmessage = (e) => {
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        const i = this.waiters.findIndex((w) => w.types.includes(m.t));
        if (i >= 0) {
          const [w] = this.waiters.splice(i, 1);
          w.resolve(m);
          return;
        }
        this.onMessage?.(m);
      };
      ws.onclose = () => this.onClose?.();
    });
  }
  waitFor(types, ms = 6000) {
    return new Promise((resolve, reject) => {
      const w = { types, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error('Máy chủ không phản hồi'));
        }
      }, ms);
    });
  }
  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }
}
