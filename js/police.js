// Policía: persecuciones, nivel de búsqueda, escapar, patrullas y helicóptero
import { THREE, scene, V3, G, clamp, wrapAngle, emit, burst, flashLight, copLightR, copLightB, radialTex, showMsg, isTouch } from './core.js';
import { N, CELL, roadC, interIdx, los, collideWorld, _n } from './world.js';
import { makeCar, COP_D, newCar, stepCar, poseCar, carCollide } from './vehicles.js';
import { state, crime, wantedFromHeat, addCarried, U } from './state.js';
import { sfx } from './audio.js';
import { traffic, removeTraffic, knock } from './traffic.js';

export const cops = [];
const pool = [];
function copParams() {
  const w = Math.max(1, state.wanted);
  return { accel: 30 + w * 2.5, brake: 55, max: 36 + w * 3.8, rev: 14, grip: 8, gripDrift: 1.8, turn: 2.6 };
}
function nextWaypoint(c) {
  const p = G.player.pos;
  const ix = interIdx(c.pos.x), iz = interIdx(c.pos.z), cx = roadC(ix), cz = roadC(iz);
  if (Math.hypot(c.pos.x - cx, c.pos.z - cz) > 12) return new V3(cx, 0, cz);
  let best = null, bd = Infinity;
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = ix + ax, nz = iz + az;
    if (nx < -N - 1 || nx > N || nz < -N - 1 || nz > N) continue;
    const px = roadC(nx), pz = roadC(nz);
    let d = Math.hypot(px - p.x, pz - p.z) + Math.random() * 12;
    if (c.lastI && c.lastI[0] === nx && c.lastI[1] === nz) d += 70;
    if (d < bd) { bd = d; best = [px, pz]; }
  }
  c.lastI = [ix, iz];
  return new V3(best[0], 0, best[1]);
}
function initCop(c) {
  Object.assign(c, { wp: null, lastI: null, stuck: 0, reverse: 0, phase: Math.random() * 6, dead: false, deadT: 0, vy: 0, spinX: 0, spinZ: 0, leaveT: 0 });
  cops.push(c); return c;
}
export function spawnCop(minD = 110, maxD = 200) {
  const P = G.player.pos;
  let p = null;
  for (let t = 0; t < 40 && !p; t++) {
    const ix = Math.floor(Math.random() * (2 * N + 2)) - N - 1, iz = Math.floor(Math.random() * (2 * N + 2)) - N - 1;
    const q = new V3(roadC(ix), 0, roadC(iz)), d = q.distanceTo(P);
    if (d > minD && d < maxD && !cops.some(c => c.pos.distanceTo(q) < 8)) p = q;
  }
  if (!p) return;
  const mesh = pool.pop() || makeCar(COP_D, 0x2b6bff, { police: true });
  mesh.rotation.set(0, 0, 0); mesh.position.set(0, 0, 0);
  const c = newCar(mesh, 1.1);
  c.pos.copy(p); c.h = Math.atan2(P.x - p.x, P.z - p.z);
  scene.add(mesh); initCop(c);
}
// una patrulla del tráfico se une a la persecución
export function copFromPatrol(t) {
  removeTraffic(t, true);
  const c = newCar(t.mesh, 1.1); c.h = t.h; c.vel.copy(t.vel);
  initCop(c); return c;
}
function removeCop(c) { scene.remove(c.mesh); c.removed = true; pool.push(c.mesh); }
export function clearCops() { for (const c of cops) removeCop(c); cops.length = 0; }

export function wreckCop(c, bonus) {
  if (c.dead) return;
  c.dead = true; c.deadT = 0; c.vy = 14 + Math.random() * 6;
  c.spinX = (Math.random() - 0.5) * 10; c.spinZ = (Math.random() - 0.5) * 12;
  burst(new V3(c.pos.x, 1.5, c.pos.z), 60, 4, 1.6, 0.3, 22, 1.2);
  sfx.crash(1); G.shake = Math.max(G.shake, 0.9);
  if (bonus) { addCarried(750, c.pos, '#ff2bd6', '¡POLI FUERA! +$'); crime(1.2); state.session.wrecked++; }
}

// ================== HELICÓPTERO ==================
export const heli = (() => {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b16, metalness: 0.8, roughness: 0.3 });
  const neon = new THREE.LineBasicMaterial({ color: new THREE.Color(0.4, 0.8, 3) });
  const addE = m => { g.add(m); const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), neon); e.position.copy(m.position); e.rotation.copy(m.rotation); g.add(e); };
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 5.2), dark); addE(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 5.5), dark); tail.position.set(0, 0.4, -5.2); addE(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 1), dark); fin.position.set(0, 1, -7.6); addE(fin);
  const rotor = new THREE.Group(); rotor.position.y = 1.5; g.add(rotor);
  const bladeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.6, 1.2) });
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 0.4), bladeM); b.rotation.y = i * Math.PI / 2; rotor.add(b); }
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.3) })); red.position.set(-1.5, -0.6, 0); g.add(red);
  const blue = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.4, 6) })); blue.position.set(1.5, -0.6, 0); g.add(blue);
  g.visible = false; scene.add(g);
  const coneGeo = new THREE.ConeGeometry(7, 1, 32, 1, true); coneGeo.translate(0, -0.5, 0);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.34, 0.5), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.visible = false; scene.add(cone);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), new THREE.MeshBasicMaterial({ map: radialTex, color: new THREE.Color(0.5, 0.55, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.1; pool.visible = false; scene.add(pool);
  const target = new V3(), vel = new V3();
  let active = false, spotted = false;
  return {
    get active() { return active; }, get spotted() { return spotted; }, group: g, target,
    reset() { active = false; g.visible = cone.visible = pool.visible = false; spotted = false; },
    update(dt) {
      const want = state.wanted >= 4 && state.mode === 'play';
      const P = G.player.pos;
      if (want && !active) { active = true; g.position.set(P.x + 150, 45, P.z + 150); target.copy(P); vel.set(0, 0, 0); showMsg('🚁 ¡HELICÓPTERO!', '#8ab4ff', 1.6); }
      if (!want && active) { active = false; }
      if (!active) {
        if (g.visible) { g.position.y += 15 * dt; g.position.x += 30 * dt; if (g.position.y > 90) { g.visible = false; } }
        cone.visible = pool.visible = false; spotted = false; return;
      }
      g.visible = cone.visible = pool.visible = true;
      // vuela hacia el jugador, un poco por detrás
      const goal = new V3(P.x - Math.sin(G.player.h) * 14, 38, P.z - Math.cos(G.player.h) * 14);
      const d = goal.clone().sub(g.position);
      vel.add(d.multiplyScalar(dt * 0.9)).multiplyScalar(Math.exp(-1.4 * dt));
      if (vel.length() > 48) vel.setLength(48);
      g.position.addScaledVector(vel, dt);
      g.rotation.y = Math.atan2(vel.x, vel.z); g.rotation.x = clamp(vel.length() * 0.008, 0, 0.3);
      rotor.rotation.y += dt * 30;
      const on = Math.sin(G.t * 10) > 0; red.visible = on; blue.visible = !on;
      // el foco persigue con retraso: si vas rápido, lo pierdes
      target.lerp(new V3(P.x, 0, P.z), 1 - Math.exp(-1.25 * dt));
      const from = g.position.clone().add(new V3(0, -1.2, 0));
      const dir = target.clone().sub(from); const len = dir.length();
      cone.position.copy(from); cone.scale.set(1, len, 1);
      cone.quaternion.setFromUnitVectors(new V3(0, -1, 0), dir.normalize());
      pool.position.set(target.x, 0.1, target.z);
      spotted = Math.hypot(P.x - target.x, P.z - target.z) < 7.5;
      pool.material.color.setRGB(spotted ? 0.9 : 0.5, spotted ? 0.45 : 0.55, spotted ? 0.45 : 0.7);
    }
  };
})();

// ================== BUCLE DE LA POLI ==================
let lastWanted = 0;
export function updatePolice(dt, playerHit) {
  const P = G.player, pp = P.pos;
  const playing = state.mode === 'play';
  // nivel de búsqueda
  const w = wantedFromHeat(state.heat);
  if (w !== state.wanted) {
    if (w > state.wanted && w > 0) { showMsg('★'.repeat(w) + (lastWanted === 0 ? '  ¡TE BUSCAN!' : '  ¡MÁS POLIS!'), '#ff2a4d', 1.8); sfx.level(); }
    state.wanted = w; G.onWanted && G.onWanted();
  }
  lastWanted = w;
  const maxCops = isTouch ? [0, 2, 3, 4, 5, 6] : [0, 2, 3, 5, 7, 9];
  const want = playing ? maxCops[state.wanted] : 0;
  state.spawnT = (state.spawnT || 0) - dt;
  const alive = cops.filter(c => !c.dead).length;
  if (alive < want && state.spawnT <= 0) { spawnCop(alive === 0 ? 70 : 110, 210); state.spawnT = 2.4; }
  // patrullas cercanas se unen si te buscan
  if (state.wanted > 0 && playing) for (let i = traffic.length - 1; i >= 0; i--) {
    const t = traffic[i]; if (!t.patrol || t.crashed > 0) continue;
    const d = Math.hypot(t.pos.x - pp.x, t.pos.z - pp.z);
    if (d < 70 && los(t.pos, pp)) copFromPatrol(t);
  }
  heli.update(dt);
  let seen = heli.spotted, near = 0, nearest = null, nd = Infinity;
  for (const c of cops) {
    updateCop(c, dt);
    if (c.dead || c.removed) continue;
    const d = c.pos.distanceTo(pp);
    if (d < nd) { nd = d; nearest = c; }
    if (d > 320) { removeCop(c); continue; }
    if (d < 120 && (d < 25 || los(c.pos, pp))) seen = true;
    if (!playing) continue;
    const imp = carCollide(P, c, P.radius + 2);
    if (imp > 5) {
      const strong = P.mass >= 1.5 && imp > 18;
      if ((P.isBoost && imp > (P.mesh.userData.bike ? 12 : 16)) || strong) wreckCop(c, true);
      else {
        if (state.wanted === 0) crime(1);
        state.busted += (0.03 + imp * 0.004) * U.armor * (P.armor || 1); G.shake = Math.max(G.shake, Math.min(0.8, imp / 30));
        for (let i = 0; i < 16; i++) emit(pp.x + _n.x * 2, 1, pp.z + _n.z * 2, (Math.random() - 0.5) * 16, Math.random() * 7, (Math.random() - 0.5) * 16, 4, 3, 1.4, 0.5);
        sfx.crash(Math.min(1, imp / 30));
      }
    }
    if (d < 11) near++;
  }
  // choques entre polis y contra el tráfico
  for (let i = 0; i < cops.length; i++) {
    const a = cops[i]; if (a.dead || a.removed) continue;
    for (let j = i + 1; j < cops.length; j++) {
      const b = cops[j]; if (b.dead || b.removed) continue;
      const imp = carCollide(a, b, 3.9);
      if (imp > 30) { wreckCop(a, true); wreckCop(b, true); }
    }
    for (const t of traffic) { if (Math.abs(t.pos.x - a.pos.x) > 6 || Math.abs(t.pos.z - a.pos.z) > 6) continue; const imp = carCollide(a, t, 3.8); if (imp > 8) knock(t, imp); }
  }
  for (let i = cops.length - 1; i >= 0; i--) if (cops[i].removed) cops.splice(i, 1);
  if (!playing) { copLightR.intensity = copLightB.intensity = 0; return { nearest, nd }; }
  // ¿te pillan?
  const sp = Math.abs(P.vf);
  if (near > 0 && sp < 12 && state.wanted > 0) state.busted += dt * 0.3 * near * (1 - sp / 14) * U.armor * (P.armor || 1);
  else state.busted = Math.max(0, state.busted - dt * (near ? 0.08 : 0.22));
  state.busted = clamp(state.busted, 0, 1);
  // escapar
  if (state.wanted > 0) {
    if (seen) { state.escapeT = 0; state.heat += dt / 32; }
    else {
      state.escapeT += dt;
      const need = 6 + state.wanted * 2.5;
      if (state.escapeT > need) {
        state.heat = 0; state.escapeT = 0;
        showMsg('¡HAS ESCAPADO!', '#39ff88', 2); sfx.escape();
        G.onEscape && G.onEscape();
      }
    }
  }
  state.seen = seen;
  // luces de la poli cercana
  if (nearest && nd < 90) {
    const on = Math.sin(G.t * 18 + nearest.phase) > 0;
    copLightR.position.set(nearest.pos.x - 1, 3, nearest.pos.z); copLightB.position.set(nearest.pos.x + 1, 3, nearest.pos.z);
    copLightR.intensity = on ? 260 : 0; copLightB.intensity = on ? 0 : 300;
  } else copLightR.intensity = copLightB.intensity = 0;
  return { nearest, nd };
}

function updateCop(c, dt) {
  if (c.dead) {
    c.deadT += dt; c.vy -= 32 * dt; c.pos.y += c.vy * dt;
    if (c.pos.y < 0) { c.pos.y = 0; c.vy *= -0.35; c.spinX *= 0.6; c.spinZ *= 0.6; }
    c.mesh.rotation.x += c.spinX * dt; c.mesh.rotation.z += c.spinZ * dt;
    c.vel.multiplyScalar(Math.exp(-1.2 * dt)); c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
    collideWorld(c.pos, c.vel, 2);
    if (Math.random() < 0.7) emit(c.pos.x, c.pos.y + 1.2, c.pos.z, (Math.random() - 0.5) * 3, 4 + Math.random() * 3, (Math.random() - 0.5) * 3, 3, 0.9, 0.2, 0.7, -2);
    if (c.deadT > 2.3) {
      burst(new V3(c.pos.x, 1.5, c.pos.z), 140, 5, 2, 0.4, 34, 1.4, 14, 16);
      burst(new V3(c.pos.x, 1.5, c.pos.z), 50, 0.8, 0.2, 2.5, 20, 1.6, 6, 10);
      flashLight.position.set(c.pos.x, 5, c.pos.z); flashLight.intensity = 900;
      sfx.explode(); G.shake = Math.max(G.shake, 1.1 * clamp(1 - c.pos.distanceTo(G.player.pos) / 120, 0, 1));
      c.pos.y = 0; c.mesh.rotation.set(0, 0, 0); removeCop(c);
    }
    return;
  }
  const P = copParams(), pp = G.player.pos;
  if (state.mode !== 'play' || state.wanted === 0) {
    stepCar(c, { throttle: 0, steer: 0, handbrake: true }, P, dt);
    c.leaveT += dt;
    if (c.leaveT > 6 || c.pos.distanceTo(pp) > 140) removeCop(c);
  } else {
    c.leaveT = 0;
    const toP = c.pos.distanceTo(pp);
    let target;
    if (toP < 20 || heli.spotted || los(c.pos, pp)) {
      const lead = clamp(toP / 50, 0, 0.9);
      target = new V3(pp.x + G.player.vel.x * lead, 0, pp.z + G.player.vel.z * lead);
      c.wp = null;
    } else {
      if (!c.wp || Math.hypot(c.pos.x - c.wp.x, c.pos.z - c.wp.z) < 10) c.wp = nextWaypoint(c);
      target = c.wp;
    }
    if (toP > 130) P.max *= 1.25;
    const diff = wrapAngle(Math.atan2(target.x - c.pos.x, target.z - c.pos.z) - c.h);
    const ctl = { throttle: 1, steer: clamp(-diff * 2.4, -1, 1), handbrake: false };
    if (Math.abs(diff) > 0.6 && c.vf > 16) ctl.throttle = 0.15;
    if (Math.abs(diff) > 1.0 && c.vf > 14) ctl.handbrake = true;
    if (Math.abs(c.vf) < 3 && c.reverse <= 0) { c.stuck += dt; if (c.stuck > 1) { c.reverse = 0.9; c.stuck = 0; } }
    else c.stuck = Math.max(0, c.stuck - dt * 0.5);
    if (c.reverse > 0) { c.reverse -= dt; ctl.throttle = -1; ctl.steer = -ctl.steer; ctl.handbrake = false; }
    stepCar(c, ctl, P, dt);
  }
  const hit = collideWorld(c.pos, c.vel, 2.1);
  if (hit > 12 && c.pos.distanceTo(pp) < 70) {
    for (let i = 0; i < 10; i++) emit(c.pos.x - _n.x * 2, 0.8, c.pos.z - _n.z * 2, (Math.random() - 0.5) * 12, Math.random() * 6, (Math.random() - 0.5) * 12, 4, 3, 1, 0.5);
  }
  poseCar(c, dt);
  const u = c.mesh.userData.bars, on = Math.sin(G.t * 18 + c.phase) > 0;
  u.red.color.setRGB(on ? 6 : 0.3, 0.05, 0.2); u.blue.color.setRGB(0.1, 0.3, on ? 0.4 : 7);
  c.mesh.userData.under.material.color.setRGB(on ? 1.6 : 0.2, 0.05, on ? 0.2 : 1.8);
}
