/**
 * Real-Time EventSource / SSE Client
 */
class RealtimeStream {
  constructor() {
    this.source = null;
    this.listeners = new Map();
  }

  connect() {
    const token = API.getToken();
    if (!token) return;

    if (this.source) {
      this.source.close();
    }

    this.source = new EventSource(`/api/messages/stream?token=${encodeURIComponent(token)}`);

    this.source.addEventListener('open', () => {
      console.log('[SSE] Real-time event stream connected.');
      this.updateStatusBadge(true);
    });

    this.source.addEventListener('error', (err) => {
      console.warn('[SSE] Stream disconnected, retrying...', err);
      this.updateStatusBadge(false);
    });

    this.source.addEventListener('new_sms', (e) => {
      const data = JSON.parse(e.data);
      this.trigger('new_sms', data);
    });

    this.source.addEventListener('rental_renewed', (e) => {
      const data = JSON.parse(e.data);
      this.trigger('rental_renewed', data);
    });

    this.source.addEventListener('rental_expired', (e) => {
      const data = JSON.parse(e.data);
      this.trigger('rental_expired', data);
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  trigger(event, data) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(fn => fn(data));
  }

  updateStatusBadge(isConnected) {
    const badge = document.getElementById('sse-status-indicator');
    if (badge) {
      if (isConnected) {
        badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:6px;box-shadow:0 0 8px #10b981;"></span>Live Stream Connected`;
        badge.className = 'badge badge-success';
      } else {
        badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;margin-right:6px;"></span>Reconnecting...`;
        badge.className = 'badge badge-warning';
      }
    }
  }

  disconnect() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }
}

const realtime = new RealtimeStream();
