// Multijugador P2P con PeerJS: el anfitrión crea una sala con código y los demás se unen
import { THREE, scene, V3, G, lerp, wrapAngle, labelTex, toast, hexCss } from './core.js';
import { byId, makeVehicleMesh, poseCar, newCar, carCollide } from './vehicles.js';
import { save, SKINS } from './state.js';

const PREFIX = 'neonrider-v2-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const net = { role: null, code: '', peer: null, conns: new Map(), host: null, myId: '', status: '', remotes: new Map(), chat: [], onChange: null };

function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar PeerJS'));
    document.head.appendChild(s);
  });
}
const me = () => ({ name: save.name, banda: save.banda, veh: save.current, skin: save.skin });
const changed = () => net.onChange && net.onChange();
const setStatus = s => { net.status = s; changed(); };

export async function hostLobby() {
  await loadPeer(); leave(true);
  net.code = Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  setStatus('Creando sala…');
  const peer = new window.Peer(PREFIX + net.code);
  net.peer = peer; net.role = 'host';
  peer.on('open', id => { net.myId = id; setStatus('Sala abierta. Pasa el código a tus amigos.'); });
  peer.on('connection', conn => {
    conn.on('open', () => { net.conns.set(conn.peer, conn); });
    conn.on('data', d => onHostData(conn, d));
    conn.on('close', () => dropPlayer(conn.peer));
    conn.on('error', () => dropPlayer(conn.peer));
  });
  peer.on('error', e => { if (e.type === 'unavailable-id') return hostLobby(); setStatus('Error: ' + (e.type || e.message)); });
}
export async function joinLobby(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { setStatus('El código tiene 5 letras.'); return; }
  await loadPeer(); leave(true);
  setStatus('Conectando a ' + code + '…');
  const peer = new window.Peer();
  net.peer = peer; net.role = 'client'; net.code = code;
  peer.on('open', id => {
    net.myId = id;
    const conn = peer.connect(PREFIX + code, { reliable: false, serialization: 'json' });
    net.host = conn;
    const to = setTimeout(() => { if (!conn.open) setStatus('No encuentro esa sala. ¿Código bien escrito?'); }, 9000);
    conn.on('open', () => { clearTimeout(to); conn.send({ t: 'hello', ...me() }); setStatus('Conectado a la sala ' + code); });
    conn.on('data', onClientData);
    conn.on('close', () => { setStatus('El anfitrión ha cerrado la sala.'); clearRemotes(); net.role = null; });
  });
  peer.on('error', e => setStatus(e.type === 'peer-unavailable' ? 'No existe la sala ' + code : 'Error: ' + (e.type || e.message)));
}
export function leave(silent) {
  try { net.peer && net.peer.destroy(); } catch (e) {}
  net.peer = null; net.role = null; net.host = null; net.conns.clear(); clearRemotes();
  if (!silent) setStatus('');
}

// ---------- jugadores remotos ----------
function clearRemotes() { for (const r of net.remotes.values()) disposeRemote(r); net.remotes.clear(); changed(); }
function disposeRemote(r) { scene.remove(r.car.mesh); scene.remove(r.tag); }
function dropPlayer(id) {
  net.conns.delete(id);
  const r = net.remotes.get(id); if (r) { toast(`👋 ${r.info.name} se ha ido`); disposeRemote(r); net.remotes.delete(id); }
  broadcastRoster(); changed();
}
function makeRemote(id, info) {
  const old = net.remotes.get(id);
  if (old && old.info.veh === info.veh && old.info.skin === info.skin && JSON.stringify(old.info.banda) === JSON.stringify(info.banda)) { old.info = info; return old; }
  if (old) disposeRemote(old);
  const hex = (SKINS.find(s => s.id === info.skin) || SKINS[0]).hex;
  const mesh = makeVehicleMesh(byId(info.veh), hex);
  const car = newCar(mesh, 50); scene.add(mesh);
  const bandaHex = info.banda ? parseInt(String(info.banda.color || '#ff2bd6').slice(1), 16) : hex;
  const label = (info.banda ? `[${info.banda.tag}] ` : '') + info.name;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(label, bandaHex), depthWrite: false, depthTest: false, transparent: true }));
  tag.scale.set(9, 1.7, 1); tag.renderOrder = 5; scene.add(tag);
  const r = { id, info, car, tag, target: { x: 0, z: 0, h: 0, vf: 0, st: 0, b: 0, w: 0 }, seen: false };
  net.remotes.set(id, r); changed();
  return r;
}
function applyState(id, s) {
  const r = net.remotes.get(id); if (!r) return;
  const [x, z, h, vf, st, b, w] = s;
  Object.assign(r.target, { x, z, h, vf, st, b, w });
  if (!r.seen) { r.seen = true; r.car.pos.set(x, 0, z); r.car.h = h; }
}

// ---------- anfitrión ----------
function onHostData(conn, d) {
  if (d.t === 'hello') {
    makeRemote(conn.peer, { name: String(d.name).slice(0, 16), banda: d.banda, veh: d.veh, skin: d.skin });
    toast(`🟢 ${String(d.name).slice(0, 16)} se ha unido`);
    broadcastRoster();
  } else if (d.t === 's') applyState(conn.peer, d.s);
  else if (d.t === 'chat') { const m = { from: (net.remotes.get(conn.peer) || {}).info?.name || '?', m: String(d.m).slice(0, 120) }; pushChat(m); sendAll({ t: 'chat', ...m }); }
}
function roster() {
  const list = [{ id: net.myId, ...me() }];
  for (const [id, r] of net.remotes) list.push({ id, ...r.info });
  return list;
}
function broadcastRoster() { sendAll({ t: 'roster', list: roster() }); }
function sendAll(msg, except) { for (const [id, c] of net.conns) if (c.open && id !== except) c.send(msg); }

// ---------- cliente ----------
function onClientData(d) {
  if (d.t === 'roster') {
    const ids = new Set();
    for (const p of d.list) { if (p.id === net.myId) continue; ids.add(p.id); makeRemote(p.id, p); }
    for (const id of [...net.remotes.keys()]) if (!ids.has(id)) { disposeRemote(net.remotes.get(id)); net.remotes.delete(id); }
    changed();
  } else if (d.t === 'ss') { for (const id in d.s) if (id !== net.myId) applyState(id, d.s[id]); }
  else if (d.t === 'chat') pushChat(d);
}

export function sendChat(text) {
  text = String(text || '').trim().slice(0, 120); if (!text || !net.role) return;
  const m = { from: save.name, m: text };
  if (net.role === 'host') { pushChat(m); sendAll({ t: 'chat', ...m }); }
  else if (net.host && net.host.open) net.host.send({ t: 'chat', m: text });
}
function pushChat(m) { net.chat.push(m); if (net.chat.length > 6) net.chat.shift(); changed(); }
export function announceMe() { // cambio de coche/color/banda
  if (net.role === 'client' && net.host && net.host.open) net.host.send({ t: 'hello', ...me() });
  if (net.role === 'host') broadcastRoster();
}

// ---------- bucle ----------
let sendT = 0;
export function updateNet(dt) {
  if (!net.role) return;
  const P = G.player;
  const mine = [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2), +P.h.toFixed(3), +P.vf.toFixed(1), +P.steerVis.toFixed(2), P.isBoost ? 1 : 0, P.wheelie ? 1 : 0];
  sendT += dt;
  if (sendT > 0.08) {
    sendT = 0;
    if (net.role === 'client' && net.host && net.host.open) net.host.send({ t: 's', s: mine });
    if (net.role === 'host') {
      const s = { [net.myId]: mine };
      for (const [id, r] of net.remotes) { const t = r.target; s[id] = [t.x, t.z, t.h, t.vf, t.st, t.b, t.w]; }
      sendAll({ t: 'ss', s });
    }
  }
  for (const r of net.remotes.values()) {
    const c = r.car, t = r.target, k = 1 - Math.exp(-10 * dt);
    // predicción simple + suavizado
    t.x += Math.sin(t.h) * t.vf * dt; t.z += Math.cos(t.h) * t.vf * dt;
    c.pos.x = lerp(c.pos.x, t.x, k); c.pos.z = lerp(c.pos.z, t.z, k);
    c.h += wrapAngle(t.h - c.h) * k; c.vf = t.vf; c.steerVis = t.st; c.wheelie = !!t.w; c.wt += dt;
    c.vel.set(Math.sin(c.h) * c.vf, 0, Math.cos(c.h) * c.vf);
    poseCar(c, dt);
    r.tag.position.set(c.pos.x, 4.6, c.pos.z);
    if (G.state.mode === 'play') carCollide(P, c, P.radius + 2);
  }
}
export function remoteList() { return [...net.remotes.values()]; }
export { hexCss };
