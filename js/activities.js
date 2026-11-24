// Actividades del mundo abierto: robos de bolsas, bancos, garajes, cámara acorazada y carreras
import { THREE, scene, V3, G, clamp, wrapAngle, canvasTex, signTex, radialTex, burst, emit, showMsg, toast, popText, isTouch, mulberry32, fmt } from './core.js';
import { N, CELL, roadC, interIdx, ZONES, randomRoadPoint, collideWorld, _n } from './world.js';
import { makeCar, makeBike, CATALOG, newCar, stepCar, poseCar, carCollide } from './vehicles.js';
import { state, save, U, crime, earn, addCarried, persist, rankIdx } from './state.js';
import { sfx } from './audio.js';
import { traffic, knock } from './traffic.js';

// ================== ZONAS (aro + haz + cartel) ==================
const zoneGeo = { ring: new THREE.TorusGeometry(1, 0.045, 8, 64), disk: new THREE.CircleGeometry(1, 48), wall: new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), beam: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true) };
const wallTex = canvasTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
export function makeZone(hex, word, R = 8, beamH = 70) {
  const g = new THREE.Group(), C = new THREE.Color(hex);
  const ring = new THREE.Mesh(zoneGeo.ring, new THREE.MeshBasicMaterial({ color: C.clone().multiplyScalar(3) }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; ring.scale.setScalar(R); g.add(ring);
  const disk = new THREE.Mesh(zoneGeo.disk, new THREE.MeshBasicMaterial({ color: C.clone().multiplyScalar(0.35), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  disk.rotation.x = -Math.PI / 2; disk.position.y = 0.09; disk.scale.setScalar(R); g.add(disk);
  const prog = new THREE.Mesh(zoneGeo.disk, new THREE.MeshBasicMaterial({ color: C.clone().multiplyScalar(1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  prog.rotation.x = -Math.PI / 2; prog.position.y = 0.1; prog.scale.setScalar(0.001); g.add(prog);
  const wall = new THREE.Mesh(zoneGeo.wall, new THREE.MeshBasicMaterial({ map: wallTex, color: C.clone().multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  wall.scale.set(R, 3, R); wall.position.y = 1.5; g.add(wall);
  const beam = new THREE.Mesh(zoneGeo.beam, new THREE.MeshBasicMaterial({ color: C.clone().multiplyScalar(0.45), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.scale.set(1.1, beamH, 1.1); beam.position.y = beamH / 2; g.add(beam);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex(word, hex), color: new THREE.Color(2.2, 2.2, 2.2), depthWrite: false, transparent: true }));
  sign.scale.set(13, 5.1, 1); sign.position.y = 10; g.add(sign);
  g.userData = { ring, disk, prog, wall, sign, R, hex };
  scene.add(g); return g;
}
function pulseZone(z, t, on = 1) {
  const u = z.userData, p = G.player.pos;
  const d = Math.hypot(z.position.x - p.x, z.position.z - p.z), inside = clamp((d - u.R) / 10, 0.12, 1);
  u.wall.material.opacity = (0.45 + Math.sin(t * 3) * 0.15) * on * inside;
  u.disk.material.opacity = 0.5 * inside;
  u.sign.position.y = 10 + Math.sin(t * 1.5) * 0.4;
}

export const garages = ZONES.garages.map(g => { const z = makeZone(0x00f0ff, 'GARAJE', 8, 50); z.position.set(g.x, 0, g.z); return { ...g, mesh: z }; });
export const banks = ZONES.banks.map(b => { const z = makeZone(0xffc400, 'BANCO', 8, 80); z.position.set(b.x, 0, b.z); return { ...b, mesh: z }; });
export const raceZones = ZONES.races.map(r => { const z = makeZone(0xff2bd6, 'CARRERA', 8, 60); z.position.set(r.x, 0, r.z); return { ...r, mesh: z }; });

// ================== BOLSAS DE DINERO ==================
const bagGeo = { body: new THREE.SphereGeometry(1, 20, 14), neck: new THREE.CylinderGeometry(0.3, 0.55, 0.5, 12), knot: new THREE.TorusGeometry(0.36, 0.13, 8, 18), beam: new THREE.CylinderGeometry(0.9, 0.9, 70, 16, 1, true), ring: new THREE.RingGeometry(2.4, 2.9, 40) };
const dollarTex = canvasTex(128, 128, (g) => { g.font = '900 100px Orbitron, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#fff'; g.shadowBlur = 12; g.fillStyle = '#fff'; g.fillText('$', 64, 70); });
function bagMats(gold) {
  const c = gold ? 0xffd200 : 0x39ff88, cc = new THREE.Color(c);
  return {
    solid: new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3, roughness: 0.35, metalness: 0.3 }),
    glow: new THREE.MeshBasicMaterial({ color: cc.clone().multiplyScalar(0.5), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    ring: new THREE.MeshBasicMaterial({ color: cc.clone().multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    sprite: new THREE.SpriteMaterial({ map: dollarTex, color: cc.clone().multiplyScalar(3), depthWrite: false })
  };
}
const MATS = { green: bagMats(false), gold: bagMats(true) };
export const bags = [];
function makeBag(gold) {
  const M = gold ? MATS.gold : MATS.green, g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const body = new THREE.Mesh(bagGeo.body, M.solid); body.scale.set(1.05, 1.1, 1.05); body.position.y = 1.1;
  const neck = new THREE.Mesh(bagGeo.neck, M.solid); neck.position.y = 2.3;
  const knot = new THREE.Mesh(bagGeo.knot, M.solid); knot.position.y = 2.7;
  inner.add(body, neck, knot);
  const beam = new THREE.Mesh(bagGeo.beam, M.glow); beam.position.y = 35; g.add(beam);
  const ring = new THREE.Mesh(bagGeo.ring, M.ring); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; g.add(ring);
  const sp = new THREE.Sprite(M.sprite); sp.scale.set(2.6, 2.6, 1); sp.position.y = 4.6; inner.add(sp);
  if (gold) inner.scale.setScalar(1.35);
  const r = rankIdx(save.total);
  g.userData = { inner, ring, gold, value: Math.round((gold ? 2000 : 250 + Math.floor(Math.random() * 8) * 50) * (1 + r * 0.25)), t: Math.random() * 10 };
  return g;
}
function spawnBag() { const b = makeBag(Math.random() < U.gold); b.position.copy(randomRoadPoint(55, 260, G.player.pos)); scene.add(b); bags.push(b); }
export function clearBags() { for (const b of bags) scene.remove(b); bags.length = 0; }

// ================== CÁMARA ACORAZADA ==================
export const vault = { z: makeZone(0xff2a4d, 'CÁMARA', 9, 110), active: false, life: 0, next: 75, hold: 0 };
vault.z.visible = false;
function openVault() {
  const p = randomRoadPoint(140, 320, G.player.pos, true);
  vault.z.position.copy(p); vault.z.visible = true; vault.active = true; vault.life = 70; vault.hold = 0;
  showMsg('🚨 CÁMARA ACORAZADA ABIERTA', '#ff2a4d', 2.4); sfx.alarm();
  toast('🏦 <b>CÁMARA ACORAZADA</b><br>Quédate 4 s dentro del círculo rojo → botín gordo (y mucha poli)', 4200);
}
function closeVault() { vault.active = false; vault.z.visible = false; vault.next = 110 + Math.random() * 60; }

// ================== CARRERAS ==================
const RACER_NAMES = ['VÍBORA', 'KAITO', 'LA REINA', 'TURBO', 'FANTASMA', 'NOVA'];
const gateGeo = new THREE.TorusGeometry(7.5, 0.4, 10, 48);
const gates = [0, 1].map(i => {
  const m = new THREE.Mesh(gateGeo, new THREE.MeshBasicMaterial({ color: i ? new THREE.Color(0.6, 0.15, 0.5) : new THREE.Color(1.8, 0.35, 1.6) }));
  m.visible = false; scene.add(m); return m;
});
const finishTex = canvasTex(256, 64, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#000' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
const finishBanner = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.2), new THREE.MeshBasicMaterial({ map: finishTex, side: THREE.DoubleSide, color: new THREE.Color(2, 2, 2) }));
finishBanner.visible = false; scene.add(finishBanner);

export function raceRoute(def) {
  const rng = mulberry32(def.k * 1000 + def.j * 7 + def.len);
  // primer cruce: delante de la salida
  let ix, iz, dir;
  if (def.a === 'v') { ix = def.k; iz = def.j; dir = [0, 1]; } else { iz = def.k; ix = def.j; dir = [1, 0]; }
  const cps = [new V3(roadC(ix), 0, roadC(iz))], seen = new Set([ix + ',' + iz]);
  const inG = i => i >= -N - 1 && i <= N;
  for (let s = 0; s < def.len; s++) {
    const opts = [];
    const r = [-dir[1], dir[0]], l = [dir[1], -dir[0]];
    for (const [d, w] of [[dir, 0.45], [r, 0.275], [l, 0.275]]) {
      const run = 1 + Math.floor(rng() * 3);
      let nx = ix, nz = iz, ok = true;
      for (let q = 0; q < run; q++) { nx += d[0]; nz += d[1]; if (!inG(nx) || !inG(nz) || seen.has(nx + ',' + nz)) { ok = false; break; } }
      if (ok) opts.push([d, w, run]);
    }
    if (!opts.length) break;
    let x = rng() * opts.reduce((a, o) => a + o[1], 0), pick = opts[0];
    for (const o of opts) { if ((x -= o[1]) <= 0) { pick = o; break; } }
    for (let q = 0; q < pick[2]; q++) { ix += pick[0][0]; iz += pick[0][1]; seen.add(ix + ',' + iz); }
    dir = pick[0];
    cps.push(new V3(roadC(ix), 0, roadC(iz)));
  }
  return cps;
}

export function startRace(def) {
  const cps = raceRoute(def);
  const P = G.player;
  const start = new V3(def.x, 0, def.z);
  const h = Math.atan2(cps[0].x - start.x, cps[0].z - start.z);
  const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
  P.pos.set(start.x + rx * 3, 0, start.z + rz * 3); P.h = h; P.vel.set(0, 0, 0); P.vf = P.vr = 0;
  G.resetTrails && G.resetTrails();
  const racers = [];
  const n = 3, lvlK = def.lvl;
  for (let i = 0; i < n; i++) {
    const spec = CATALOG[Math.min(CATALOG.length - 1, 1 + Math.floor(Math.random() * 3) + Math.floor(lvlK * 0.9))];
    const hex = [0xff2a4d, 0xffc400, 0x39ff88, 0x9d4dff][i];
    const mesh = spec.type === 'bike' ? makeBike(hex, { tron: spec.tron }) : makeCar(spec.d, hex);
    const c = newCar(mesh, spec.s.mass);
    const row = Math.floor((i + 1) / 2), side = (i + 1) % 2 ? -1 : 1;
    c.pos.set(start.x - fx * row * 7 + rx * side * 3, 0, start.z - fz * row * 7 + rz * side * 3);
    if (i === 0) c.pos.set(start.x - rx * 3, 0, start.z - rz * 3);
    c.h = h;
    const base = 41 + lvlK * 6.5;
    Object.assign(c, { name: RACER_NAMES[(i + lvlK) % RACER_NAMES.length], idx: 0, done: false, place: 0, P: { accel: 30 + lvlK * 5, brake: 60, max: base * (0.94 + Math.random() * 0.1), rev: 12, grip: 10, gripDrift: 1.6, turn: 2.7 }, stuck: 0, reverse: 0, isRacer: true });
    scene.add(mesh); poseCar(c, 0); racers.push(c);
  }
  state.race = { def, cps, idx: 0, t: 0, count: 3.5, racers, finished: [], lastBeep: 4, done: false };
  state.mode = 'play';
  gates.forEach(g => g.visible = true);
  showMsg(def.name, '#ff2bd6', 2);
}
export function endRace(abandon) {
  const R = state.race; if (!R) return;
  for (const c of R.racers) scene.remove(c.mesh);
  gates.forEach(g => g.visible = false); finishBanner.visible = false;
  state.race = null;
  if (abandon) showMsg('CARRERA ABANDONADA', '#ff2a4d', 1.8);
}
function placeGates(R) {
  const a = R.cps[R.idx], b = R.cps[R.idx + 1];
  const prev = R.idx === 0 ? new V3(R.def.x, 0, R.def.z) : R.cps[R.idx - 1];
  const g0 = gates[0]; g0.position.set(a.x, 7.6, a.z); g0.rotation.set(0, Math.atan2(a.x - prev.x, a.z - prev.z), 0);
  if (b) { gates[1].visible = true; gates[1].position.set(b.x, 7.6, b.z); gates[1].rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0); } else gates[1].visible = false;
  const last = R.idx === R.cps.length - 1;
  finishBanner.visible = last;
  if (last) { finishBanner.position.set(a.x, 15.5, a.z); finishBanner.rotation.y = g0.rotation.y; }
  g0.material.color.set(last ? new THREE.Color(2, 2, 2) : new THREE.Color(1.8, 0.35, 1.6));
}
function progress(idx, pos, cps) { const c = cps[Math.min(idx, cps.length - 1)]; return idx * 10000 - Math.hypot(c.x - pos.x, c.z - pos.z); }
function updateRace(dt) {
  const R = state.race, P = G.player;
  if (R.count > 0) {
    R.count -= dt;
    const s = Math.ceil(R.count);
    if (s !== R.lastBeep && s >= 0) { R.lastBeep = s; if (s > 0 && s <= 3) { sfx.beep(false); showMsg(String(s), '#fff', 0.8); } }
    if (R.count <= 0) { sfx.beep(true); showMsg('¡YA!', '#39ff88', 1); }
    P.vel.set(0, 0, 0); P.vf = P.vr = 0;
    placeGates(R);
    return;
  }
  R.t += dt;
  // jugador pasa checkpoints
  const cp = R.cps[R.idx];
  if (cp && Math.hypot(P.pos.x - cp.x, P.pos.z - cp.z) < 11) {
    R.idx++; sfx.checkpoint();
    if (R.idx >= R.cps.length) return finishRace();
  }
  if (cp && Math.hypot(P.pos.x - cp.x, P.pos.z - cp.z) > 300) return endRace(true);
  placeGates(R);
  // rivales
  const pp = progress(R.idx, P.pos, R.cps);
  for (const c of R.racers) {
    if (c.done) { stepCar(c, { throttle: 0, steer: 0, handbrake: true }, c.P, dt); poseCar(c, dt); continue; }
    const t = R.cps[c.idx];
    const diff = wrapAngle(Math.atan2(t.x - c.pos.x, t.z - c.pos.z) - c.h);
    const ctl = { throttle: 1, steer: clamp(-diff * 2.6, -1, 1), handbrake: false };
    const dist = Math.hypot(t.x - c.pos.x, t.z - c.pos.z);
    const nxt = R.cps[c.idx + 1];
    if (nxt && dist < 26 && c.vf > 22) { // frena antes de girar
      const turnA = Math.abs(wrapAngle(Math.atan2(nxt.x - t.x, nxt.z - t.z) - Math.atan2(t.x - c.pos.x, t.z - c.pos.z)));
      if (turnA > 0.8) ctl.throttle = -0.4;
    }
    if (Math.abs(diff) > 0.7 && c.vf > 15) ctl.handbrake = true;
    if (Math.abs(c.vf) < 3 && c.reverse <= 0) { c.stuck += dt; if (c.stuck > 1.2) { c.reverse = 0.8; c.stuck = 0; } } else c.stuck = Math.max(0, c.stuck - dt);
    if (c.reverse > 0) { c.reverse -= dt; ctl.throttle = -1; ctl.steer = -ctl.steer; }
    // goma elástica: si vas muy por delante, aprietan
    const rp = progress(c.idx, c.pos, R.cps), gap = pp - rp;
    const Pm = { ...c.P, max: c.P.max * clamp(1 + gap / 4000, 0.9, 1.2) };
    stepCar(c, ctl, Pm, dt);
    c.wt += dt; c.wheelie = false;
    collideWorld(c.pos, c.vel, 1.9);
    poseCar(c, dt);
    if (dist < 11) { c.idx++; if (c.idx >= R.cps.length) { c.done = true; R.finished.push(c.name); } }
  }
  // choques en carrera
  for (let i = 0; i < R.racers.length; i++) {
    const a = R.racers[i];
    carCollide(P, a, P.radius + 2);
    for (let j = i + 1; j < R.racers.length; j++) carCollide(a, R.racers[j], 3.8);
    for (const t of traffic) { if (Math.abs(t.pos.x - a.pos.x) > 6 || Math.abs(t.pos.z - a.pos.z) > 6) continue; const imp = carCollide(a, t, 3.6); if (imp > 8) knock(t, imp); }
  }
  // posición
  let place = 1 + R.finished.length;
  for (const c of R.racers) if (!c.done && progress(c.idx, c.pos, R.cps) > pp) place++;
  R.place = place;
  if (R.finished.length === R.racers.length && !R.giveUpT) R.giveUpT = R.t + 25;
  if (R.giveUpT && R.t > R.giveUpT) finishRace(true);
}
function finishRace(timeout) {
  const R = state.race; const place = timeout ? 4 : 1 + R.finished.length;
  const mult = [1, 0.4, 0.2, 0][place - 1] ?? 0;
  const first = !save.races[R.def.name];
  let prize = Math.round(R.def.prize * mult);
  if (place === 1 && first) prize = Math.round(prize * 1.5);
  const mm = Math.floor(R.t / 60), ss = (R.t % 60).toFixed(1).padStart(4, '0');
  if (prize) { earn(prize); sfx.cash(); }
  else sfx.busted();
  if (!save.races[R.def.name] || place < save.races[R.def.name]) save.races[R.def.name] = place;
  state.session.races++; persist(true);
  toast(`🏁 <b>${R.def.name}</b><br>${['🥇 1º', '🥈 2º', '🥉 3º', '4º'][place - 1]} · ${mm}:${ss}${prize ? `<br><span style="color:#39ff88">+${fmt(prize)}${place === 1 && first ? ' (¡primera victoria x1.5!)' : ''}</span>` : ''}`, 5000);
  showMsg(place === 1 ? '¡GANASTE!' : place <= 3 ? `${place}º PUESTO` : 'HAS PERDIDO', place === 1 ? '#ffd200' : '#ff2bd6', 2.2);
  endRace(false);
}

// ================== BUCLE ==================
export const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2, 0.7) }));
arrow.geometry.rotateX(Math.PI / 2); scene.add(arrow);
export const gps = { target: null };

let fullWarnT = 0, bankHint = 0;
export function nearestOf(list, p) { let b = null, bd = Infinity; for (const o of list) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; b = o; } } return [b, bd]; }

// qué hay alrededor para la tecla E
export function zoneHere() {
  const p = G.player.pos;
  for (const g of garages) if (Math.hypot(g.x - p.x, g.z - p.z) < 8.5) return { type: 'garage', g };
  for (const r of raceZones) if (Math.hypot(r.x - p.x, r.z - p.z) < 8.5) return { type: 'race', r };
  return null;
}

export function updateActivities(dt) {
  const P = G.player, pp = P.pos, t = G.t;
  const playing = state.mode === 'play';
  // zonas: animación
  for (const g of garages) pulseZone(g.mesh, t);
  for (const b of banks) pulseZone(b.mesh, t + 1);
  for (const r of raceZones) { pulseZone(r.mesh, t + 2); r.mesh.visible = !state.race; }
  // bolsas
  const want = state.race ? 0 : (isTouch ? 6 : 9);
  while (bags.length < want) spawnBag();
  const mag = U.magnet;
  let nearestBag = null, nbd = Infinity;
  for (let i = bags.length - 1; i >= 0; i--) {
    const b = bags[i], u = b.userData; u.t += dt;
    u.inner.rotation.y += dt * 2; u.inner.position.y = 0.4 + Math.sin(u.t * 3) * 0.35;
    u.ring.scale.setScalar(1 + Math.sin(u.t * 4) * 0.12);
    const d = Math.hypot(b.position.x - pp.x, b.position.z - pp.z);
    if (d > 340 || state.race) { scene.remove(b); bags.splice(i, 1); continue; }
    if (playing && d < mag) {
      if (state.held >= U.cap) {
        if (t - fullWarnT > 2.5) { fullWarnT = t; showMsg('🎒 MOCHILA LLENA · ¡AL BANCO!', '#ffc400', 1.6); sfx.deny(); }
      } else {
        state.combo = (state.time - state.comboT < 7) ? Math.min(8, state.combo + 1) : 1; state.comboT = state.time;
        const v = u.value * state.combo;
        addCarried(v, b.position, u.gold ? '#ffd200' : '#39ff88', state.combo > 1 ? `x${state.combo} +$` : '+$');
        burst(new V3(b.position.x, 1.5, b.position.z), u.gold ? 90 : 50, u.gold ? 4 : 0.6, u.gold ? 3.2 : 4, u.gold ? 0.3 : 1.5, 16, 1.1, 12, 12);
        sfx.pickup(u.gold);
        state.nitro = Math.min(100, state.nitro + (u.gold ? 60 : 30));
        state.held++; state.session.bags++;
        crime(u.gold ? 1.6 : 0.8);
        scene.remove(b); bags.splice(i, 1);
        if (state.held === 1 && bankHint < 2) { bankHint++; toast('💰 Llevas dinero <b>en mano</b>.<br>Llévalo a un <b style="color:#ffc400">BANCO</b> (aro dorado) para guardarlo.<br>Si te pillan, lo pierdes.', 4200); }
        continue;
      }
    }
    if (d < nbd) { nbd = d; nearestBag = b; }
  }
  // bancos
  let inBank = null;
  for (const b of banks) if (Math.hypot(b.x - pp.x, b.z - pp.z) < 8) inBank = b;
  if (playing && inBank && state.carried > 0) {
    if (state.wanted > 0) { state.bankMsg = '🚓 NO PUEDES INGRESAR CON LA POLI DETRÁS'; state.depositT = 0; }
    else {
      state.depositT += dt; state.bankMsg = 'INGRESANDO…';
      if (state.depositT >= 1) {
        const v = Math.round(state.carried * U.interest);
        earn(v); popText('INGRESO +' + fmt(v), inBank, '#ffc400'); sfx.cash();
        burst(new V3(inBank.x, 2, inBank.z), 120, 4, 3, 0.3, 18, 1.3, 10, 14);
        showMsg('🏦 ' + fmt(v) + ' A SALVO', '#ffc400', 2);
        state.carried = 0; state.held = 0; state.depositT = 0;
      }
    }
  } else { state.depositT = Math.max(0, state.depositT - dt * 3); state.bankMsg = ''; }
  for (const b of banks) b.mesh.userData.prog.scale.setScalar(Math.max(0.001, b === inBank ? state.depositT * 8 : 0.001));
  // cámara acorazada
  if (playing && !state.race) {
    if (!vault.active) { vault.next -= dt; if (vault.next <= 0) openVault(); }
    else {
      vault.life -= dt; pulseZone(vault.z, t * 2);
      const d = Math.hypot(vault.z.position.x - pp.x, vault.z.position.z - pp.z);
      if (d < 9 && Math.abs(P.vf) < 22) {
        vault.hold += dt; if (Math.floor(vault.hold * 3) !== Math.floor((vault.hold - dt) * 3)) sfx.alarm();
        state.vaultMsg = `🚨 VACIANDO LA CÁMARA… ${Math.max(0, 4 - vault.hold).toFixed(1)} s`;
        if (vault.hold >= 4) {
          const loot = Math.round(6000 * (1 + rankIdx(save.total) * 0.6));
          addCarried(loot, vault.z.position, '#ff2a4d', '¡GOLPE! +$');
          burst(new V3(vault.z.position.x, 2, vault.z.position.z), 200, 4, 0.4, 0.6, 26, 1.6, 10, 18);
          crime(9); save.heists++; persist();
          showMsg('💥 ¡GOLPE MAESTRO! ¡HUYE!', '#ff2a4d', 2.4); sfx.cash();
          closeVault(); state.vaultMsg = '';
        }
      } else { vault.hold = Math.max(0, vault.hold - dt); state.vaultMsg = ''; }
      vault.z.userData.prog.scale.setScalar(Math.max(0.001, vault.hold / 4 * 9));
      if (vault.life <= 0) { closeVault(); showMsg('LA CÁMARA SE HA CERRADO', '#ff7a8a', 1.6); }
    }
  }
  // carrera
  if (state.race) updateRace(dt);
  // flecha guía
  let target = null, col = null;
  if (state.race && state.race.cps[state.race.idx]) { target = state.race.cps[state.race.idx]; col = [3, 0.6, 2.6]; }
  else if (state.carried > 0 && (state.held >= U.cap || state.wanted === 0 && state.carried > 3000)) { target = nearestOf(banks, pp)[0]; col = [4, 3, 0.2]; }
  else if (gps.target) { target = gps.target; col = [0.4, 3, 4]; if (Math.hypot(gps.target.x - pp.x, gps.target.z - pp.z) < 12) gps.target = null; }
  else if (vault.active) { target = vault.z.position; col = [4, 0.3, 0.4]; }
  else if (nearestBag) { target = nearestBag.position; col = nearestBag.userData.gold ? [4, 3, 0.2] : [0.4, 4, 1.4]; }
  G.arrowTarget = target;
  if (target && playing) {
    arrow.visible = true;
    arrow.position.set(pp.x, (P.mesh.userData.bike ? 3.2 : 3.6) + Math.sin(t * 5) * 0.15, pp.z);
    arrow.rotation.y = Math.atan2(target.x - pp.x, target.z - pp.z);
    arrow.material.color.setRGB(col[0] * 0.45, col[1] * 0.45, col[2] * 0.45);
  } else arrow.visible = false;
}
export function resetActivities() { clearBags(); if (state.race) endRace(false); if (vault.active) closeVault(); vault.next = 75; }
