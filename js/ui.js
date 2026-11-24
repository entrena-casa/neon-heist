// Interfaz: HUD, minimapa, mapa grande, garaje (coches, mejoras, colores, banda) y sala multijugador
import { $, G, V3, fmt, clamp, hexCss, isTouch } from './core.js';
import { N, CELL, BLOCK, EDGE, blockType, DISTRICTS, districtAt } from './world.js';
import { CATALOG, byId } from './vehicles.js';
import { state, save, U, UPG, lvl, upCost, SKINS, RANKS, rankIdx, spend, persist, earn } from './state.js';
import { sfx } from './audio.js';
import { garages, banks, raceZones, bags, vault, gps } from './activities.js';
import { cops, heli } from './police.js';
import { traffic } from './traffic.js';
import { net, hostLobby, joinLobby, leave, remoteList, sendChat, announceMe } from './net.js';

// ================== HUD ==================
let hudT = 0, shown = save.wallet;
const starsEl = $('stars');
export function renderStars() {
  const esc = state.wanted > 0 && !state.seen && state.escapeT > 0.5;
  starsEl.className = esc ? 'escaping' : '';
  starsEl.innerHTML = Array.from({ length: 5 }, (_, i) => `<b class="${i < state.wanted ? 'on' : ''}">★</b>`).join('') + (esc ? '<small>ESCONDIDO · PIERDES A LA POLI…</small>' : '');
}
export function updateHUD(dt) {
  shown += (save.wallet - shown) * Math.min(1, dt * 6); if (Math.abs(save.wallet - shown) < 1) shown = save.wallet;
  hudT -= dt; if (hudT > 0) return; hudT = 0.06;
  const P = G.player;
  $('walletN').textContent = fmt(shown);
  const c = $('carried');
  c.textContent = state.carried > 0 || state.held > 0 ? `EN MANO ${fmt(state.carried)} · 🎒 ${state.held}/${U.cap}` : `🎒 ${state.held}/${U.cap}`;
  c.classList.toggle('full', state.held >= U.cap);
  $('district').textContent = DISTRICTS[districtAt(P.pos.x, P.pos.z)].name;
  $('kmh').textContent = Math.round(Math.abs(P.vf) * 4.2);
  $('nitro').style.width = state.nitro + '%';
  $('nitroWrap').classList.toggle('boost', !!P.isBoost);
  $('boostfx').classList.toggle('on', !!P.isBoost);
  $('bust').style.width = (state.busted * 100) + '%';
  $('bustWrap').classList.toggle('show', state.busted > 0.02);
  $('vignette').classList.toggle('on', state.busted > 0.25);
  $('combo').textContent = state.combo > 1 && state.time - state.comboT < 7 ? `COMBO x${state.combo}` : '';
  renderStars();
  // carrera
  const R = state.race, rh = $('raceHud');
  rh.classList.toggle('hidden', !R);
  if (R) {
    const t = R.count > 0 ? 0 : R.t, mm = Math.floor(t / 60), ss = (t % 60).toFixed(1).padStart(4, '0');
    $('racePos').textContent = R.count > 0 ? R.def.name : `${R.place || 1}º / ${R.racers.length + 1}`;
    $('raceSub').textContent = `CONTROL ${Math.min(R.idx + 1, R.cps.length)}/${R.cps.length} · ${mm}:${ss}`;
  }
  // aviso de abajo
  let pr = '';
  if (state.vaultMsg) pr = state.vaultMsg;
  else if (state.bankMsg) pr = state.bankMsg;
  else if (G.zone && !R) {
    const z = G.zone;
    if (state.wanted > 0) pr = '🚓 PIERDE A LA POLI PRIMERO';
    else if (z.type === 'garage') pr = `<kbd>E</kbd> ENTRAR · ${z.g.name}`;
    else if (z.type === 'race') pr = `<kbd>E</kbd> ${z.r.name} · PREMIO ${fmt(z.r.prize)}${save.races[z.r.name] ? ' · MEJOR: ' + save.races[z.r.name] + 'º' : ''}`;
  }
  const pe = $('prompt'); if (pe.innerHTML !== pr) pe.innerHTML = pr; pe.classList.toggle('show', !!pr);
  // multijugador
  if (net.role) {
    const list = remoteList();
    $('netHud').innerHTML = `<div class="who">SALA ${net.code} · ${list.length + 1} JUGADORES</div>` + net.chat.map(m => `<div><b>${esc(m.from)}:</b> ${esc(m.m)}</div>`).join('');
  } else $('netHud').innerHTML = '';
  drawMap();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ================== MINIMAPA ==================
const mapC = $('map'), mg = mapC.getContext('2d');
const DCOL = ['#2a1458', '#3a1020', '#3a1040', '#0e2048', '#33240c'];
function drawMap() {
  const W = mapC.width, R = 230, S = W / (R * 2), P = G.player, px = P.pos.x, pz = P.pos.z;
  mg.clearRect(0, 0, W, W); mg.save();
  mg.beginPath(); mg.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mg.clip();
  mg.fillStyle = '#0a0320'; mg.fillRect(0, 0, W, W);
  mg.translate(W / 2, W / 2); mg.rotate(Math.PI + P.h); mg.scale(-1, 1);
  const tx = x => (x - px) * S, tz = z => (z - pz) * S;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const x = i * CELL, z = j * CELL; if (Math.abs(x - px) > R + 40 || Math.abs(z - pz) > R + 40) continue;
    const bt = blockType[i + ',' + j];
    mg.fillStyle = bt === 1 ? '#0d3a1e' : bt === 2 ? '#3a2a6a' : DCOL[districtAt(x, z)];
    mg.fillRect(tx(x - BLOCK / 2), tz(z - BLOCK / 2), BLOCK * S, BLOCK * S);
  }
  mg.strokeStyle = '#ff2bd6'; mg.lineWidth = 2; mg.strokeRect(tx(-EDGE), tz(-EDGE), EDGE * 2 * S, EDGE * 2 * S);
  const dot = (x, z, r, c, glow = 8) => { mg.fillStyle = c; mg.shadowColor = c; mg.shadowBlur = glow; mg.beginPath(); mg.arc(tx(x), tz(z), r, 0, Math.PI * 2); mg.fill(); };
  const sq = (x, z, s, c) => { mg.fillStyle = c; mg.shadowColor = c; mg.shadowBlur = 10; mg.fillRect(tx(x) - s / 2, tz(z) - s / 2, s, s); };
  mg.shadowBlur = 0;
  for (const t of traffic) dot(t.pos.x, t.pos.z, 1.6, t.patrol ? '#4d7dff' : '#7a6aa0', 0);
  for (const b of bags) dot(b.position.x, b.position.z, b.userData.gold ? 4.5 : 3.5, b.userData.gold ? '#ffd200' : '#39ff88');
  for (const g of garages) sq(g.x, g.z, 9, '#00f0ff');
  for (const b of banks) sq(b.x, b.z, 9, '#ffc400');
  if (!state.race) for (const r of raceZones) sq(r.x, r.z, 9, '#ff2bd6');
  if (vault.active) { const on = Math.sin(G.t * 8) > 0; sq(vault.z.position.x, vault.z.position.z, on ? 12 : 9, '#ff2a4d'); }
  if (state.race) {
    const Rr = state.race; mg.strokeStyle = '#ff2bd6'; mg.lineWidth = 2.5; mg.shadowColor = '#ff2bd6'; mg.shadowBlur = 8;
    mg.beginPath(); mg.moveTo(tx(px), tz(pz)); for (let i = Rr.idx; i < Rr.cps.length; i++) mg.lineTo(tx(Rr.cps[i].x), tz(Rr.cps[i].z)); mg.stroke();
    for (const c of Rr.racers) dot(c.pos.x, c.pos.z, 3.5, '#ffffff');
  }
  if (gps.target) { sq(gps.target.x, gps.target.z, 8, '#7ff7ff'); }
  for (const r of remoteList()) dot(r.car.pos.x, r.car.pos.z, 4.5, r.info.banda?.color || '#ffffff');
  const blink = Math.sin(G.t * 18) > 0;
  for (const c of cops) if (!c.dead) dot(c.pos.x, c.pos.z, 4, blink ? '#ff2a4d' : '#2b6bff');
  if (heli.active) dot(heli.target.x, heli.target.z, 7, '#ffffff55', 0);
  mg.restore();
  mg.save(); mg.translate(W / 2, W / 2);
  mg.fillStyle = '#00f0ff'; mg.shadowColor = '#00f0ff'; mg.shadowBlur = 10;
  mg.beginPath(); mg.moveTo(0, -8); mg.lineTo(6, 7); mg.lineTo(0, 3); mg.lineTo(-6, 7); mg.closePath(); mg.fill();
  mg.restore();
}

// ================== MAPA GRANDE ==================
const bigC = $('bigC'), bg = bigC.getContext('2d');
const MAPR = EDGE + 10;
export function drawBigMap() {
  const W = bigC.width, S = W / (MAPR * 2), tx = x => (x + MAPR) * S, tz = z => (z + MAPR) * S;
  bg.fillStyle = '#07021a'; bg.fillRect(0, 0, W, W);
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const x = i * CELL, z = j * CELL, bt = blockType[i + ',' + j];
    bg.fillStyle = bt === 1 ? '#0d3a1e' : bt === 2 ? '#4a3a8a' : DCOL[districtAt(x, z)];
    bg.fillRect(tx(x - BLOCK / 2), tz(z - BLOCK / 2), BLOCK * S, BLOCK * S);
  }
  bg.strokeStyle = '#ff2bd6'; bg.lineWidth = 3; bg.strokeRect(tx(-EDGE), tz(-EDGE), EDGE * 2 * S, EDGE * 2 * S);
  // nombres de distrito
  bg.font = '700 16px Orbitron'; bg.textAlign = 'center'; bg.fillStyle = '#ffffffaa';
  [[0, 0], [300, -300], [-300, -300], [-300, 300], [300, 300]].forEach(([x, z]) => bg.fillText(DISTRICTS[districtAt(x, z)].name, tx(x), tz(z) + (x === 0 ? 34 : 0)));
  const icon = (x, z, c, txt) => { bg.fillStyle = c; bg.shadowColor = c; bg.shadowBlur = 12; bg.fillRect(tx(x) - 8, tz(z) - 8, 16, 16); bg.shadowBlur = 0; bg.fillStyle = '#000'; bg.font = '900 11px Orbitron'; bg.fillText(txt, tx(x), tz(z) + 4); };
  for (const g of garages) icon(g.x, g.z, '#00f0ff', 'G');
  for (const b of banks) icon(b.x, b.z, '#ffc400', '$');
  for (const r of raceZones) icon(r.x, r.z, '#ff2bd6', '⚑');
  if (vault.active) icon(vault.z.position.x, vault.z.position.z, '#ff2a4d', '!');
  for (const b of bags) { bg.fillStyle = b.userData.gold ? '#ffd200' : '#39ff88'; bg.beginPath(); bg.arc(tx(b.position.x), tz(b.position.z), 3, 0, 7); bg.fill(); }
  for (const c of cops) if (!c.dead) { bg.fillStyle = '#ff2a4d'; bg.beginPath(); bg.arc(tx(c.pos.x), tz(c.pos.z), 4, 0, 7); bg.fill(); }
  for (const r of remoteList()) { bg.fillStyle = r.info.banda?.color || '#fff'; bg.beginPath(); bg.arc(tx(r.car.pos.x), tz(r.car.pos.z), 6, 0, 7); bg.fill(); bg.font = '700 12px Orbitron'; bg.fillText(r.info.name, tx(r.car.pos.x), tz(r.car.pos.z) - 10); }
  if (gps.target) { bg.strokeStyle = '#7ff7ff'; bg.lineWidth = 3; bg.beginPath(); bg.arc(tx(gps.target.x), tz(gps.target.z), 10, 0, 7); bg.stroke(); }
  const P = G.player;
  bg.save(); bg.translate(tx(P.pos.x), tz(P.pos.z)); bg.rotate(-P.h + Math.PI);
  bg.fillStyle = '#fff'; bg.shadowColor = '#00f0ff'; bg.shadowBlur = 14;
  bg.beginPath(); bg.moveTo(0, -12); bg.lineTo(9, 10); bg.lineTo(0, 5); bg.lineTo(-9, 10); bg.closePath(); bg.fill(); bg.restore();
}
bigC.addEventListener('pointerdown', e => {
  const r = bigC.getBoundingClientRect(), S = (MAPR * 2) / r.width;
  const x = (e.clientX - r.left) * S - MAPR, z = (e.clientY - r.top) * S - MAPR;
  gps.target = new V3(x, 0, z); drawBigMap(); sfx.beep(false);
});

// ================== GARAJE ==================
let tab = 'veh';
document.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b)); renderGarage(); });
const bar = (lbl, v) => `<div class="stat"><span>${lbl}</span><i style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></i></div>`;
export function renderGarage() {
  $('gMoney').textContent = 'CARTERA ' + fmt(save.wallet);
  const ri = rankIdx(save.total), next = RANKS[ri + 1];
  $('rankBox').innerHTML = `RANGO <b style="color:#fff">${RANKS[ri][1]}</b> · GANADO EN TOTAL ${fmt(save.total)}` +
    (next ? ` · SIGUIENTE: ${next[1]} (${fmt(next[0])})<div class="bar"><i style="width:${Math.round((save.total - RANKS[ri][0]) / (next[0] - RANKS[ri][0]) * 100)}%"></i></div>` : ' · ¡RANGO MÁXIMO!');
  const B = $('gBody');
  if (tab === 'veh') {
    B.className = 'grid';
    B.innerHTML = CATALOG.map(v => {
      const own = save.owned.includes(v.id), cur = save.current === v.id;
      const btn = cur ? '<button disabled>EN USO</button>' : own ? `<button class="use" data-use="${v.id}">USAR</button>` : `<button data-buy="${v.id}" ${save.wallet < v.price ? 'disabled' : ''}>COMPRAR ${fmt(v.price)}</button>`;
      return `<div class="card ${cur ? 'sel' : ''} ${own ? '' : 'locked'}"><h3>${v.type === 'bike' ? '🏍' : '🚗'} ${v.name}</h3><div class="d">${v.desc}</div>
        ${bar('VELOCIDAD', v.s.max / 86)}${bar('ACELERAC.', v.s.accel / 66)}${bar('GIRO', (v.s.turn - 1.8) / 1.5)}${bar('PESO', v.s.mass / 2.8)}
        ${own ? '' : `<div class="price">${fmt(v.price)}</div>`}${btn}</div>`;
    }).join('');
  } else if (tab === 'upg') {
    B.className = 'grid';
    B.innerHTML = UPG.map(u => {
      const l = lvl(u.id), max = l >= u.max, c = upCost(u);
      return `<div class="card"><h3>${u.icon} ${u.name}</h3><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
        <div class="d">AHORA: ${u.desc(l)}${max ? '' : `<br>SIGUIENTE: ${u.desc(l + 1)}`}</div>
        ${max ? '<button disabled>AL MÁXIMO</button>' : `<button data-up="${u.id}" ${save.wallet < c ? 'disabled' : ''}>MEJORAR ${fmt(c)}</button>`}</div>`;
    }).join('');
  } else if (tab === 'skin') {
    B.className = 'grid';
    B.innerHTML = SKINS.map(s => {
      const own = save.skins.includes(s.id), cur = save.skin === s.id, c = hexCss(s.hex);
      const btn = cur ? '<button disabled>EN USO</button>' : own ? `<button class="use" data-skin="${s.id}">USAR</button>` : `<button data-bskin="${s.id}" ${save.wallet < s.price ? 'disabled' : ''}>COMPRAR ${fmt(s.price)}</button>`;
      return `<div class="card ${cur ? 'sel' : ''}"><h3 style="color:${c};text-shadow:0 0 10px ${c}">${s.name}</h3><div class="swatch" style="background:${c};box-shadow:0 0 18px ${c}"></div>${btn}</div>`;
    }).join('');
  } else {
    B.className = '';
    const b = save.banda || { name: '', tag: '', color: '#ff2bd6' };
    const cols = ['#ff2bd6', '#00f0ff', '#39ff88', '#ffd200', '#ff7a1a', '#ff2a4d', '#9d4dff', '#ffffff'];
    B.innerHTML = `<div class="bandaForm">
      <div>Las bandas son tu crew callejera: salen encima de tu coche y en el mapa cuando juegas con amigos. Que tus amigos pongan las mismas siglas para ir juntos.</div>
      <label>TU NOMBRE<input type="text" id="bName" maxlength="14" value="${esc(save.name)}"></label>
      <label>NOMBRE DE LA BANDA<input type="text" id="bBanda" maxlength="20" value="${esc(b.name)}" placeholder="LOS NEÓN"></label>
      <label>SIGLAS (2-4)<input type="text" id="bTag" maxlength="4" value="${esc(b.tag)}" placeholder="NEO"></label>
      <div>COLOR<div class="colors" id="bCols">${cols.map(c => `<span data-c="${c}" class="${c === b.color ? 'on' : ''}" style="background:${c};box-shadow:0 0 10px ${c}"></span>`).join('')}</div></div>
      <div class="row" style="justify-content:flex-start"><button class="btn small pink" id="bSave">GUARDAR</button>${save.banda ? '<button class="btn small" id="bLeave">SALIR DE LA BANDA</button>' : ''}</div>
      ${save.banda ? `<div style="font-size:20px;color:${b.color};text-shadow:0 0 12px ${b.color}">[${esc(b.tag)}] ${esc(b.name)}</div>` : ''}
    </div>`;
    let color = b.color;
    B.querySelectorAll('#bCols span').forEach(s => s.onclick = () => { color = s.dataset.c; B.querySelectorAll('#bCols span').forEach(x => x.classList.toggle('on', x === s)); });
    $('bSave').onclick = () => {
      const nm = $('bName').value.trim().toUpperCase().slice(0, 14); if (nm) save.name = nm;
      const bn = $('bBanda').value.trim().toUpperCase().slice(0, 20), tg = $('bTag').value.trim().toUpperCase().replace(/[^A-Z0-9Ñ]/g, '').slice(0, 4);
      if (bn && tg.length >= 2) save.banda = { name: bn, tag: tg, color };
      persist(true); announceMe(); sfx.buy(); renderGarage();
    };
    if ($('bLeave')) $('bLeave').onclick = () => { save.banda = null; persist(true); announceMe(); renderGarage(); };
  }
  B.querySelectorAll('[data-use]').forEach(b => b.onclick = () => { save.current = b.dataset.use; persist(true); sfx.buy(); G.onVehicleChange(); renderGarage(); });
  B.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { const v = byId(b.dataset.buy); if (spend(v.price)) { save.owned.push(v.id); save.current = v.id; persist(true); sfx.cash(); G.onVehicleChange(); } else sfx.deny(); renderGarage(); });
  B.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const u = UPG.find(x => x.id === b.dataset.up); if (spend(upCost(u))) { save.up[u.id] = lvl(u.id) + 1; persist(true); sfx.buy(); } else sfx.deny(); renderGarage(); });
  B.querySelectorAll('[data-skin]').forEach(b => b.onclick = () => { save.skin = b.dataset.skin; persist(true); sfx.buy(); G.onVehicleChange(); renderGarage(); });
  B.querySelectorAll('[data-bskin]').forEach(b => b.onclick = () => { const s = SKINS.find(x => x.id === b.dataset.bskin); if (spend(s.price)) { save.skins.push(s.id); save.skin = s.id; persist(true); sfx.cash(); G.onVehicleChange(); } else sfx.deny(); renderGarage(); });
}

// ================== MENÚ ==================
export function renderMenuWallet() {
  $('menuWallet').innerHTML = `CARTERA <b>${fmt(save.wallet)}</b> · RANGO <b>${RANKS[rankIdx(save.total)][1]}</b> · ${byId(save.current).name}`;
}

// ================== SALA MULTIJUGADOR ==================
export function renderLobby() {
  $('codeShow').textContent = net.role === 'host' ? net.code : net.role === 'client' ? net.code : '';
  $('netStatus').textContent = net.status;
  const me = `<div>🟢 <b>${esc(save.name)}</b>${save.banda ? ` <span style="color:${save.banda.color}">[${esc(save.banda.tag)}]</span>` : ''} (tú${net.role === 'host' ? ', anfitrión' : ''})</div>`;
  $('plist').innerHTML = net.role ? me + remoteList().map(r => `<div>🔵 <b>${esc(r.info.name)}</b>${r.info.banda ? ` <span style="color:${r.info.banda.color}">[${esc(r.info.banda.tag)}]</span>` : ''} · ${byId(r.info.veh).name}</div>`).join('') : '<div style="opacity:.6">Crea una sala o únete con un código. Hasta 8 jugadores.</div>';
  $('leaveBtn').classList.toggle('hidden', !net.role);
}
net.onChange = () => { if (!$('lobby').classList.contains('hidden')) renderLobby(); };
$('hostBtn').onclick = () => { saveName(); hostLobby().catch(e => { net.status = e.message; renderLobby(); }); };
$('joinBtn').onclick = () => { saveName(); joinLobby($('codeIn').value).catch(e => { net.status = e.message; renderLobby(); }); };
$('leaveBtn').onclick = () => { leave(); renderLobby(); };
function saveName() { const n = $('nameIn').value.trim().toUpperCase().slice(0, 14); if (n) { save.name = n; persist(true); } }
export { sendChat };
