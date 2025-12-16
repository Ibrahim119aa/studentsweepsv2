/*
Reusable socket client wrapper for the realtime app.
- Connects to a socket.io server.
- Sends token in handshake (auth) and performs a re-auth on reconnect by calling `auth:status`.
- Provides simple APIs: connect, setToken, on, off, emit, disconnect, getSocket, getUser.

Usage (Node):
const SocketClient = require('./frontend/socketClient');
const client = new SocketClient('http://localhost:4000');
client.setToken('<JWT>');
client.connect();
client.on('connect', () => console.log('connected'));
client.on('user:updated', (u) => console.log('user updated', u));

In browser (ESM) you can adapt the same interface when bundling.
*/

const { io } = require('socket.io-client');

class SocketClient {
  constructor(url, opts = {}) {
    this.url = url || (typeof window !== 'undefined' ? window.location.origin : 'https://www.studentsweeps.com');
    this.opts = opts;
    this.socket = null;
    this.token = null;
    this.user = null;
    this.cache = Object.create(null); // store last payloads for selected events
    this.connected = false;
    // allow subscribing to admin events only when explicitly enabled
    this.allowAdmin = !!opts.allowAdmin;

    // internal handlers bound for reconnect behavior
    this._onConnect = this._onConnect.bind(this);
    this._onDisconnect = this._onDisconnect.bind(this);
    this._onAuthStatusResponse = this._onAuthStatusResponse.bind(this);
  }

  setToken(token) {
    this.token = token;
    if (this.socket && this.socket.auth) {
      this.socket.auth.token = token;
    }
  }

  connect() {
    if (this.socket) return this.socket;

    const opts = Object.assign({}, this.opts, { auth: { token: this.token } });
    this.socket = io(this.url, opts);

    // register common handlers
    this.socket.on('connect', this._onConnect);
    this.socket.on('disconnect', this._onDisconnect);
    this.socket.on('auth:status:response', this._onAuthStatusResponse);

    // preserve user:updated listener for convenience
    // subscribe to a curated set of user-facing events (no admin events)
    const DEFAULT_USER_EVENTS = [
      'auth:login:success',
      'auth:signup:success',
      'auth:status:response',
      'auth:forgotPassword:response',
      'user:updated',
      'message:notify',
      'stats:update',
      'donations:list:response',
      'donation:purchase:invoice',
      'donation:purchase:created',
      'donation:purchase:error',
      'entries:purchase:invoice',
      'entries:purchase:created',
      'entries:myTransactions:response',
      'paymentOptions:list:response',
      'paymentOptions:get:response',
      'prizes:list:response',
      'prizes:get:response',
      'draw:history:response',
      'draw:result:ack',
      'newsletter:subscribe:response',
      'settings:get:response'
    ];

    DEFAULT_USER_EVENTS.forEach((ev) => {
      this.socket.on(ev, (payload) => {
        // cache some events for quick access
        if (ev === 'user:updated') this.user = payload || this.user;
        if (ev === 'auth:login:success' || ev === 'auth:signup:success') {
          if (payload && payload.token) this.setToken(payload.token);
          if (payload && payload.user) this.user = payload.user;
        }
        if (ev === 'prizes:list:response' && payload && payload.prizes) this.cache.prizes = payload.prizes;
        if (ev === 'paymentOptions:list:response' && payload && payload.paymentOptions) this.cache.paymentOptions = payload.paymentOptions;
        if (ev === 'donations:list:response' && payload && payload.donations) this.cache.donations = payload.donations;
        if (ev === 'entries:myTransactions:response' && payload && payload.transactions) this.cache.transactions = payload.transactions;
        if (ev === 'entries:purchase:created' && payload && payload.trxID) this.cache.lastTrxID = payload.trxID;

        // re-emit so consumers using client.on still receive events
        try { this.socket.emit(`_internal:relay:${ev}`, payload); } catch (e) { /* ignore */ }
      });
    });

    return this.socket;
  }

  _onConnect() {
    this.connected = true;
    // attempt to re-auth / rejoin using token (server's auth:status will join the socket to user room)
    try {
      if (this.token) {
        // server accepts token in handshake or via payload for back-compat
        this.socket.emit('auth:status', { token: this.token });
      }
    } catch (e) {
      // ignore
    }
  }

  _onDisconnect() {
    this.connected = false;
  }

  _onAuthStatusResponse(payload) {
    // payload: { success, valid, data, user }
    if (payload && payload.success && payload.valid) {
      if (payload.user) this.user = payload.user;
    } else {
      // invalid token => clear stored user
      this.user = null;
    }
  }

  on(event, cb) {
    if (!this.socket) this.connect();
    // hard block admin events unless allowAdmin is set
    const ADMIN_PATTERNS = [/^admin:/, /^prizes:(new|update|delete)/, /^paymentOptions:(new|update|delete|setEnabled)/, /^settings:(update|setBotChance)/, /^orders:/, /^draw:start/];
    if (!this.allowAdmin) {
      for (let p of ADMIN_PATTERNS) {
        if (p.test(event)) {
          throw new Error(`Subscription to admin event "${event}" is blocked. Set allowAdmin=true when creating SocketClient to allow admin subscriptions.`);
        }
      }
    }

    // allow listening to relayed events from the internal subscription as well
    // internal relays are emitted on `_internal:relay:${event}` so we register both
    this.socket.on(event, cb);
    this.socket.on(`_internal:relay:${event}`, cb);
  }

  off(event, cb) {
    if (!this.socket) return;
    if (cb) this.socket.off(event, cb);
    else this.socket.removeAllListeners(event);
  }

  emit(event, payload) {
    if (!this.socket) this.connect();
    this.socket.emit(event, payload);
  }

  getSocket() {
    return this.socket;
  }

  getUser() {
    return this.user;
  }

  // get cached last payload for some events (prizes, paymentOptions, etc.)
  getCache(key) {
    return this.cache ? this.cache[key] : undefined;
  }

  disconnect() {
    if (!this.socket) return;
    try {
      this.socket.off('connect', this._onConnect);
      this.socket.off('disconnect', this._onDisconnect);
      this.socket.close();
    } catch (e) {
      // ignore
    }
    this.socket = null;
    this.connected = false;
  }
}

module.exports = SocketClient;
