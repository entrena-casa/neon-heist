// Ciudad abierta: distritos, edificios, farolas, parques, calles, colisiones y puntos fijos
import { THREE, scene, rand, V3, clamp, winTex, radialTex, signTex } from './core.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CELL = 46, BLOCK = 30, N = 11;           // bloques de -N..N, calles de 16 de ancho
export const EDGE = (N + 0.5) * CELL + 7;               // límite exterior
export const roadC = k => (k + 0.5) * CELL;             // centro de la calle k (k = -N-1..N)
export const interIdx = x => clamp(Math.round(x / CELL - 0.5), -N - 1, N);

export const DISTRICTS = [
  { name: 'DISTRITO NEÓN', pal: [0x00f0ff, 0xff2bd6, 0x9d4dff, 0x2b6bff], words: ['NEON', 'HOTEL', 'CASINO', 'CLUB', 'BANCO', 'DISCO', 'ARCADE', '24H'], lamp: 0x9fe8ff },
  { name: 'CHINATOWN', pal: [0xff2a4d, 0xffc400, 0xff7a1a], words: ['RAMEN', 'SUSHI', 'DRAGÓN', 'KARAOKE', 'TÉ', 'MAHJONG'], lamp: 0xffb070 },
  { name: 'BARRIO ROSA', pal: [0xff2bd6, 0xff6ad5, 0x9d4dff], words: ['BAR', 'DISCO', 'LOVE', 'MOTEL', 'BAILE', 'COCTEL'], lamp: 0xff8ae8 },
  { name: 'EL PUERTO', pal: [0x2b6bff, 0x00f0ff, 0x39ff88], words: ['PUERTO', 'MUELLE', 'PESCA', 'ADUANA', 'FERRY'], lamp: 0x8ad0ff },
  { name: 'POLÍGONO', pal: [0xff7a1a, 0xffd200, 0x39ff88], words: ['TALLER', 'NAVE 7', 'MOTOR', 'GARAJE', 'CHATARRA'], lamp: 0xffd27a },
];
export function districtAt(x, z) {
  if (Math.hypot(x, z) < 175) return 0;
  if (x >= 0) return z < 0 ? 1 : 4;
  return z < 0 ? 2 : 3;
}

// tipo de cada bloque para el mapa: 0 edificio, 1 parque, 2 plaza
export const blockType = {};
const bKey = (i, j) => i + ',' + j;
export const plazaFX = [];

{
  const mats = {}, buckets = {};
  const matFor = hex => mats[hex] || (buckets[hex] = [], mats[hex] = new THREE.MeshStandardMaterial({ color: 0x08070f, roughness: 0.4, metalness: 0.7, emissive: hex, emissiveMap: winTex, emissiveIntensity: 1.5 }));
  const walks = [], parks = [];
  const ePos = [], eCol = [];
  const pushEdges = (geo, color, mul) => {
    const eg = new THREE.EdgesGeometry(geo), p = eg.attributes.position.array, c = new THREE.Color(color).multiplyScalar(mul);
    for (let i = 0; i < p.length; i += 3) { ePos.push(p[i], p[i + 1], p[i + 2]); eCol.push(c.r, c.g, c.b); }
    eg.dispose();
  };
  const signs = [];
  const addBuilding = (x, z, w, d, h, hex, words) => {
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    const ox = Math.floor(rand() * 16) / 16, oy = Math.floor(rand() * 16) / 16;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.004, 0.004); continue; }
      const span = f < 2 ? d : w;
      uv.setXY(i, uv.getX(i) * span / 32 + ox, uv.getY(i) * h / 32 + oy);
    }
    geo.translate(x, h / 2 + 0.4, z);
    matFor(hex); buckets[hex].push(geo);
    pushEdges(geo, hex, 1.7);
    if (rand() < 0.22) {
      const word = words[Math.floor(rand() * words.length)];
      signs.push({ word, hex: DISTRICTS[0].pal[Math.floor(rand() * 4)], x, z, y: h + 0.4 + Math.min(w, d) * 0.25, s: Math.min(w, d), r: Math.floor(rand() * 4) * Math.PI / 2 });
    }
  };
  const treeGeo = [], treeGlow = [];
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const cx = i * CELL, cz = j * CELL, di = districtAt(cx, cz), D = DISTRICTS[di];
    const wg = new THREE.BoxGeometry(BLOCK, 0.4, BLOCK); wg.translate(cx, 0.2, cz); walks.push(wg);
    pushEdges(wg, 0x00f0ff, 0.9);
    const dist = Math.hypot(i, j);
    const tall = di === 0 ? Math.max(0.45, 1 - dist / 6) : Math.max(0.2, 0.55 - dist / (N * 3));
    const r = rand(), col = () => D.pal[Math.floor(rand() * D.pal.length)];
    if ((i === 0 && j === 0) || (r < 0.035 && di !== 4)) {
      blockType[bKey(i, j)] = 2;
      const c = col();
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 26, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.5) }));
      pillar.position.set(cx, 13.4, cz); scene.add(pillar);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.35, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3) }));
      ring.position.set(cx, 18, cz); scene.add(ring);
      const ring2 = ring.clone(); ring2.scale.setScalar(0.6); ring2.position.y = 9; scene.add(ring2);
      plazaFX.push(ring, ring2);
    } else if (r < 0.11 && (di === 2 || di === 3)) {
      // parque con árboles de neón
      blockType[bKey(i, j)] = 1;
      const pg = new THREE.BoxGeometry(BLOCK - 2, 0.1, BLOCK - 2); pg.translate(cx, 0.46, cz); parks.push(pg);
      for (let t = 0; t < 9; t++) {
        const tx = cx + (rand() - 0.5) * (BLOCK - 8), tz = cz + (rand() - 0.5) * (BLOCK - 8), th = 4 + rand() * 4;
        const cone = new THREE.ConeGeometry(1.6 + rand(), th, 6); cone.translate(tx, 2.4 + th / 2, tz); treeGeo.push(cone);
        const trunk = new THREE.CylinderGeometry(0.2, 0.3, 2.4, 5); trunk.translate(tx, 1.6, tz); treeGeo.push(trunk);
        pushEdges(cone, di === 2 ? 0xff2bd6 : 0x39ff88, 1.6);
      }
    } else if (di === 4 && r < 0.55) {
      // naves industriales anchas y bajas
      blockType[bKey(i, j)] = 0;
      const w = BLOCK - 3 - rand() * 4, d = BLOCK - 3 - rand() * 4, h = 8 + rand() * 10;
      addBuilding(cx, cz, w, d, h, col(), D.words);
      if (rand() < 0.4) { // chimenea
        const ch = new THREE.CylinderGeometry(1, 1.4, 22, 8); ch.translate(cx + w / 3, 11, cz - d / 3);
        matFor(0xff7a1a); buckets[0xff7a1a].push(ch); pushEdges(ch, 0xff7a1a, 1.4);
      }
    } else if (r < 0.5) {
      blockType[bKey(i, j)] = 0;
      const w = BLOCK - 3 - rand() * 7, d = BLOCK - 3 - rand() * 7;
      const h = 12 + rand() * 75 * tall + (rand() < 0.12 * tall ? 55 : 0);
      const c = col(); addBuilding(cx, cz, w, d, h, c, D.words);
      if (rand() < 0.5) addBuilding(cx, cz, w * 0.6, d * 0.6, h + 8 + rand() * 18, c, D.words);
      if (di === 1 && rand() < 0.5) { // tejado de pagoda
        const roof = new THREE.ConeGeometry(w * 0.55, 6, 4); roof.rotateY(Math.PI / 4); roof.translate(cx, h + 3.4, cz);
        matFor(0xff2a4d); buckets[0xff2a4d].push(roof); pushEdges(roof, 0xffc400, 2);
      }
    } else {
      blockType[bKey(i, j)] = 0;
      for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (rand() < 0.12) continue;
        const s = BLOCK / 2 - 2 - rand() * 3;
        addBuilding(cx + qx * BLOCK / 4, cz + qz * BLOCK / 4, s, BLOCK / 2 - 2 - rand() * 3, 7 + rand() * 45 * tall, col(), D.words);
      }
    }
  }
  for (const hex in buckets) if (buckets[hex].length) scene.add(new THREE.Mesh(mergeGeometries(buckets[hex]), mats[hex]));
  scene.add(new THREE.Mesh(mergeGeometries(walks), new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.8, metalness: 0.2 })));
  if (parks.length) scene.add(new THREE.Mesh(mergeGeometries(parks), new THREE.MeshStandardMaterial({ color: 0x06200f, roughness: 0.9, emissive: 0x0a3a18, emissiveIntensity: 0.6 })));
  if (treeGeo.length) scene.add(new THREE.Mesh(mergeGeometries(treeGeo), new THREE.MeshStandardMaterial({ color: 0x04140a, roughness: 0.6, emissive: 0x0b6b2e, emissiveIntensity: 0.5 })));
  // carteles (agrupados por textura)
  for (const s of signs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.s * 0.9, s.s * 0.35), new THREE.MeshBasicMaterial({ map: signTex(s.word, s.hex), transparent: true, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) }));
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.r; scene.add(m);
  }
  // muros del límite
  for (const [x, z, w, d] of [[0, EDGE + 1.5, EDGE * 2 + 6, 1.5], [0, -EDGE - 1.5, EDGE * 2 + 6, 1.5], [EDGE + 1.5, 0, 1.5, EDGE * 2 + 6], [-EDGE - 1.5, 0, 1.5, EDGE * 2 + 6]]) {
    const g = new THREE.BoxGeometry(w, 3, d); g.translate(x, 1.5, z); pushEdges(g, 0xff2bd6, 3);
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.15, depthWrite: false })));
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3));
  eg.setAttribute('color', new THREE.Float32BufferAttribute(eCol, 3));
  scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors: true })));
}

// ================== SUELO ==================
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0x07050f, roughness: 0.38, metalness: 0.6 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(CELL * 50, 100, 0x9d4dff, 0x9d4dff);
  grid.position.y = 0.04; grid.material.transparent = true; grid.material.opacity = 0.35; grid.material.color = new THREE.Color(1.4, 0.4, 2.2);
  scene.add(grid);
  // rayas neón del asfalto
  const dash = new THREE.PlaneGeometry(0.22, 2.6); dash.rotateX(-Math.PI / 2);
  const list = [];
  for (let i = -N - 1; i <= N; i++) for (let j = -N; j <= N; j++) for (let k = -3; k <= 3; k++) {
    const r = (i + 0.5) * CELL, t = j * CELL + k * 4.6;
    list.push([r, t, 0], [t, r, 1]);
  }
  const im = new THREE.InstancedMesh(dash, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.1, 0.15) }), list.length);
  const m4 = new THREE.Matrix4(), rot = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  list.forEach(([x, z, h], n) => { m4.makeTranslation(x, 0.06, z); if (h) m4.multiply(rot); im.setMatrixAt(n, m4); });
  scene.add(im);
  // pasos de cebra en los cruces
  const zebra = new THREE.PlaneGeometry(0.9, 5); zebra.rotateX(-Math.PI / 2);
  const zl = [];
  for (let i = -N - 1; i <= N; i++) for (let j = -N - 1; j <= N; j++) {
    const x = roadC(i), z = roadC(j);
    for (let s = -2; s <= 2; s++) { zl.push([x + s * 1.6, z - 10.5, 0], [x + s * 1.6, z + 10.5, 0], [x - 10.5, z + s * 1.6, 1], [x + 10.5, z + s * 1.6, 1]); }
  }
  const zm = new THREE.InstancedMesh(zebra, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.085, 0.16) }), zl.length);
  zl.forEach(([x, z, h], n) => { m4.makeTranslation(x, 0.055, z); if (h) m4.multiply(rot); zm.setMatrixAt(n, m4); });
  scene.add(zm);
}

// ================== FAROLAS ==================
{
  const spots = [];
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    if (blockType[bKey(i, j)] === undefined) continue;
    const cx = i * CELL, cz = j * CELL, o = BLOCK / 2 - 1.2;
    for (const [sx, sz] of [[-1, -1], [1, 1]]) spots.push([cx + sx * o, cz + sz * o, sx, sz, districtAt(cx, cz)]);
  }
  const pole = new THREE.CylinderGeometry(0.1, 0.16, 7.5, 6); pole.translate(0, 3.75, 0);
  const head = new THREE.BoxGeometry(0.5, 0.2, 2.2); head.translate(0, 7.4, 0.9);
  const pool = new THREE.PlaneGeometry(11, 11); pool.rotateX(-Math.PI / 2);
  const pM = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x14121e, metalness: 0.8, roughness: 0.4 }), spots.length);
  const hM = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), spots.length);
  const gM = new THREE.InstancedMesh(pool, new THREE.MeshBasicMaterial({ map: radialTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new V3(1, 1, 1), c = new THREE.Color();
  spots.forEach(([x, z, sx, sz, di], n) => {
    const yaw = Math.atan2(sx > 0 ? 1 : -1, 0) + (sz > 0 ? 0 : Math.PI) * 0; // brazo hacia la calle
    q.setFromAxisAngle(new V3(0, 1, 0), Math.atan2(sx, sz));
    m4.compose(new V3(x, 0.4, z), q, s1); pM.setMatrixAt(n, m4); hM.setMatrixAt(n, m4);
    const lc = DISTRICTS[di].lamp;
    hM.setColorAt(n, c.set(lc).multiplyScalar(3));
    m4.makeTranslation(x + sx * 2.2, 0.08, z + sz * 2.2); gM.setMatrixAt(n, m4);
    gM.setColorAt(n, c.set(lc).multiplyScalar(0.28));
    void yaw;
  });
  scene.add(pM, hM, gM);
}

// ================== COLISIONES ==================
export function inBlock(x, z, m) {
  const bi = Math.round(x / CELL), bj = Math.round(z / CELL);
  if (Math.abs(bi) > N || Math.abs(bj) > N) return false;
  return Math.abs(x - bi * CELL) < BLOCK / 2 + m && Math.abs(z - bj * CELL) < BLOCK / 2 + m;
}
export function los(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dz) / 3);
  for (let i = 1; i < n; i++) { const t = i / n; if (inBlock(a.x + dx * t, a.z + dz * t, 1.5)) return false; }
  return true;
}
export const _n = new V3();
export function collideWorld(p, v, r) {
  let hit = 0;
  const bi = Math.round(p.x / CELL), bj = Math.round(p.z / CELL);
  if (Math.abs(bi) <= N && Math.abs(bj) <= N) {
    const lx = p.x - bi * CELL, lz = p.z - bj * CELL, h = BLOCK / 2 + r;
    if (Math.abs(lx) < h && Math.abs(lz) < h) {
      const px = h - Math.abs(lx), pz = h - Math.abs(lz);
      if (px < pz) { const s = Math.sign(lx) || 1; p.x += s * px; if (v.x * s < 0) { hit = Math.abs(v.x); v.x *= -0.25; v.z *= 0.85; } _n.set(s, 0, 0); }
      else { const s = Math.sign(lz) || 1; p.z += s * pz; if (v.z * s < 0) { hit = Math.abs(v.z); v.z *= -0.25; v.x *= 0.85; } _n.set(0, 0, s); }
    }
  }
  const L = EDGE - r;
  if (p.x > L) { p.x = L; if (v.x > 0) { hit = Math.max(hit, v.x); v.x *= -0.3; } _n.set(-1, 0, 0); }
  if (p.x < -L) { p.x = -L; if (v.x < 0) { hit = Math.max(hit, -v.x); v.x *= -0.3; } _n.set(1, 0, 0); }
  if (p.z > L) { p.z = L; if (v.z > 0) { hit = Math.max(hit, v.z); v.z *= -0.3; } _n.set(0, 0, -1); }
  if (p.z < -L) { p.z = -L; if (v.z < 0) { hit = Math.max(hit, -v.z); v.z *= -0.3; } _n.set(0, 0, 1); }
  return hit;
}

// ================== PUNTOS DE LA CIUDAD ==================
// tramo de calle: 'v' = calle vertical k (x fija) en el bloque j; 'h' = calle horizontal k (z fija)
export function seg(axis, k, j) {
  return axis === 'v' ? { x: roadC(k), z: j * CELL, h: 0 } : { x: j * CELL, z: roadC(k), h: Math.PI / 2 };
}
export function randomRoadPoint(minD, maxD, from, center = false) {
  for (let tries = 0; tries < 60; tries++) {
    const k = Math.floor(Math.random() * (2 * N + 2)) - N - 1, along = (Math.random() * 2 - 1) * (N + 0.4) * CELL, side = center ? 0 : (Math.random() - 0.5) * 8;
    const p = Math.random() < 0.5 ? new V3(roadC(k) + side, 0, along) : new V3(along, 0, roadC(k) + side);
    const d = from ? Math.hypot(p.x - from.x, p.z - from.z) : 0;
    if (d >= minD && d <= maxD && !inBlock(p.x, p.z, 2)) return p;
  }
  return new V3(roadC(0), 0, 0);
}

export const ZONES = {
  garages: [['v', 0, 0, 'GARAJE CENTRAL'], ['v', -8, -7, 'GARAJE ROSA'], ['h', 7, -8, 'GARAJE DEL PUERTO'], ['v', 8, 7, 'TALLER POLÍGONO'], ['h', -7, 8, 'GARAJE DRAGÓN']]
    .map(([a, k, j, name]) => ({ ...seg(a, k, j), name })),
  banks: [['h', -1, -3], ['v', 5, 2], ['v', -5, 5], ['h', 4, -6], ['h', -6, -6], ['v', 9, -4]]
    .map(([a, k, j], i) => ({ ...seg(a, k, j), name: 'BANCO ' + (i + 1) })),
  races: [
    { a: 'v', k: 1, j: -2, name: 'CIRCUITO CENTRO', len: 8, prize: 3000, lvl: 0 },
    { a: 'h', k: -6, j: 5, name: 'SPRINT DRAGÓN', len: 10, prize: 6000, lvl: 1 },
    { a: 'v', k: -7, j: 6, name: 'PUERTO NOCTURNO', len: 12, prize: 10000, lvl: 2 },
    { a: 'h', k: 6, j: 8, name: 'POLÍGONO DERRAPE', len: 12, prize: 16000, lvl: 3 },
    { a: 'v', k: 10, j: 0, name: 'GRAN VUELTA NEÓN', len: 18, prize: 35000, lvl: 4 },
    { a: 'h', k: -10, j: -9, name: 'LEYENDA DEL ASFALTO', len: 24, prize: 80000, lvl: 5 },
  ].map(r => ({ ...r, ...seg(r.a, r.k, r.j) })),
};
