import { WS_URL, RECONNECT_DELAY_MS, STATE_SYNC_INTERVAL_MS } from './constants.js';

let socket = null;
let roomCode = null;
let handlers = {};
let openCb = null;
let closeCb = null;
let syncInterval = null;
let reconnectTimer = null;

export function connect(onOpen, onClose) {
  openCb  = onOpen;
  closeCb = onClose;
  _open();
}

function _open() {
  try {
    socket = new WebSocket(WS_URL);
  } catch (e) {
    console.warn('[pool/network] WebSocket open failed:', e);
    reconnectTimer = setTimeout(_open, RECONNECT_DELAY_MS);
    return;
  }

  socket.onopen = () => {
    if (openCb) openCb();
  };

  socket.onclose = () => {
    if (closeCb) closeCb();
    reconnectTimer = setTimeout(_open, RECONNECT_DELAY_MS);
  };

  socket.onerror = () => { /* close fires after error */ };

  socket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    // Filter by room code — discard messages for other rooms
    if (roomCode && msg.roomCode !== roomCode) return;
    const handler = handlers[msg.type];
    if (handler) handler(msg);
  };
}

export function send(msg) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ ...msg, roomCode }));
}

export function on(type, handler) {
  handlers[type] = handler;
}

export function off(type) {
  delete handlers[type];
}

export function setRoomCode(code) {
  roomCode = code;
}

export function getRoomCode() {
  return roomCode;
}

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function createRoom(playerName) {
  const code = randomCode(6);
  setRoomCode(code);
  send({ type: 'create_room', playerName });
  return code;
}

export function joinRoom(code, playerName) {
  setRoomCode(code);
  send({ type: 'join_room', playerName });
}

export function sendShot(angle, power, tipOffsetX, tipOffsetY) {
  send({ type: 'opponent_shot', angle, power, tipOffsetX, tipOffsetY });
}

export function startStateSync(getSnapshotFn) {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    const snap = getSnapshotFn();
    send({ type: 'state_sync', snapshot: snap });
  }, STATE_SYNC_INTERVAL_MS);
}

export function stopStateSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

export function disconnect() {
  stopStateSync();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  roomCode = null;
  handlers  = {};
}
