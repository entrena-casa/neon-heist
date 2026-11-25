// Núcleo: render, escena, utilidades, texturas, cielo, partículas, estelas, lluvia y textos flotantes
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
export { THREE };

export const $ = id => document.getElementById(id);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rand = mulberry32(20261124);
export const V3 = THREE.Vector3;
export const fmt = n => '$' + Math.round(n).toLocaleString('es-ES');
export const isTouch = matchMedia('(pointer:coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover:none)').matches);

// estado compartido entre módulos
export const G = { t: 0, shake: 0, player: null, rider: true, paused: false, playing: false };

// ================== RENDER ==================
export const canvas = $('game');
let _r;
try { _r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
catch (e) { throw new Error('tu navegador no deja usar gráficos 3D (WebGL). Activa la aceleración por hardware o prueba con Chrome/Safari actualizados.'); }
export const renderer = _r;
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05010f);
scene.fog = new THREE.FogExp2(0x16062e, 0.0036);
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2600);
camera.position.set(0, 80, 140);

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.5, 0.3);
composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ================== LUCES ==================
scene.add(new THREE.HemisphereLight(0x6a48ff, 0x12002a, 0.75));
const moon = new THREE.DirectionalLight(0x8aa0ff, 0.45); moon.position.set(-100, 200, 80); scene.add(moon);
export const headLight = new THREE.SpotLight(0xd8f4ff, 170, 85, 0.5, 0.7, 1.3); scene.add(headLight, headLight.target);
export const glowLight = new THREE.PointLight(0x00f0ff, 22, 10, 1.6); scene.add(glowLight);
export const copLightR = new THREE.PointLight(0xff1030, 0, 45, 1.4);
export const copLightB = new THREE.PointLight(0x1040ff, 0, 45, 1.4);
scene.add(copLightR, copLightB);
export const flashLight = new THREE.PointLight(0xff8a20, 0, 70, 1.3); scene.add(flashLight);

// ================== TEXTURAS ==================
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const winTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (rand() < 0.42) { g.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.65})`; g.fillRect(x * 16 + 3, y * 16 + 4, 10, 8); }
  }
  for (let y = 0; y < 256; y += 64) { if (rand() < 0.5) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, y + 1, 256, 2); } }
});
winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.anisotropy = 4;
export const radialTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
export const dotTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const signCache = {};
export const hexCss = hex => '#' + hex.toString(16).padStart(6, '0');
export function signTex(word, hex, frame = true) {
  const k = word + hex + frame; if (signCache[k]) return signCache[k];
  const col = hexCss(hex);
  return signCache[k] = canvasTex(512, 200, (g, w, h) => {
    let fs = 120; g.font = `900 ${fs}px Orbitron, Arial Black, sans-serif`;
    while (g.measureText(word).width > w - 70 && fs > 30) { fs -= 6; g.font = `900 ${fs}px Orbitron, Arial Black, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 30; g.strokeStyle = col; g.lineWidth = 8;
    if (frame) g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#fff'; for (let i = 0; i < 3; i++) g.fillText(word, w / 2, h / 2 + 6);
  });
}
// etiqueta de texto para nombres (sprites)
export function labelTex(text, hex) {
  const col = hexCss(hex);
  return canvasTex(512, 96, (g, w, h) => {
    g.font = '700 54px Orbitron, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 16; g.fillStyle = '#fff';
    g.fillText(text, w / 2, h / 2 + 3); g.fillText(text, w / 2, h / 2 + 3);
  });
}

// ================== CIELO ==================
export const skyGroup = new THREE.Group(); scene.add(skyGroup);
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { fogC: { value: scene.fog.color } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 fogC; varying vec3 vP;
      void main(){ float h = vP.y;
        vec3 glow = vec3(0.55,0.04,0.28), mid = vec3(0.06,0.005,0.12), top = vec3(0.004,0.0,0.015);
        vec3 c = mix(fogC, glow, smoothstep(-0.01,0.05,h));
        c = mix(c, mid, smoothstep(0.05,0.22,h));
        c = mix(c, top, smoothstep(0.22,0.7,h));
        gl_FragColor = vec4(c,1.0); }`
  }));
  sky.renderOrder = -10; skyGroup.add(sky);
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(380, 380), new THREE.MeshBasicMaterial({
    map: canvasTex(512, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#fff36b'); gr.addColorStop(0.5, '#ff7a3d'); gr.addColorStop(1, '#ff1f8f');
      g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i++) { const y = 270 + i * 26; g.fillRect(0, y, 512, 4 + i * 1.6); }
    }), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.6, 1.6, 1.6)
  }));
  sun.position.set(0, 60, -1000); sun.renderOrder = -9; skyGroup.add(sun);
  const n = 1400, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.3 + 0.12;
    p[i * 3] = Math.cos(th) * Math.cos(ph) * 1000; p[i * 3 + 1] = Math.sin(ph) * 1000; p[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * 1000;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, color: 0xcfc0ff, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
  stars.renderOrder = -8; skyGroup.add(stars);
}

// ================== PARTÍCULAS ==================
const MAXP = 2600;
const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
const pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP), pMax = new Float32Array(MAXP), pGrav = new Float32Array(MAXP), pBase = new Float32Array(MAXP * 3);
let pIdx = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.8, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
pts.frustumCulled = false; scene.add(pts);
export function emit(x, y, z, vx, vy, vz, r, g, b, life, grav = 18) {
  const i = pIdx; pIdx = (pIdx + 1) % MAXP;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pBase[i * 3] = r; pBase[i * 3 + 1] = g; pBase[i * 3 + 2] = b;
  pLife[i] = life; pMax[i] = life; pGrav[i] = grav;
}
export function burst(p, n, r, g, b, speed, life, grav = 18, up = 6) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    emit(p.x, p.y, p.z, Math.cos(a) * s, up * Math.random() + 2, Math.sin(a) * s, r, g, b, life * (0.5 + Math.random() * 0.5), grav);
  }
}
export function updateParticles(dt) {
  for (let i = 0; i < MAXP; i++) {
    if (pLife[i] <= 0) { pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
    pLife[i] -= dt;
    const o = i * 3; pVel[o + 1] -= pGrav[i] * dt;
    const drag = Math.exp(-1.8 * dt); pVel[o] *= drag; pVel[o + 2] *= drag;
    pPos[o] += pVel[o] * dt; pPos[o + 1] += pVel[o + 1] * dt; pPos[o + 2] += pVel[o + 2] * dt;
    if (pPos[o + 1] < 0.1) { pPos[o + 1] = 0.1; pVel[o + 1] *= -0.4; }
    const k = Math.max(0, pLife[i] / pMax[i]);
    pCol[o] = pBase[o] * k; pCol[o + 1] = pBase[o + 1] * k; pCol[o + 2] = pBase[o + 2] * k;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// ================== ESTELAS DE LUZ ==================
export function makeTrail(color, H = 0.75, y0 = 0.45, n = 64) {
  const pts = Array.from({ length: n }, () => new V3());
  const pos = new Float32Array(n * 6), col = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; scene.add(m);
  const base = new THREE.Color(color);
  return {
    mesh: m, base,
    reset(p) { pts.forEach(q => q.copy(p)); },
    update(p, k, c2) {
      const last = pts.pop(); last.copy(p); pts.unshift(last);
      const c = c2 || base;
      for (let i = 0; i < n; i++) {
        const a = (1 - i / n) * k, q = pts[i], o = i * 6;
        pos[o] = q.x; pos[o + 1] = y0; pos[o + 2] = q.z; pos[o + 3] = q.x; pos[o + 4] = y0 + H * (1 - i / n); pos[o + 5] = q.z;
        col[o] = c.r * a; col[o + 1] = c.g * a; col[o + 2] = c.b * a; col[o + 3] = c.r * a * 0.4; col[o + 4] = c.g * a * 0.4; col[o + 5] = c.b * a * 0.4;
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
    dispose() { scene.remove(m); g.dispose(); m.material.dispose(); }
  };
}

// ================== LLUVIA ==================
const RAIN = 1400;
const rainPos = new Float32Array(RAIN * 6);
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x7a8cff, transparent: true, opacity: 0.3, depthWrite: false }));
rain.frustumCulled = false; scene.add(rain);
for (let i = 0; i < RAIN; i++) { rainPos[i * 6] = (Math.random() - 0.5) * 140; rainPos[i * 6 + 1] = Math.random() * 50; rainPos[i * 6 + 2] = (Math.random() - 0.5) * 140; }
export function updateRain(dt, cx, cz) {
  for (let i = 0; i < RAIN; i++) {
    const o = i * 6; let x = rainPos[o], y = rainPos[o + 1] - 70 * dt, z = rainPos[o + 2];
    if (y < 0 || Math.abs(x - cx) > 75 || Math.abs(z - cz) > 75) { y = 30 + Math.random() * 25; x = cx + (Math.random() - 0.5) * 140; z = cz + (Math.random() - 0.5) * 140; }
    rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z; rainPos[o + 3] = x + 0.25; rainPos[o + 4] = y + 1.6; rainPos[o + 5] = z;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ================== TEXTOS ==================
let msgTimer = 0;
export function showMsg(text, color = '#fff', dur = 1.6) {
  const m = $('msg'); m.textContent = text; m.style.color = color; m.style.textShadow = `0 0 10px ${color},0 0 30px ${color}`;
  m.classList.toggle('show', !!text); msgTimer = dur;
}
export function updateMsg(dt) { if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').classList.remove('show'); } }
const _pv = new V3();
export function popText(text, wpos, color) {
  _pv.set(wpos.x, 3, wpos.z).project(camera);
  if (_pv.z > 1 || Math.abs(_pv.x) > 1.2 || Math.abs(_pv.y) > 1.2) return;
  const d = document.createElement('div'); d.className = 'pop'; d.textContent = text;
  d.style.left = ((_pv.x * 0.5 + 0.5) * innerWidth) + 'px'; d.style.top = ((-_pv.y * 0.5 + 0.5) * innerHeight) + 'px';
  d.style.color = color; d.style.textShadow = `0 0 8px ${color},0 0 20px ${color}`;
  $('texts').appendChild(d); setTimeout(() => d.remove(), 1250);
}
let toastT = null;
export function toast(html, ms = 2600) {
  const t = $('toast'); t.innerHTML = html; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
