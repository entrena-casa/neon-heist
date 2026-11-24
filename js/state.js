// Progresión guardada (cartera, coches, mejoras, colores, rango, banda) y estado de la partida
import { G, popText, toast, fmt } from './core.js';

const KEY = 'neonrider.save.v2';
export const save = {
  wallet: 2000, total: 0, owned: ['neon', 'chispa'], current: 'neon',
  up: {}, skins: ['cian'], skin: 'cian', races: {}, name: '', banda: null, best: 0, heists: 0,
};
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s) Object.assign(save, s);
  else { // importa el récord de la versión 1
    const old = +localStorage.getItem('neonheist.best') || 0;
    if (old) { save.wallet += Math.round(old / 4); save.best = old; }
  }
} catch (e) {}
if (!save.name) save.name = 'RIDER' + Math.floor(100 + Math.random() * 900);
let dirty = false, saveT = 0;
export function persist(now = false) {
  dirty = true;
  if (now) flush();
}
export function flush() { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
export function tickSave(dt) { saveT += dt; if (saveT > 3) { saveT = 0; flush(); } }
addEventListener('beforeunload', flush);
addEventListener('pagehide', flush);

// ================== MEJORAS ==================
export const UPG = [
  { id: 'motor', name: 'MOTOR', icon: '⚙️', desc: l => `+${l * 6}% velocidad y aceleración`, base: 1500, max: 10 },
  { id: 'nitro', name: 'NITRO', icon: '⚡', desc: l => `gasta ${l * 8}% menos · recarga +${l * 25}%`, base: 1200, max: 8 },
  { id: 'mochila', name: 'MOCHILA', icon: '🎒', desc: l => `caben ${5 + l * 2} bolsas`, base: 1000, max: 10 },
  { id: 'iman', name: 'IMÁN', icon: '🧲', desc: l => `coges bolsas a ${(4.6 + l * 1.4).toFixed(1)} m`, base: 900, max: 6 },
  { id: 'blindaje', name: 'BLINDAJE', icon: '🛡️', desc: l => `te pillan un ${l * 9}% más lento`, base: 2000, max: 7 },
  { id: 'interes', name: 'INTERESES', icon: '🏦', desc: l => `+${l * 10}% al ingresar en el banco`, base: 2500, max: 10 },
  { id: 'suerte', name: 'SUERTE', icon: '🍀', desc: l => `${12 + l * 4}% de bolsas de oro`, base: 1800, max: 6 },
  { id: 'agarre', name: 'AGARRE', icon: '🛞', desc: l => `+${l * 8}% de giro y agarre`, base: 1400, max: 6 },
];
export const lvl = id => save.up[id] || 0;
export const upCost = u => Math.round(u.base * Math.pow(1.7, lvl(u.id)) / 50) * 50;
export const U = {
  get speed() { return 1 + 0.06 * lvl('motor'); },
  get nitroDrain() { return 28 * (1 - 0.08 * lvl('nitro')); },
  get nitroRegen() { return 2.5 * (1 + 0.25 * lvl('nitro')); },
  get cap() { return 5 + 2 * lvl('mochila'); },
  get magnet() { return 4.6 + 1.4 * lvl('iman'); },
  get armor() { return 1 - 0.09 * lvl('blindaje'); },
  get interest() { return 1 + 0.1 * lvl('interes'); },
  get gold() { return 0.12 + 0.04 * lvl('suerte'); },
  get grip() { return 1 + 0.08 * lvl('agarre'); },
};

// ================== COLORES ==================
export const SKINS = [
  { id: 'cian', name: 'CIAN', hex: 0x00f0ff, price: 0 },
  { id: 'rosa', name: 'ROSA', hex: 0xff2bd6, price: 3000 },
  { id: 'toxico', name: 'TÓXICO', hex: 0x39ff88, price: 6000 },
  { id: 'oro', name: 'ORO', hex: 0xffc400, price: 15000 },
  { id: 'lava', name: 'LAVA', hex: 0xff4a1a, price: 25000 },
  { id: 'violeta', name: 'VIOLETA', hex: 0x9d4dff, price: 40000 },
  { id: 'hielo', name: 'HIELO', hex: 0xbff6ff, price: 80000 },
  { id: 'sangre', name: 'CARMESÍ', hex: 0xff0030, price: 120000 },
];
export const skinHex = () => (SKINS.find(s => s.id === save.skin) || SKINS[0]).hex;

// ================== RANGOS ==================
export const RANKS = [[0, 'NOVATO'], [10000, 'RATERO'], [40000, 'PILOTO CALLEJERO'], [120000, 'ATRACADOR'], [300000, 'REY DEL ASFALTO'], [800000, 'CAPO NEÓN'], [2000000, 'LEYENDA NEÓN']];
export const rankIdx = t => { let r = 0; RANKS.forEach((x, i) => { if (t >= x[0]) r = i; }); return r; };

// ================== PARTIDA ==================
export const state = {
  carried: 0, held: 0, heat: 0, wanted: 0, busted: 0, nitro: 100, combo: 1, comboT: -99,
  time: 0, drift: 0, escapeT: 0, bustedT: 0, session: { earned: 0, bags: 0, wrecked: 0, races: 0 },
  race: null, depositT: 0, vaultT: 0, mode: 'menu', // menu | play | busted
};
G.state = state; G.save = save;

export function earn(v) { // dinero directo a la cartera (carreras, ingresos)
  const before = rankIdx(save.total);
  save.wallet += v; save.total += v; state.session.earned += v;
  const after = rankIdx(save.total);
  if (after > before) toast(`🏆 NUEVO RANGO<br><b>${RANKS[after][1]}</b>`, 3500);
  persist();
}
export function spend(v) { if (save.wallet < v) return false; save.wallet -= v; persist(true); return true; }
export function addCarried(v, pos, color, prefix = '+$') {
  state.carried += v; if (pos) popText(prefix + v.toLocaleString('es-ES'), pos, color);
}
// delito: sube la búsqueda
export function crime(amount) {
  state.heat = Math.max(state.heat, 0) + amount;
  state.escapeT = 0;
}
export const wantedFromHeat = h => h <= 0.01 ? 0 : Math.min(5, 1 + Math.floor(h / 4));
export { fmt };
