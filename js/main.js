// Bucle principal: jugador, controles, cámara, menús y respawn
import { THREE, $, G, V3, clamp, lerp, isTouch, scene, camera, composer, skyGroup, headLight, glowLight, flashLight, emit, makeTrail, updateParticles, updateRain, showMsg, updateMsg, toast, fmt } from './core.js';
import { CELL, roadC, collideWorld, _n, ZONES, plazaFX, los } from './world.js';
import { byId, makeVehicleMesh, newCar, stepCar, poseCar, carCollide } from './vehicles.js';
import { state, save, U, skinHex, persist, tickSave, flush, crime, addCarried } from './state.js';
import { sfx } from './audio.js';
import { traffic, updateTraffic, knock, clearTraffic } from './traffic.js';
import { cops, updatePolice, clearCops, heli, copFromPatrol } from './police.js';
import { updateActivities, zoneHere, startRace, endRace, resetActivities, garages, nearestOf } from './activities.js';
import { updateHUD, renderGarage, renderMenuWallet, renderLobby, drawBigMap, sendChat } from './ui.js';
import { net, updateNet, announceMe, remoteList } from './net.js';

// ================== JUGADOR ==================
const player = newCar(new THREE.Group(), 1);
G.player = player;
const trails = [makeTrail(0xff2bd6), makeTrail(0xff2bd6)];
const bikeTrail = makeTrail(0x00f0ff, 1.6, 0.05, 110);
const boostCol = new THREE.Color(0xff2bd6), trailCol = new THREE.Color(0x00f0ff), carTrailCol = new THREE.Color(0xff2bd6);
function buildPlayer() {
  const spec = byId(save.current), hex = skinHex();
  const old = player.mesh, mesh = makeVehicleMesh(spec, hex);
  mesh.position.copy(old.position); scene.remove(old); scene.add(mesh);
  player.mesh = mesh; player.pos = mesh.position;
  player.spec = spec; player.mass = spec.s.mass; player.armor = spec.s.armor || 1;
  player.radius = spec.type === 'bike' ? 1.4 : Math.max(1.9, spec.d.l * 0.45);
  G.rider = spec.type === 'bike';
  trailCol.set(hex); boostCol.set(hex === 0xff2bd6 ? 0x00f0ff : 0xff2bd6);
  carTrailCol.set(hex === 0x00f0ff ? 0xff2bd6 : hex);
  glowLight.color.set(hex);
  poseCar(player, 0);
  announceMe();
}
G.onVehicleChange = buildPlayer;
G.resetTrails = () => { trails.forEach(t => t.reset(player.pos)); bikeTrail.reset(player.pos); };
const home = ZONES.garages[0];
player.pos.set(home.x, 0, home.z + 10); player.h = 0;
buildPlayer();

// ================== CONTROLES ==================
const keys = {};
const isDown = (...k) => k.some(x => keys[x]);
let wasUse = false, wasBoost = false, usePressed = false;
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') {
    if (e.target.id === 'chatIn') {
      if (e.code === 'Enter') { sendChat(e.target.value); e.target.value = ''; closeChat(); }
      if (e.code === 'Escape') closeChat();
    }
    return;
  }
  keys[e.code] = true;
  if (e.code === 'KeyE' && !e.repeat) usePressed = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') { const m = sfx.toggleMute(); showMsg(m ? 'SONIDO OFF' : 'SONIDO ON', '#b9a8e8', 0.8); }
  if ((e.code === 'KeyP' || e.code === 'Escape')) {
    if (!$('bigmap').classList.contains('hidden')) toggleMap(false);
    else if (!$('garage').classList.contains('hidden')) closeGarage();
    else if (state.mode === 'play' || G.paused) togglePause();
  }
  if ((e.code === 'Tab' || e.code === 'KeyN') && (state.mode === 'play')) toggleMap();
  if (e.code === 'KeyT' && net.role && state.mode === 'play') { e.preventDefault(); openChat(); }
  if (e.code === 'Enter' && !$('menu').classList.contains('hidden')) play();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state.mode === 'play' && !G.paused) togglePause(); });
if (isTouch) {
  document.querySelectorAll('#touch button[data-k]').forEach(b => {
    const k = 'T_' + b.dataset.k;
    const on = e => { e.preventDefault(); keys[k] = true; b.classList.add('on'); };
    const off = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
    b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off); b.addEventListener('touchcancel', off);
  });
  $('tM').addEventListener('touchstart', e => { e.preventDefault(); toggleMap(); }, { passive: false });
  $('tP').addEventListener('touchstart', e => { e.preventDefault(); togglePause(); }, { passive: false });
  $('nitroWrap').querySelector('.lbl').textContent = 'NITRO';
}
function ctlFromInput() {
  return {
    throttle: (isDown('KeyW', 'ArrowUp', 'T_gas') ? 1 : 0) - (isDown('KeyS', 'ArrowDown', 'T_brake') ? 1 : 0),
    steer: (isDown('KeyD', 'ArrowRight', 'T_right') ? 1 : 0) - (isDown('KeyA', 'ArrowLeft', 'T_left') ? 1 : 0),
    handbrake: isDown('Space', 'T_drift'),
    boost: isDown('ShiftLeft', 'ShiftRight', 'T_nitro'),
    use: isDown('Enter', 'T_use'),
  };
}
function openChat() { const c = $('chatIn'); c.classList.remove('hidden'); setTimeout(() => c.focus(), 0); for (const k in keys) keys[k] = false; }
function closeChat() { const c = $('chatIn'); c.blur(); c.classList.add('hidden'); }

// ================== PANTALLAS ==================
function showOnly(id) { for (const o of ['menu', 'garage', 'lobby', 'pause', 'bigmap']) $(o).classList.toggle('hidden', o !== id); }
function play() {
  sfx.ensure();
  showOnly(null); G.paused = false;
  $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.remove('hidden');
  if (state.mode === 'menu' || state.mode === 'garage') state.mode = 'play';
  G.resetTrails();
  if (!G.started) {
    G.started = true;
    showMsg('¡NEON RIDER!', '#00f0ff', 1.8);
    setTimeout(() => toast('🌆 <b>CIUDAD ABIERTA</b><br>Aros <b style="color:#ff2bd6">rosas</b> = carreras · <b style="color:#00f0ff">cian</b> = garajes · <b style="color:#ffc400">dorados</b> = bancos<br>Las bolsas <b style="color:#39ff88">$</b> son robos: dan pasta… y poli.', 6500), 1500);
  }
  renderMenuWallet();
}
function toMenu() {
  showOnly('menu'); G.paused = false; state.mode = 'menu';
  if (state.race) endRace(true);
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  renderMenuWallet();
}
let garageFromMenu = false;
function openGarage(fromMenu) {
  garageFromMenu = fromMenu; sfx.ensure();
  state.mode = 'garage'; showOnly('garage'); renderGarage();
  if (!fromMenu) { player.vel.set(0, 0, 0); player.vf = player.vr = 0; }
}
function closeGarage() {
  flush();
  if (garageFromMenu) toMenu(); else play();
}
function togglePause() {
  if (state.mode !== 'play' && !G.paused) return;
  G.paused = !G.paused;
  if (G.paused) {
    showOnly('pause'); const s = state.session;
    $('pauseStats').innerHTML = `ESTA SESIÓN: ${fmt(s.earned)} GANADOS · ${s.bags} BOLSAS · ${s.wrecked} POLIS FUERA · ${s.races} CARRERAS`;
  } else showOnly(null);
}
function toggleMap(force) {
  const m = $('bigmap'), open = force ?? m.classList.contains('hidden');
  if (open) { m.classList.remove('hidden'); drawBigMap(); G.paused = true; }
  else { m.classList.add('hidden'); G.paused = false; }
}
$('play').onclick = play;
$('garageBtn').onclick = () => openGarage(true);
$('gClose').onclick = closeGarage;
$('mpBtn').onclick = () => { showOnly('lobby'); $('nameIn').value = save.name; renderLobby(); };
$('lobbyBack').onclick = toMenu;
$('mpPlay').onclick = play;
$('resume').onclick = togglePause;
$('pMenu').onclick = toMenu;
$('pMap').onclick = () => { G.paused = false; showOnly(null); toggleMap(true); };
$('bigC').addEventListener('dblclick', () => toggleMap(false));
G.onHonk = c => { sfx.horn(); };

// ================== PILLADO Y RESPAWN ==================
function busted() {
  state.mode = 'busted';
  const lost = state.carried;
  sfx.busted();
  const f = $('fade'); f.textContent = '¡PILLADO!'; f.classList.add('on');
  if (state.race) endRace(true);
  setTimeout(() => {
    state.carried = 0; state.held = 0; state.heat = 0; state.wanted = 0; state.busted = 0; state.escapeT = 0;
    clearCops(); heli.reset();
    const [g] = nearestOf(garages, player.pos);
    player.pos.set(g.x, 0, g.z); player.h = g.h; player.vel.set(0, 0, 0); player.vf = player.vr = 0;
    player.mesh.rotation.set(0, 0, 0); G.resetTrails();
    camPos.set(player.pos.x - Math.sin(player.h) * 8, 4, player.pos.z - Math.cos(player.h) * 8);
    f.classList.remove('on'); state.mode = 'play';
    toast(lost ? `🚓 Te han pillado.<br>Has perdido <b style="color:#ff2a4d">${fmt(lost)}</b> que llevabas en mano.<br><small>Lo de la cartera está a salvo.</small>` : '🚓 Te han pillado. Vuelves al garaje.', 4000);
    persist(true);
  }, 2300);
}

// ================== JUGADOR: FÍSICA ==================
function updatePlayer(dt) {
  const ctl = ctlFromInput();
  if (state.race && state.race.count > 0) { ctl.throttle = 0; ctl.boost = false; }
  const s = player.spec.s;
  const boosting = ctl.boost && state.nitro > 1 && ctl.throttle >= 0;
  if (boosting && !wasBoost) sfx.boost();
  wasBoost = boosting;
  const P = { accel: s.accel * U.speed, brake: 62, max: s.max * U.speed, rev: 14, grip: s.grip * U.grip, gripDrift: s.drift, turn: s.turn * (1 + (U.grip - 1) * 0.5) };
  if (boosting) { P.accel *= 2.2; P.max *= 1.32; state.nitro -= U.nitroDrain * dt; ctl.throttle = 1; }
  else state.nitro = Math.min(100, state.nitro + U.nitroRegen * dt);
  stepCar(player, ctl, P, dt);
  const hit = collideWorld(player.pos, player.vel, player.radius);
  if (hit > 10) {
    G.shake = Math.max(G.shake, Math.min(1, hit / 40));
    for (let i = 0; i < 18; i++) emit(player.pos.x - _n.x * 2.2, 0.8, player.pos.z - _n.z * 2.2, _n.x * 8 + (Math.random() - 0.5) * 14, Math.random() * 8, _n.z * 8 + (Math.random() - 0.5) * 14, 4, 3, 1.2, 0.6);
    sfx.crash(Math.min(1, hit / 40));
  }
  // tráfico
  for (const t of traffic) {
    if (Math.abs(t.pos.x - player.pos.x) > 7 || Math.abs(t.pos.z - player.pos.z) > 7) continue;
    const imp = carCollide(player, t, player.radius + 1.9);
    if (imp > 6) {
      knock(t, imp); sfx.crash(Math.min(1, imp / 35)); G.shake = Math.max(G.shake, Math.min(0.7, imp / 40));
      for (let i = 0; i < 12; i++) emit(player.pos.x + _n.x * 1.5, 1, player.pos.z + _n.z * 1.5, (Math.random() - 0.5) * 14, Math.random() * 6, (Math.random() - 0.5) * 14, 4, 2.5, 1, 0.5);
      if (t.patrol && state.mode === 'play') { crime(1.5); copFromPatrol(t); showMsg('¡HAS EMBESTIDO A LA PATRULLA!', '#ff2a4d', 1.5); }
      else if (imp > 14 && state.mode === 'play' && !state.race) {
        const witness = traffic.some(o => o.patrol && Math.hypot(o.pos.x - player.pos.x, o.pos.z - player.pos.z) < 60 && los(o.pos, player.pos)) || cops.some(c => !c.dead && c.pos.distanceTo(player.pos) < 60);
        if (witness) crime(0.8);
      }
    }
  }
  player.wheelie = G.rider && boosting && Math.abs(player.vr) < 8;
  player.wt += dt;
  poseCar(player, dt);
  player.isBoost = boosting;
  const fx = Math.sin(player.h), fz = Math.cos(player.h), sx = fz, sz = -fx;
  const sp = Math.abs(player.vf);
  if (G.rider) {
    const kb = clamp((sp - 4) / 40, 0, 1) * (boosting ? 0.9 : 0.55);
    bikeTrail.update(new V3(player.pos.x - fx * 1.8, 0, player.pos.z - fz * 1.8), kb, boosting ? boostCol : trailCol);
    trails[0].update(player.pos, 0); trails[1].update(player.pos, 0);
  } else {
    bikeTrail.update(player.pos, 0);
    const k = clamp(sp / 30, 0, 1) * (boosting ? 1.1 : 0.6), L = player.mesh.userData.len / 2 + 0.1, w = player.mesh.userData.wid * 0.33;
    trails[0].update(new V3(player.pos.x - fx * L + sx * w, 0, player.pos.z - fz * L + sz * w), k, boosting ? trailCol : carTrailCol);
    trails[1].update(new V3(player.pos.x - fx * L - sx * w, 0, player.pos.z - fz * L - sz * w), k, boosting ? trailCol : carTrailCol);
  }
  if (boosting) for (let i = 0; i < 4; i++) {
    const s2 = (Math.random() - 0.5) * 1.2, back = G.rider ? 1.9 : player.mesh.userData.len / 2 + 0.3;
    emit(player.pos.x - fx * back + sx * s2 * (G.rider ? 0.4 : 1), G.rider ? 1.2 : 0.7, player.pos.z - fz * back + sz * s2 * (G.rider ? 0.4 : 1), -fx * 18 + (Math.random() - 0.5) * 4 + player.vel.x * 0.5, Math.random() * 2, -fz * 18 + (Math.random() - 0.5) * 4 + player.vel.z * 0.5, 0.6, 2.5, 4, 0.35, 0);
  }
  // derrape = pasta
  const dr = Math.abs(player.vr);
  if (dr > 6 && sp > 12) {
    state.drift += dr * dt * 5 * (player.spec.id === 'kaze' ? 2 : 1);
    for (const s3 of [-1, 1]) emit(player.pos.x - fx * 1.6 + sx * s3 * 1.1, 0.4, player.pos.z - fz * 1.6 + sz * s3 * 1.1, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 1.2, 0.3, 1.6, 0.8, -1);
  } else if (state.drift > 0 && dr < 3) {
    if (state.drift > 40) { const v = Math.round(state.drift / 10) * 10; addCarried(v, player.pos, '#ff2bd6', 'DERRAPE +$'); }
    state.drift = 0;
  }
  headLight.position.set(player.pos.x + fx * 1.5, G.rider ? 1.8 : 2.2, player.pos.z + fz * 1.5);
  headLight.target.position.set(player.pos.x + fx * 30, 0, player.pos.z + fz * 30);
  glowLight.position.set(player.pos.x, 0.8, player.pos.z);
  // tecla E
  if ((ctl.use && !wasUse) || usePressed) interact();
  usePressed = false;
  wasUse = ctl.use;
  return sp;
}
function interact() {
  const z = G.zone; if (!z || state.race) return;
  if (state.wanted > 0) { sfx.deny(); showMsg('🚓 PIERDE A LA POLI PRIMERO', '#ff2a4d', 1.4); return; }
  if (z.type === 'garage') openGarage(false);
  if (z.type === 'race') startRace(z.r);
}

// ================== CÁMARA ==================
const camPos = new V3(player.pos.x, 6, player.pos.z - 12), camLook = new V3();
let camRoll = 0;
function updateCamera(dt) {
  if (state.mode === 'menu' || state.mode === 'garage' && garageFromMenu) {
    const a = G.t * 0.06;
    camera.position.set(Math.sin(a) * 260, 95 + Math.sin(G.t * 0.2) * 20, Math.cos(a) * 260);
    camera.lookAt(0, 10, 0); camera.fov = 68; camera.updateProjectionMatrix(); return;
  }
  if (state.mode === 'garage') { // vista del garaje: gira alrededor de tu vehículo
    const a = G.t * 0.4, p = player.pos;
    camera.position.set(p.x + Math.sin(a) * 9, 3.2, p.z + Math.cos(a) * 9); camera.lookAt(p.x, 1, p.z); return;
  }
  if (state.mode === 'busted') {
    const a = G.t * 0.4;
    camPos.lerp(new V3(player.pos.x + Math.sin(a) * 18, 10, player.pos.z + Math.cos(a) * 18), 1 - Math.exp(-2 * dt));
    camera.position.copy(camPos); camera.lookAt(player.pos.x, 1, player.pos.z); return;
  }
  const R = G.rider, fx = Math.sin(player.h), fz = Math.cos(player.h), sp = player.vel.length();
  const L = R ? 0 : (player.mesh.userData.len - 4.4) * 0.6;
  const back = R ? 4.8 + sp * 0.03 : 10.5 + L + sp * 0.05, up = R ? 2.6 + sp * 0.012 : 4.3 + L * 0.3 + sp * 0.018;
  camPos.lerp(new V3(player.pos.x - fx * back, up, player.pos.z - fz * back), 1 - Math.exp(-(R ? 16 : 7) * dt));
  camera.position.copy(camPos);
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; camera.position.z += (Math.random() - 0.5) * G.shake; G.shake = Math.max(0, G.shake - dt * 2.2); }
  camLook.set(player.pos.x + fx * 8, R ? 1.7 : 1.3, player.pos.z + fz * 8);
  camera.lookAt(camLook);
  if (R) { camRoll = lerp(camRoll, player.mesh.userData.lean.rotation.z * 0.18, 1 - Math.exp(-5 * dt)); camera.rotateZ(camRoll); }
  const fov = R ? 64 + sp * 0.16 + (player.isBoost ? 12 : 0) : 70 + sp * 0.2 + (player.isBoost ? 14 : 0);
  camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix();
}

// ================== BUCLE ==================
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.paused) { composer.render(); return; }
  G.t += dt;
  let sp = 0;
  if (state.mode === 'play') {
    state.time += dt;
    sp = updatePlayer(dt);
    G.zone = zoneHere();
    if (state.busted >= 1) busted();
    if (state.combo > 1 && state.time - state.comboT > 7) state.combo = 1;
  } else if (state.mode === 'busted') {
    player.vel.multiplyScalar(Math.exp(-3 * dt)); player.pos.addScaledVector(player.vel, dt); poseCar(player, dt);
  }
  if (state.mode !== 'garage') {
    const obstacles = cops.filter(c => !c.dead);
    if (state.race) obstacles.push(...state.race.racers);
    for (const r of remoteList()) obstacles.push(r.car);
    updateTraffic(dt, obstacles);
    const { nearest, nd } = updatePolice(dt);
    updateActivities(dt);
    sfx.update(sp, player.isBoost, state.wanted > 0 && nearest ? clamp(1 - nd / 140, 0, 1) : 0, heli.active ? clamp(1 - heli.group.position.distanceTo(player.pos) / 160, 0, 1) : 0, state.mode === 'play');
  } else sfx.update(0, false, 0, 0, false);
  updateNet(dt);
  for (const r of plazaFX) { r.rotation.x = Math.sin(G.t * 0.7) * 0.6 + Math.PI / 2; r.rotation.z += dt * 1.2; }
  flashLight.intensity *= Math.exp(-6 * dt);
  updateParticles(dt);
  updateCamera(dt);
  updateRain(dt, camera.position.x, camera.position.z);
  skyGroup.position.copy(camera.position);
  updateMsg(dt);
  if (state.mode === 'play' || state.mode === 'busted') updateHUD(dt);
  tickSave(dt);
  composer.render();
}
if (location.hash === '#dbg') window.dbg = { player, camera, state, save, G, traffic, cops, net };
renderMenuWallet();
G.resetTrails();
frame();
