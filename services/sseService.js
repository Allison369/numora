/**
 * Server-Sent Events (SSE) Hub
 * Manages active real-time connections per user for instant SMS delivery and balance alerts
 */

class SSEService {
  constructor() {
    this.clients = new Map(); // Map<userId, Set<responseObject>>
  }

  addClient(userId, res) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(res);

    res.on('close', () => {
      const userConns = this.clients.get(userId);
      if (userConns) {
        userConns.delete(res);
        if (userConns.size === 0) {
          this.clients.delete(userId);
        }
      }
    });
  }

  sendToUser(userId, eventType, data) {
    const userConns = this.clients.get(userId);
    if (!userConns || userConns.size === 0) return;

    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of userConns) {
      try {
        res.write(payload);
      } catch (err) {
        console.error(`[SSE] Failed writing to client for user ${userId}:`, err.message);
      }
    }
  }

  broadcast(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [userId, userConns] of this.clients.entries()) {
      for (const res of userConns) {
        try {
          res.write(payload);
        } catch (err) {
          // ignore closed connections
        }
      }
    }
  }
}

const sseService = new SSEService();
module.exports = sseService;
