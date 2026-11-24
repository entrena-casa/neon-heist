// Tráfico civil: coches que van por su carril, giran en los cruces y frenan si hay algo delante
import { THREE, scene, V3, G, clamp, wrapAngle, isTouch, emit } from './core.js';
import { N, CELL, roadC, collideWorld, _n } from './world.js';
import { makeCar, TRAFFIC_D, COP_D, newCar, poseCar } from './vehicles.js';

export const traffic = [];
const MAX = isTouch ? 16 : 28;
const LANE = 4;
const NEONS = [0xff2bd6, 0x00f0ff, 0x39ff88, 0xffc400, 0xff7a1a, 0x9d4dff, 0xff2a4d];
const pool = [];
const right = (dx, dz) => [-dz, dx];
const inGrid = i => i >= -N - 1 && i <= N;

function takeMesh(patrol) {
  const i = pool.findIndex(m => m.userData.patrol === patrol);
  if (i >= 0) return pool.splice(i, 1)[0];
  if (patrol) { const m = makeCar(COP_D, 0x2b6bff, { police: true }); m.userData.patrol = true; return m; }
  const d = TRAFFIC_D[Math.floor(Math.random() * TRAFFIC_D.length)];
  const m = makeCar(d, NEONS[Math.floor(Math.random() * NEONS.length)], { dim: true });
  m.userData.patrol = false; return m;
}

function pickWaypoint(c) {
  const [dx, dz] = c.dir, opts = [];
  const r = right(dx, dz), l = [-r[0], -r[1]];
  for (const [d, w] of [[[dx, dz], 0.5], [r, 0.25], [l, 0.25]]) {
    const nx = c.ix + d[0], nz = c.iz + d[1];
    if (inGrid(nx) && inGrid(nz)) opts.push([d, w]);
  }
  let tot = opts.reduce((s, o) => s + o[1], 0), x = Math.random() * tot, out = opts[0] ? opts[0][0] : [-dx, -dz];
  for (const [d, w] of opts) { if ((x -= w) <= 0) { out = d; break; } }
  const Ix = roadC(c.ix), Iz = roadC(c.iz);
  const ri = right(dx, dz), ro = right(out[0], out[1]);
  if (out[0] === dx && out[1] === dz) c.wp.set(Ix + ri[0] * LANE, 0, Iz + ri[1] * LANE);
  else if (out[0] === -dx && out[1] === -dz) c.wp.set(Ix + ri[0] * LANE, 0, Iz + ri[1] * LANE);
  else c.wp.set(Ix + ri[0] * LANE + ro[0] * LANE, 0, Iz + ri[1] * LANE + ro[1] * LANE);
  c.turning = !(out[0] === dx && out[1] === dz);
  c.out = out;
}

export function spawnTraffic(minD = 90, maxD = 230) {
  const p = G.player.pos;
  for (let t = 0; t < 25; t++) {
    const vertical = Math.random() < 0.5, k = Math.floor(Math.random() * (2 * N + 2)) - N - 1, j = Math.floor(Math.random() * (2 * N + 1)) - N;
    const s = Math.random() < 0.5 ? 1 : -1;
    const dir = vertical ? [0, s] : [s, 0];
    const r = right(dir[0], dir[1]);
    const along = j * CELL + (Math.random() - 0.5) * 16;
    const x = vertical ? roadC(k) + r[0] * LANE : along, z = vertical ? along : roadC(k) + r[1] * LANE;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < minD || d > maxD) continue;
    if (traffic.some(o => Math.hypot(o.pos.x - x, o.pos.z - z) < 12)) continue;
    const patrol = Math.random() < 0.12;
    const mesh = takeMesh(patrol);
    const c = newCar(mesh, patrol ? 1.1 : 1);
    c.pos.set(x, 0, z); c.h = Math.atan2(dir[0], dir[1]); mesh.rotation.set(0, c.h, 0);
    Object.assign(c, { dir, wp: new V3(), speed: 10 + Math.random() * 6, cruise: 11 + Math.random() * 7, crashed: 0, spin: 0, stuck: 0, honkT: 0, patrol });
    // siguiente cruce en el sentido de la marcha
    if (vertical) { c.ix = k; c.iz = s > 0 ? Math.floor(along / CELL - 0.5) + 1 : Math.floor(along / CELL - 0.5); }
    else { c.iz = k; c.ix = s > 0 ? Math.floor(along / CELL - 0.5) + 1 : Math.floor(along / CELL - 0.5); }
    if (!inGrid(c.ix) || !inGrid(c.iz)) { pool.push(mesh); continue; }
    pickWaypoint(c);
    scene.add(mesh); traffic.push(c);
    return c;
  }
  return null;
}

export function removeTraffic(c, keepMesh = false) {
  const i = traffic.indexOf(c); if (i >= 0) traffic.splice(i, 1);
  if (!keepMesh) { scene.remove(c.mesh); c.mesh.rotation.set(0, 0, 0); pool.push(c.mesh); }
}
export function clearTraffic() { while (traffic.length) removeTraffic(traffic[0]); }

const _d = new V3();
export function updateTraffic(dt, obstacles) {
  const P = G.player.pos;
  if (traffic.length < MAX && Math.random() < 0.5) spawnTraffic(traffic.length < MAX / 2 ? 50 : 90, 230);
  for (let i = traffic.length - 1; i >= 0; i--) {
    const c = traffic[i];
    const dp = Math.hypot(c.pos.x - P.x, c.pos.z - P.z);
    if (dp > 270) { removeTraffic(c); continue; }
    if (c.crashed > 0) {
      c.crashed -= dt;
      c.vel.multiplyScalar(Math.exp(-2.2 * dt));
      c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
      c.h += c.spin * dt; c.spin *= Math.exp(-2 * dt);
      collideWorld(c.pos, c.vel, 2);
      c.vf = c.vel.length(); c.speed = 0;
      if (c.crashed <= 0) { c.dir = c.out; c.h = wrapAngle(c.h); }
      poseCar(c, dt);
      if (Math.random() < 0.2) emit(c.pos.x, 1.2, c.pos.z, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2, 0.6, 0.6, 0.7, 0.8, -2);
      continue;
    }
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    // ¿hay algo delante?
    let target = c.cruise;
    const dw = Math.hypot(c.wp.x - c.pos.x, c.wp.z - c.pos.z);
    if (c.turning && dw < 16) target = Math.min(target, 7);
    let blockedByPlayer = false;
    const check = (o, isPlayer) => {
      if (o === c) return;
      _d.set(o.pos.x - c.pos.x, 0, o.pos.z - c.pos.z);
      const along = _d.x * fx + _d.z * fz; if (along <= 0 || along > 15) return;
      const lat = Math.abs(-_d.x * fz + _d.z * fx); if (lat > 2.8) return;
      target = Math.min(target, Math.max(0, (along - 5.5) * 1.4));
      if (isPlayer && along < 10) blockedByPlayer = true;
    };
    check(G.player, true);
    for (const o of traffic) if (Math.abs(o.pos.x - c.pos.x) < 16 && Math.abs(o.pos.z - c.pos.z) < 16) check(o);
    for (const o of obstacles) if (Math.abs(o.pos.x - c.pos.x) < 16 && Math.abs(o.pos.z - c.pos.z) < 16) check(o);
    c.speed += clamp(target - c.speed, -18 * dt, 6 * dt);
    if (blockedByPlayer && c.speed < 2) {
      c.honkT += dt;
      if (c.honkT > 1.3) { c.honkT = -2.5 - Math.random() * 3; if (dp < 40 && G.onHonk) G.onHonk(c); }
    } else c.honkT = Math.min(c.honkT, 0);
    // volante hacia el punto de paso
    const want = Math.atan2(c.wp.x - c.pos.x, c.wp.z - c.pos.z);
    const diff = wrapAngle(want - c.h);
    const maxTurn = 3.2 * dt * clamp(c.speed / 6, 0.3, 1.2);
    c.h += clamp(diff, -maxTurn, maxTurn);
    c.steerVis = clamp(-diff * 2, -1, 1);
    c.pos.x += Math.sin(c.h) * c.speed * dt; c.pos.z += Math.cos(c.h) * c.speed * dt;
    c.vel.set(Math.sin(c.h) * c.speed, 0, Math.cos(c.h) * c.speed);
    c.vf = c.speed; c.vr = 0;
    if (dw < 3) { c.dir = c.out; c.ix += c.dir[0]; c.iz += c.dir[1]; if (!inGrid(c.ix) || !inGrid(c.iz)) { removeTraffic(c); continue; } pickWaypoint(c); }
    // atascado (empujado contra un edificio)
    if (c.speed < 0.5 && !blockedByPlayer) { c.stuck += dt; if (c.stuck > 8 && dp > 60) { removeTraffic(c); continue; } } else c.stuck = 0;
    collideWorld(c.pos, c.vel, 1.8);
    poseCar(c, dt);
    if (c.patrol) {
      const u = c.mesh.userData.bars, on = Math.sin(G.t * 3 + i) > 0.85; // patrulla: luces tranquilas
      u.red.color.setRGB(on ? 2 : 0.3, 0.05, 0.2); u.blue.color.setRGB(0.1, 0.3, on ? 0.4 : 2);
    }
  }
}
// choque del tráfico: se descontrola
export function knock(c, imp) {
  c.crashed = 2.2 + Math.min(2, imp / 15); c.spin = (Math.random() - 0.5) * Math.min(8, imp * 0.3);
}
export { _n };
