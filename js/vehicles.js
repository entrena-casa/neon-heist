// Vehículos: catálogo, modelos 3D (coches y motos), física y choques
import { THREE, V3, clamp, lerp, radialTex } from './core.js';
import { _n } from './world.js';

// accel, max (m/s), turn, grip, drift, mass
export const CATALOG = [
  { id: 'neon', name: 'MOTO NEÓN', type: 'bike', price: 0, s: { accel: 44, max: 54, turn: 2.9, grip: 12, drift: 1.9, mass: 0.7 }, desc: 'Ligera y ágil. La de siempre.' },
  { id: 'chispa', name: 'CHISPA', type: 'car', price: 0, s: { accel: 31, max: 43, turn: 2.6, grip: 10, drift: 1.6, mass: 1 }, desc: 'Compacto de barrio. Fiable.',
    d: { w: 2.0, l: 3.9, h: 0.7, cabW: 1.7, cabL: 1.9, cabH: 0.65, cabZ: -0.2, spoiler: false, body: 0x1a0633 } },
  { id: 'bisonte', name: 'BISONTE', type: 'car', price: 12000, s: { accel: 37, max: 50, turn: 2.3, grip: 9, drift: 1.5, mass: 1.6 }, desc: 'Muscle car. Embiste a la poli.',
    d: { w: 2.35, l: 4.9, h: 0.7, cabW: 1.8, cabL: 1.8, cabH: 0.55, cabZ: -0.6, spoiler: true, scoop: true, body: 0x2a0410 } },
  { id: 'kaze', name: 'KAZE', type: 'car', price: 20000, s: { accel: 39, max: 52, turn: 2.85, grip: 10, drift: 1.15, mass: 1 }, desc: 'Japonés de derrape. Da más pasta derrapando.',
    d: { w: 2.15, l: 4.4, h: 0.6, cabW: 1.75, cabL: 1.9, cabH: 0.55, cabZ: -0.3, spoiler: true, wing: true, body: 0x04121f } },
  { id: 'relampago', name: 'RELÁMPAGO', type: 'bike', price: 35000, s: { accel: 56, max: 66, turn: 3.1, grip: 13, drift: 2, mass: 0.75 }, desc: 'Superbike. Pura aceleración.' },
  { id: 'tanque', name: 'TANQUE', type: 'car', price: 45000, s: { accel: 27, max: 44, turn: 2.2, grip: 9, drift: 1.6, mass: 2.8, armor: 0.55 }, desc: 'Furgón blindado. Casi no te pillan.',
    d: { w: 2.5, l: 5.4, h: 1.5, cabW: 2.3, cabL: 1.6, cabH: 0.7, cabZ: 1.6, spoiler: false, boxy: true, body: 0x101418 } },
  { id: 'vortex', name: 'VORTEX', type: 'car', price: 60000, s: { accel: 49, max: 64, turn: 2.75, grip: 11, drift: 1.5, mass: 1.1 }, desc: 'Superdeportivo. Rápido de verdad.',
    d: { w: 2.3, l: 4.7, h: 0.5, cabW: 1.6, cabL: 1.7, cabH: 0.5, cabZ: -0.1, spoiler: true, wing: true, low: true, body: 0x18002a } },
  { id: 'quasar', name: 'QUÁSAR', type: 'car', price: 150000, s: { accel: 60, max: 77, turn: 2.8, grip: 12, drift: 1.5, mass: 1.2 }, desc: 'Hiperdeportivo. Lo más rápido con ruedas.',
    d: { w: 2.4, l: 5.0, h: 0.48, cabW: 1.5, cabL: 1.6, cabH: 0.48, cabZ: 0, spoiler: true, wing: true, low: true, fins: true, body: 0x05050a } },
  { id: 'luzcero', name: 'LUZ CERO', type: 'bike', price: 300000, s: { accel: 66, max: 86, turn: 3.3, grip: 14, drift: 2.1, mass: 0.8 }, desc: 'Moto de luz. El final del juego.', tron: true },
];
export const byId = id => CATALOG.find(c => c.id === id) || CATALOG[0];

const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.38, 16);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.7 });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------- coche genérico ----------
export function makeCar(d, neonHex, opt = {}) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const tilt = new THREE.Group(); g.add(tilt);
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(neonHex).multiplyScalar(opt.dim ? 1.4 : 3) });
  const paint = new THREE.MeshStandardMaterial({ color: d.body ?? 0x1a0633, metalness: 0.8, roughness: 0.25 });
  const H = d.h, base = d.low ? 0.5 : 0.6;
  const body = new THREE.Mesh(box(d.w, H, d.l), paint); body.position.y = base + H / 2; tilt.add(body);
  const top = base + H;
  if (!d.boxy) { const nose = new THREE.Mesh(box(d.w - 0.15, 0.25, d.l * 0.26), paint); nose.position.set(0, top + 0.1, d.l * 0.35); nose.rotation.x = 0.06; tilt.add(nose); }
  const glass = new THREE.MeshStandardMaterial({ color: 0x030306, metalness: 1, roughness: 0.05, emissive: neonHex, emissiveIntensity: 0.12 });
  const cab = new THREE.Mesh(box(d.cabW, d.cabH, d.cabL), glass); cab.position.set(0, top + d.cabH / 2, d.cabZ); tilt.add(cab);
  if (d.boxy) { // caja del furgón
    const cargo = new THREE.Mesh(box(d.w, 1.1, d.l * 0.62), paint); cargo.position.set(0, top + 0.55, -d.l * 0.17); tilt.add(cargo);
    for (const s of [-1, 1]) { const st = new THREE.Mesh(box(0.05, 0.08, d.l * 0.6), neon); st.position.set(s * (d.w / 2 + 0.02), top + 0.9, -d.l * 0.17); tilt.add(st); }
    const rail = new THREE.Mesh(box(d.w, 0.06, 0.06), neon); rail.position.set(0, top + 1.12, -d.l * 0.48); tilt.add(rail);
  }
  if (d.scoop) { const sc = new THREE.Mesh(box(0.7, 0.25, 1.1), paint); sc.position.set(0, top + 0.12, d.l * 0.22); tilt.add(sc); const sl = new THREE.Mesh(box(0.7, 0.05, 0.05), neon); sl.position.set(0, top + 0.25, d.l * 0.22 + 0.55); tilt.add(sl); }
  if (d.spoiler) {
    const y = top + (d.wing ? 0.55 : 0.12);
    const sp = new THREE.Mesh(box(d.w * 0.98, 0.08, 0.5), neon); sp.position.set(0, y, -d.l / 2 + 0.25); tilt.add(sp);
    if (d.wing) for (const s of [-1, 1]) { const p = new THREE.Mesh(box(0.08, 0.5, 0.25), paint); p.position.set(s * d.w * 0.32, y - 0.25, -d.l / 2 + 0.3); tilt.add(p); }
  }
  if (d.fins) for (const s of [-1, 1]) { const f = new THREE.Mesh(box(0.06, 0.45, 1.2), neon); f.position.set(s * 0.5, top + 0.3, -d.l / 2 + 0.7); tilt.add(f); }
  for (const s of [-1, 1]) {
    const strip = new THREE.Mesh(box(0.06, 0.08, d.l * 0.97), neon); strip.position.set(s * (d.w / 2 + 0.02), base + 0.04, 0); tilt.add(strip);
    const hl = new THREE.Mesh(box(d.w * 0.27, 0.15, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4.5) })); hl.position.set(s * d.w * 0.3, top - 0.12, d.l / 2 + 0.01); tilt.add(hl);
    const tl = new THREE.Mesh(box(d.w * 0.3, 0.13, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.15, 0.3) })); tl.position.set(s * d.w * 0.29, top - 0.1, -d.l / 2 - 0.01); tilt.add(tl);
  }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(d.w + 1.4, d.l + 1.8), new THREE.MeshBasicMaterial({ map: radialTex, color: new THREE.Color(neonHex).multiplyScalar(opt.dim ? 0.3 : 0.75), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  under.rotation.x = -Math.PI / 2; under.position.y = 0.06; g.add(under);
  const front = [], wheels = [];
  const wz = d.l / 2 - 0.85, wx = d.w / 2 - 0.02;
  for (const [x, z] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    const piv = new THREE.Group(); piv.position.set(x, 0.44, z); g.add(piv);
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2; piv.add(w);
    wheels.push(w); if (z > 0) front.push(piv);
  }
  let bars = null;
  if (opt.police) {
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.1, 0.3) });
    const blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.5, 6) });
    const r = new THREE.Mesh(box(0.72, 0.22, 0.4), red); r.position.set(-0.42, top + d.cabH + 0.11, d.cabZ);
    const b = new THREE.Mesh(box(0.72, 0.22, 0.4), blue); b.position.set(0.42, top + d.cabH + 0.11, d.cabZ);
    tilt.add(r, b); bars = { r, b, red, blue };
    const door = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, metalness: 0.5, roughness: 0.3 });
    for (const s of [-1, 1]) { const dd = new THREE.Mesh(box(0.05, 0.4, 2), door); dd.position.set(s * (d.w / 2 + 0.01), base + H / 2, 0.1); tilt.add(dd); }
  }
  g.userData = { tilt, front, wheels, bars, under, neon, len: d.l, wid: d.w };
  return g;
}

// ---------- moto con piloto ----------
const tireGeo = new THREE.TorusGeometry(0.62, 0.13, 10, 36); tireGeo.rotateY(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 24); rimGeo.rotateZ(Math.PI / 2);
const spokeGeo = box(0.08, 1.0, 0.06);
export function makeBike(neonHex, opt = {}) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const lean = new THREE.Group(); g.add(lean);
  const tilt = new THREE.Group(); lean.add(tilt); tilt.position.z = -1.05;
  const body = new THREE.Group(); body.position.z = 1.05; tilt.add(body);
  const C = new THREE.Color(neonHex);
  const neon = new THREE.MeshBasicMaterial({ color: C.clone().multiplyScalar(2) });
  const accentHex = opt.accent ?? 0xff2bd6;
  const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentHex).multiplyScalar(2) });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0418, metalness: 0.9, roughness: 0.25, emissive: neonHex, emissiveIntensity: 0.08 });
  const black = new THREE.MeshStandardMaterial({ color: 0x020205, metalness: 1, roughness: 0.1 });
  const edges = (mesh, mat) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: (mat || neon).color })); l.position.copy(mesh.position); l.rotation.copy(mesh.rotation); l.scale.copy(mesh.scale); mesh.parent.add(l); };
  const wheels = [];
  for (const z of [1.05, -1.05]) {
    const w = new THREE.Group(); w.position.set(0, 0.75, z); body.add(w);
    w.add(new THREE.Mesh(tireGeo, neon));
    w.add(new THREE.Mesh(rimGeo, black));
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(spokeGeo, pink); sp.rotation.x = k * Math.PI / 3; w.add(sp); }
    wheels.push(w);
  }
  const add = (geo, mat, x, y, z, rx = 0, e) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; body.add(m); if (e !== undefined) edges(m, e || undefined); return m; };
  if (opt.tron) {
    // carenado cerrado de moto de luz
    add(box(0.7, 0.75, 2.6), dark, 0, 1.15, 0, 0, null);
    add(box(0.72, 0.06, 2.62), neon, 0, 1.0, 0);
    add(box(0.5, 0.3, 1.0), dark, 0, 1.6, 0.55, -0.25, null);
  } else {
    add(box(0.62, 0.5, 1.25), dark, 0, 1.35, 0.25, 0.12, null);
    add(box(0.5, 0.42, 1.5), dark, 0, 0.95, 0, 0, pink);
    add(box(0.5, 0.16, 0.9), black, 0, 1.42, -0.62, -0.12);
    add(box(0.42, 0.22, 0.6), dark, 0, 1.45, -1.15, -0.25, null);
    add(box(0.66, 0.55, 0.5), dark, 0, 1.62, 1.0, -0.5, null);
    add(box(0.1, 1.2, 0.1), neon, 0, 1.22, 1.0, -0.35);
    add(box(0.1, 0.1, 1.1), neon, 0, 0.8, -0.55);
    for (const s of [-1, 1]) { const st = new THREE.Mesh(box(0.04, 0.05, 2.2), neon); st.position.set(s * 0.27, 1.05, 0); body.add(st); }
  }
  add(box(0.4, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 6) }), 0, 1.62, 1.28, -0.5);
  add(box(0.36, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.15, 0.4) }), 0, 1.52, -1.46);
  // piloto
  const suit = new THREE.MeshStandardMaterial({ color: 0x07030f, metalness: 0.6, roughness: 0.35 });
  const rider = new THREE.Group(); rider.position.set(0, 1.5, -0.35); body.add(rider);
  const R = (geo, mat, x, y, z, rx = 0, e) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; rider.add(m); if (e) edges(m); return m; };
  R(box(0.62, 0.95, 0.4), suit, 0, 0.45, 0.3, 0.85, true);
  R(new THREE.SphereGeometry(0.3, 18, 12), black, 0, 0.95, 0.78);
  R(box(0.5, 0.14, 0.12), pink, 0, 0.98, 1.03);
  R(box(0.05, 0.06, 0.55), neon, 0, 1.27, 0.75);
  for (const s of [-1, 1]) {
    R(box(0.14, 0.14, 0.85), suit, s * 0.34, 0.6, 0.95, 0.35);
    R(box(0.03, 0.03, 0.8), neon, s * 0.42, 0.6, 0.95, 0.35);
    R(box(0.18, 0.18, 0.8), suit, s * 0.34, -0.05, 0.05, -0.4);
    R(box(0.03, 0.03, 0.75), pink, s * 0.44, -0.05, 0.05, -0.4);
  }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.2), new THREE.MeshBasicMaterial({ map: radialTex, color: C.clone().multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  under.rotation.x = -Math.PI / 2; under.position.y = 0.06; g.add(under);
  g.userData = { lean, tilt, wheels, front: [wheels[0]], under, bike: true, neon, len: 2.6, wid: 0.8 };
  return g;
}

export function makeVehicleMesh(spec, neonHex) {
  if (spec.type === 'bike') return makeBike(neonHex, { tron: spec.tron, accent: spec.id === 'relampago' ? 0xffd200 : 0xff2bd6 });
  return makeCar(spec.d, neonHex);
}

// ---------- modelos de la poli y del tráfico ----------
export const COP_D = { w: 2.25, l: 4.6, h: 0.62, cabW: 1.85, cabL: 2.1, cabH: 0.6, cabZ: -0.35, spoiler: false, body: 0x0b0b18 };
export const TRAFFIC_D = [
  { w: 2.0, l: 4.0, h: 0.75, cabW: 1.75, cabL: 2.0, cabH: 0.62, cabZ: -0.2, body: 0x22222c },
  { w: 2.1, l: 4.6, h: 0.7, cabW: 1.8, cabL: 2.3, cabH: 0.6, cabZ: -0.3, body: 0x2c1a10 },
  { w: 2.3, l: 5.6, h: 1.4, cabW: 2.2, cabL: 1.4, cabH: 0.7, cabZ: 1.9, boxy: true, body: 0x1c2430 },
  { w: 1.9, l: 3.6, h: 0.72, cabW: 1.65, cabL: 1.8, cabH: 0.62, cabZ: -0.1, body: 0x0c2a22 },
  { w: 2.1, l: 4.8, h: 0.68, cabW: 1.8, cabL: 2.6, cabH: 0.62, cabZ: -0.3, body: 0x2a2a08 }, // taxi
];

// ================== FÍSICA ==================
export function newCar(mesh, mass = 1) { return { mesh, pos: mesh.position, h: 0, vel: new V3(), vf: 0, vr: 0, steerVis: 0, accelVis: 0, mass, wt: 0 }; }

export function stepCar(c, ctl, P, dt) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h), sx = fz, sz = -fx;
  let vf = c.vel.x * fx + c.vel.z * fz, vr = c.vel.x * sx + c.vel.z * sz;
  const v0 = vf;
  if (ctl.throttle > 0) vf += P.accel * ctl.throttle * dt * (vf < 0 ? 2.5 : 1);
  else if (ctl.throttle < 0) { if (vf > 0.5) vf -= P.brake * dt; else vf -= P.accel * 0.6 * dt; }
  else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt);
  if (ctl.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);
  if (vf > P.max) vf = Math.max(P.max, Math.min(vf, c.vfPrev ?? vf) - 22 * dt);
  if (vf < -P.rev) vf = -P.rev;
  vr *= Math.exp(-(ctl.handbrake ? P.gripDrift : P.grip) * dt);
  const sp = Math.abs(vf);
  let turn = P.turn * Math.min(1, sp / 9) * (1 - 0.32 * Math.min(1, sp / 70));
  if (ctl.handbrake) turn *= 1.5;
  c.h -= ctl.steer * turn * dt * (vf < -0.5 ? -1 : 1);
  c.vel.set(fx * vf + sx * vr, 0, fz * vf + sz * vr);
  c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
  c.vf = vf; c.vr = vr; c.vfPrev = vf;
  c.steerVis = lerp(c.steerVis, ctl.steer, Math.min(1, 10 * dt));
  c.accelVis = lerp(c.accelVis, (vf - v0) / Math.max(dt, 1e-3), Math.min(1, 5 * dt));
}
export function poseCar(c, dt) {
  const u = c.mesh.userData;
  c.mesh.rotation.y = c.h;
  if (u.bike) {
    const sp = Math.abs(c.vf);
    const target = c.steerVis * clamp(sp / 30, 0, 1) * 0.62 + clamp(-c.vr * 0.02, -0.2, 0.2);
    u.lean.rotation.z = lerp(u.lean.rotation.z, target, Math.min(1, 8 * dt || 1));
    const wh = c.wheelie ? -0.42 + Math.sin(c.wt * 9) * 0.04 : 0;
    u.tilt.rotation.x = lerp(u.tilt.rotation.x, wh, Math.min(1, 6 * dt || 1));
    u.wheels[0].rotation.y = -c.steerVis * 0.25;
    for (const w of u.wheels) w.children.forEach(m => m.rotation.x += c.vf * dt / 0.62);
    return;
  }
  u.tilt.rotation.z = clamp(c.vr * 0.012, -0.12, 0.12);
  u.tilt.rotation.x = clamp(-c.accelVis * 0.0025, -0.08, 0.08);
  for (const f of u.front) f.rotation.y = -c.steerVis * 0.45;
  for (const w of u.wheels) w.rotation.x += c.vf * dt / 0.44;
}
// choque entre dos vehículos (círculos). Devuelve velocidad de impacto; normal en _n (de a hacia b)
export function carCollide(a, b, R) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
  if (d2 > R * R || d2 < 1e-6) return 0;
  const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = R - d;
  const ma = a.mass || 1, mb = b.mass || 1, ka = mb / (ma + mb), kb = ma / (ma + mb);
  a.pos.x -= nx * pen * ka; a.pos.z -= nz * pen * ka; b.pos.x += nx * pen * kb; b.pos.z += nz * pen * kb;
  const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
  if (rel < 0) {
    const j = -1.4 * rel;
    a.vel.x -= j * ka * nx; a.vel.z -= j * ka * nz; b.vel.x += j * kb * nx; b.vel.z += j * kb * nz;
  }
  _n.set(nx, 0, nz);
  return -rel;
}
export const radiusOf = c => c.mesh.userData.bike ? 1.4 : Math.max(1.9, (c.mesh.userData.len || 4.4) * 0.45);
