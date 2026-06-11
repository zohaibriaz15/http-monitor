'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const logger = require('../logger');

// Manages WebSocket clients and fan-out of monitor events. Attaches to an
// existing HTTP server on the /ws path so REST and WS share one port.
class Broadcaster {
  constructor() {
    this.wss = null;
    this.heartbeat = null;
  }

  attach(httpServer, { path = '/ws' } = {}) {
    this.wss = new WebSocketServer({ server: httpServer, path });

    this.wss.on('connection', (socket) => {
      socket.isAlive = true;
      socket.on('pong', () => {
        socket.isAlive = true;
      });
      socket.on('error', (err) => logger.error('WebSocket client error', err.message));

      // Greet the client so it can confirm the channel is live.
      this.send(socket, { type: 'connected', data: { at: new Date().toISOString() } });
      logger.info(`WebSocket client connected (total: ${this.wss.clients.size})`);

      socket.on('close', () => {
        // This can fire asynchronously during shutdown, after close() has
        // already torn down the server — guard against a null wss.
        const total = this.wss ? this.wss.clients.size : 0;
        logger.info(`WebSocket client disconnected (total: ${total})`);
      });
    });

    // Drop dead connections that didn't answer the last ping.
    this.heartbeat = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((socket) => {
        if (socket.isAlive === false) return socket.terminate();
        socket.isAlive = false;
        socket.ping();
      });
    }, 30000);
    this.heartbeat.unref?.();

    return this;
  }

  send(socket, message) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  // Push a message to every connected client.
  broadcast(message) {
    if (!this.wss) return 0;
    const payload = JSON.stringify(message);
    let sent = 0;
    this.wss.clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
        sent += 1;
      }
    });
    return sent;
  }

  get clientCount() {
    return this.wss ? this.wss.clients.size : 0;
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.wss) {
      this.wss.clients.forEach((socket) => socket.terminate());
      this.wss.close();
      this.wss = null;
    }
  }
}

module.exports = { Broadcaster };
