// Mağaralar: orijinal oyundaki gibi tohumlu rastgele dolgu + üstüne çizim komutları.
// Tasarımlar bu projeye özgüdür (orijinal seviyeler kopyalanmamıştır).

import { T, mulberry32, type CaveSettings, type Tile } from './engine.ts'

type Draw =
  | { k: 'point'; t: Tile; x: number; y: number }
  | { k: 'line'; t: Tile; x: number; y: number; len: number; dx: number; dy: number }
  | { k: 'rect'; t: Tile; x: number; y: number; w: number; h: number; fill?: Tile }

export interface Cave extends CaveSettings {
  name: string
  hint: string
  fill: [Tile, number][] // [taş, olasılık] — sırayla denenir
  draw: Draw[]
  start: [number, number]
  exit: [number, number]
}

export const W = 40
export const H = 22

const hline = (t: Tile, x: number, y: number, len: number): Draw => ({ k: 'line', t, x, y, len, dx: 1, dy: 0 })
const vline = (t: Tile, x: number, y: number, len: number): Draw => ({ k: 'line', t, x, y, len, dx: 0, dy: 1 })
const box = (t: Tile, x: number, y: number, w: number, h: number, fill: Tile = T.SPACE): Draw => ({ k: 'rect', t, x, y, w, h, fill })
const pt = (t: Tile, x: number, y: number): Draw => ({ k: 'point', t, x, y })

/**
 * Tuğla kafesteki kelebek. Tavanda bir delik, deliğin üstünde toprak ve taş var:
 * toprağı yandan "yerinde kazı" ile alırsan taş kafese düşer.
 */
const cagedButterfly = (x: number, y: number): Draw[] => [
  box(T.WALL, x, y, 7, 5),
  pt(T.BUTTERFLY, x + 1, y + 1),
  pt(T.SPACE, x + 3, y),
  pt(T.DIRT, x + 3, y - 1),
  pt(T.BOULDER, x + 3, y - 2),
]

/** İçi boş, köşesinde bir düşman olan küçük oda. */
const cage = (enemy: Tile, x: number, y: number, w = 4, h = 3): Draw[] => [
  hline(T.DIRT, x, y - 1, w), // toprak çatı: rastgele taşlar odaya düşüp düşmanı ezmesin
  { k: 'rect', t: T.SPACE, x, y, w, h, fill: T.SPACE },
  pt(enemy, x, y),
]

export const CAVES: Cave[] = [
  {
    name: 'İlk Kazı',
    hint: 'Toprağı kaz, elmasları topla. Taşların altından çabuk çekil!',
    seed: 101,
    needed: 12,
    time: 150,
    value: 10,
    extra: 15,
    fill: [
      [T.BOULDER, 0.12],
      [T.DIAMOND, 0.05],
      [T.SPACE, 0.04],
    ],
    draw: [hline(T.WALL, 6, 7, 14), hline(T.WALL, 20, 14, 14), vline(T.WALL, 30, 2, 6)],
    start: [3, 3],
    exit: [38, 19],
  },
  {
    name: 'Ateşböceği Tünelleri',
    hint: 'Turuncu ateşböcekleri sana dokunursa patlar. Üstlerine taş düşür!',
    seed: 202,
    needed: 16,
    time: 150,
    value: 15,
    extra: 20,
    fill: [
      [T.BOULDER, 0.1],
      [T.DIAMOND, 0.06],
    ],
    draw: [
      hline(T.WALL, 1, 6, 30),
      hline(T.WALL, 9, 12, 30),
      hline(T.WALL, 1, 17, 30),
      ...cage(T.FIREFLY, 4, 8, 8, 3),
      ...cage(T.FIREFLY, 26, 8, 8, 3),
      ...cage(T.FIREFLY, 14, 14, 10, 2),
      ...cage(T.FIREFLY, 30, 18, 6, 3),
    ],
    start: [2, 2],
    exit: [37, 20],
  },
  {
    name: 'Kelebek Bahçesi',
    hint: 'Kelebek patlayınca 9 elmas bırakır. Kafesin üstündeki toprağı Shift+yön ile yandan kaz, taş kelebeğe düşsün.',
    seed: 303,
    needed: 22,
    time: 180,
    value: 10,
    extra: 20,
    fill: [
      [T.BOULDER, 0.14],
      [T.DIAMOND, 0.015],
    ],
    draw: [
      ...cagedButterfly(5, 4),
      ...cagedButterfly(17, 4),
      ...cagedButterfly(29, 4),
      ...cagedButterfly(11, 13),
      ...cagedButterfly(23, 13),
    ],
    start: [2, 19],
    exit: [38, 1],
  },
  {
    name: 'Yeşil Tehdit',
    hint: 'Amip büyüyor. Kafesin tavanındaki deliği taşla tıka: hapsolan amip elmasa dönüşür. 200 hücreyi aşarsa taşa döner.',
    seed: 404,
    needed: 25,
    time: 200,
    value: 10,
    extra: 20,
    amoebaTime: 40,
    fill: [
      [T.BOULDER, 0.1],
      [T.DIAMOND, 0.04],
      [T.SPACE, 0.03],
    ],
    draw: [
      box(T.WALL, 14, 6, 13, 10, T.DIRT),
      pt(T.DIRT, 20, 6), // tavanda delik: amip buradan kaçabilir
      pt(T.DIRT, 20, 5),
      pt(T.BOULDER, 20, 4), // altındaki toprağı kazarsan deliği tıkar
      pt(T.AMOEBA, 20, 10),
      ...cage(T.FIREFLY, 3, 15, 6, 2),
      ...cage(T.FIREFLY, 31, 4, 6, 2),
    ],
    start: [2, 2],
    exit: [37, 19],
  },
  {
    name: 'Sihirli Duvar',
    hint: 'Sihirli duvardan düşen taş elmasa dönüşür. Ama süresi kısa!',
    seed: 505,
    needed: 18,
    time: 160,
    value: 20,
    extra: 30,
    magicTime: 25,
    fill: [
      [T.BOULDER, 0.22],
      [T.DIAMOND, 0.01],
    ],
    draw: [
      hline(T.WALL, 1, 11, 38),
      hline(T.MAGIC, 8, 11, 24),
      pt(T.DIRT, 2, 11), // aşağı inmek için geçit
      vline(T.DIRT, 2, 8, 3), // geçidin üstü toprak: rastgele bir taş girişi tıkamasın
      { k: 'rect', t: T.DIRT, x: 34, y: 17, w: 5, h: 4 }, // çıkışın çevresi taşla kapanmasın
      { k: 'rect', t: T.SPACE, x: 1, y: 12, w: 38, h: 4, fill: T.SPACE },
      hline(T.WALL, 1, 16, 38),
      hline(T.SPACE, 4, 16, 1),
      hline(T.SPACE, 35, 16, 1),
      ...cage(T.BUTTERFLY, 16, 18, 8, 2),
    ],
    start: [2, 2],
    exit: [38, 20],
  },
  {
    name: 'Çığ',
    hint: 'Her yer taş. Bir kayarsa hepsi kayar.',
    seed: 606,
    needed: 30,
    time: 200,
    value: 15,
    extra: 25,
    fill: [
      [T.BOULDER, 0.3],
      [T.DIAMOND, 0.08],
      [T.SPACE, 0.02],
    ],
    draw: [
      vline(T.WALL, 10, 1, 14),
      vline(T.WALL, 20, 7, 14),
      vline(T.WALL, 30, 1, 14),
      ...cage(T.FIREFLY, 13, 18, 5, 2),
      ...cage(T.BUTTERFLY, 33, 17, 5, 3),
    ],
    start: [1, 20],
    exit: [38, 1],
  },
]

/** Kullanıcının girebileceği en büyük harita tohumu. */
export const SEED_MAX = 999_999_999

/** Mağaralar arası tohum farkı: varsayılan tohumlar 101, 202, 303… */
export const SEED_STEP = 101

/**
 * Mağaranın harita tohumu. Kullanıcı tohumu yoksa mağaranın kendi (varsayılan)
 * tohumu. Varsa: 1. mağara girilen sayıyı, sonraki her mağara 101 fazlasını
 * kullanır. Böylece 101 girilince varsayılan haritalar gelir.
 */
export function caveSeed(level: number, userSeed: number | null): number {
  if (userSeed === null) return CAVES[level].seed ?? 1
  return userSeed + level * SEED_STEP
}

/**
 * Toplanabilecek elmas tahmini: mevcut elmaslar + kelebek başına 9 (ezilince)
 * + amip varsa 40 (kapatılınca) + sihirli duvar varsa 30 (taş dönüşümü).
 */
export function diamondPotential(tiles: Tile[]): number {
  let d = 0
  let b = 0
  let amoeba = false
  let magic = false
  for (const t of tiles) {
    if (t === T.DIAMOND) d++
    else if (t === T.BUTTERFLY) b++
    else if (t === T.AMOEBA) amoeba = true
    else if (t === T.MAGIC) magic = true
  }
  return d + 9 * b + (amoeba ? 40 : 0) + (magic ? 30 : 0)
}

export function buildCave(cave: Cave, seed = cave.seed ?? 1): Tile[] {
  const rng = mulberry32(seed)
  const tiles: Tile[] = new Array(W * H).fill(T.DIRT)
  const put = (x: number, y: number, t: Tile) => {
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1) tiles[y * W + x] = t
  }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const r = rng()
      let acc = 0
      for (const [t, p] of cave.fill) {
        acc += p
        if (r < acc) {
          put(x, y, t)
          break
        }
      }
    }
  for (const d of cave.draw) {
    if (d.k === 'point') put(d.x, d.y, d.t)
    else if (d.k === 'line') for (let i = 0; i < d.len; i++) put(d.x + d.dx * i, d.y + d.dy * i, d.t)
    else
      for (let y = d.y; y < d.y + d.h; y++)
        for (let x = d.x; x < d.x + d.w; x++) {
          const edge = x === d.x || y === d.y || x === d.x + d.w - 1 || y === d.y + d.h - 1
          put(x, y, edge ? d.t : (d.fill ?? d.t))
        }
  }
  // Giriş: etrafı toprak, üstünde taş olmasın
  const [sx, sy] = cave.start
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(sx + dx, sy + dy, T.DIRT)
  put(sx, sy, T.INBOX)
  for (let x = 0; x < W; x++) {
    tiles[x] = T.STEEL
    tiles[(H - 1) * W + x] = T.STEEL
  }
  for (let y = 0; y < H; y++) {
    tiles[y * W] = T.STEEL
    tiles[y * W + W - 1] = T.STEEL
  }
  const [ex, ey] = cave.exit
  tiles[ey * W + ex] = T.EXIT
  // Başka bir tohum yeterli elmas vermezse eksikleri rastgele toprak hücrelere
  // ekle (varsayılan mağaralarda gerek kalmaz, haritaları değişmez)
  const want = Math.ceil(cave.needed * 1.25)
  let have = diamondPotential(tiles)
  for (let tries = 0; have < want && tries < 20000; tries++) {
    const x = 1 + Math.floor(rng() * (W - 2))
    const y = 1 + Math.floor(rng() * (H - 2))
    if (tiles[y * W + x] !== T.DIRT || (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1)) continue
    tiles[y * W + x] = T.DIAMOND
    have++
  }
  return tiles
}
