// Klasik maden oyunu tarzı mağara motoru: render'dan bağımsız, deterministik (tohumlu RNG).
// Kurallar orijinal oyunun belgelenmiş davranışını izler: ızgara her tick'te
// yukarıdan aşağı, soldan sağa taranır; taşınan nesne "tarandı" olarak işaretlenir
// ki aynı tick'te ikinci kez işlenmesin.

export const T = {
  SPACE: 0,
  DIRT: 1,
  WALL: 2, // tuğla duvar (yuvarlak: üstündeki taş yuvarlanır)
  STEEL: 3, // çelik duvar (patlamaz)
  BOULDER: 4,
  DIAMOND: 5,
  PLAYER: 6,
  FIREFLY: 7,
  BUTTERFLY: 8,
  AMOEBA: 9,
  MAGIC: 10,
  EXIT: 11,
  INBOX: 12,
  EXPLODE: 13,
} as const
export type Tile = (typeof T)[keyof typeof T]
export const TILE_COUNT = 14

// Yönler: 0 yukarı, 1 sağ, 2 aşağı, 3 sol (y aşağı doğru artar)
export const DX = [0, 1, 0, -1]
export const DY = [-1, 0, 1, 0]

export interface Cell {
  t: Tile
  id: number // hareketli nesnelerin kimliği (render enterpolasyonu için)
  falling: boolean
  dir: number // oyuncu bakış yönü / düşman hareket yönü
  stage: number // patlama ve giriş kapısı sayacı
  toDiamond: boolean // patlama sonunda elmas mı bırakacak
  scanned: boolean
}

export interface Input {
  dir: number // -1: yok
  snap: boolean // yerinden kıpırdamadan kaz/al
}

export type GameEvent =
  | { k: 'dig'; x: number; y: number }
  | { k: 'collect'; x: number; y: number }
  | { k: 'land'; x: number; y: number; t: Tile }
  | { k: 'push'; x: number; y: number }
  | { k: 'explode'; x: number; y: number; toDiamond: boolean }
  | { k: 'magic'; x: number; y: number }
  | { k: 'exitOpen' }
  | { k: 'spawn'; x: number; y: number }
  | { k: 'win' }
  | { k: 'die' }
  | { k: 'timeout' }

export type Status = 'playing' | 'dead' | 'won' | 'timeout'

export interface CaveSettings {
  needed: number
  time: number // saniye
  value: number // kapı açılana kadar elmas puanı
  extra: number // kapı açıldıktan sonra elmas puanı
  magicTime?: number // saniye
  amoebaTime?: number // amip bu süreden sonra hızlanır (saniye)
  seed?: number
}

export const TICKS_PER_SECOND = 8
export const AMOEBA_MAX = 200
const INBOX_TICKS = 14
const EXPLODE_TICKS = 5

export interface Game {
  w: number
  h: number
  cells: Cell[]
  settings: CaveSettings
  rngState: number // rastgele sayı üretecinin durumu (kopyalanabilir olsun diye sayı)
  nextId: number
  tick: number
  timeTicks: number
  diamonds: number
  score: number
  exitOpen: boolean
  status: Status
  magic: 'dormant' | 'active' | 'expired'
  magicTicks: number
  amoeba: 'normal' | 'toDiamond' | 'toBoulder'
  amoebaCount: number
  player: { x: number; y: number; alive: boolean; spawned: boolean }
  events: GameEvent[]
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Oyunun rastgele sayısı: mulberry32 ile aynı dizi, durumu oyunun içinde tutulur. */
export function rand(g: Game): number {
  g.rngState = (g.rngState + 0x6d2b79f5) >>> 0
  let t = g.rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Oyunun bağımsız kopyası (çözücü ileriyi simüle ederken kullanır). */
export function cloneGame(g: Game): Game {
  return {
    ...g,
    cells: g.cells.map((c) => ({ ...c })),
    player: { ...g.player },
    events: [],
  }
}

const CHAR: Record<string, Tile> = {
  ' ': T.SPACE,
  '.': T.DIRT,
  w: T.WALL,
  W: T.STEEL,
  r: T.BOULDER,
  d: T.DIAMOND,
  P: T.INBOX,
  X: T.EXIT,
  q: T.FIREFLY,
  B: T.BUTTERFLY,
  a: T.AMOEBA,
  M: T.MAGIC,
}

/** ASCII satırlarından mağara (testler ve elle çizilmiş seviyeler için). */
export function tilesFromRows(rows: string[]): { w: number; h: number; tiles: Tile[] } {
  const h = rows.length
  const w = Math.max(...rows.map((r) => r.length))
  const tiles: Tile[] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? ' '
      const t = CHAR[ch]
      if (t === undefined) throw new Error(`Bilinmeyen karakter '${ch}' (${x},${y})`)
      tiles.push(t)
    }
  return { w, h, tiles }
}

export function createGame(w: number, h: number, tiles: Tile[], settings: CaveSettings): Game {
  const g: Game = {
    w,
    h,
    cells: [],
    settings,
    rngState: (settings.seed ?? 1) >>> 0,
    nextId: 1,
    tick: 0,
    timeTicks: settings.time * TICKS_PER_SECOND,
    diamonds: 0,
    score: 0,
    exitOpen: false, // ilk tick sonunda koşul sağlanıyorsa açılır
    status: 'playing',
    magic: 'dormant',
    magicTicks: (settings.magicTime ?? 20) * TICKS_PER_SECOND,
    amoeba: 'normal',
    amoebaCount: 0,
    player: { x: -1, y: -1, alive: false, spawned: false },
    events: [],
  }
  for (let i = 0; i < w * h; i++) {
    const t = tiles[i]
    const c = blank(t)
    if (t !== T.SPACE) c.id = g.nextId++
    if (t === T.FIREFLY || t === T.BUTTERFLY) c.dir = 3 // başlangıçta sola
    if (t === T.PLAYER) {
      g.player = { x: i % w, y: Math.floor(i / w), alive: true, spawned: true }
    }
    g.cells.push(c)
  }
  return g
}

function blank(t: Tile): Cell {
  return { t, id: 0, falling: false, dir: 1, stage: 0, toDiamond: false, scanned: false }
}

export function at(g: Game, x: number, y: number): Cell {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return OUTSIDE
  return g.cells[y * g.w + x]
}
const OUTSIDE: Cell = { ...blank(T.STEEL), scanned: true }

function set(g: Game, x: number, y: number, c: Cell) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return
  g.cells[y * g.w + x] = c
}

function move(g: Game, x: number, y: number, nx: number, ny: number) {
  const c = at(g, x, y)
  c.scanned = true
  set(g, nx, ny, c)
  set(g, x, y, blank(T.SPACE))
}

function spawn(g: Game, x: number, y: number, t: Tile, falling = false) {
  const c = blank(t)
  c.id = g.nextId++
  c.falling = falling
  c.scanned = true
  if (t === T.FIREFLY || t === T.BUTTERFLY) c.dir = 3
  set(g, x, y, c)
  return c
}

const isRounded = (t: Tile) => t === T.BOULDER || t === T.DIAMOND || t === T.WALL || t === T.MAGIC
const isEmpty = (c: Cell) => c.t === T.SPACE

export function explode(g: Game, cx: number, cy: number, toDiamond: boolean) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx
      const y = cy + dy
      const c = at(g, x, y)
      if (c === OUTSIDE || c.t === T.STEEL || c.t === T.EXIT || c.t === T.INBOX) continue
      if (c.t === T.PLAYER) killPlayer(g)
      const e = blank(T.EXPLODE)
      e.id = g.nextId++
      e.toDiamond = toDiamond
      e.scanned = true
      set(g, x, y, e)
    }
  g.events.push({ k: 'explode', x: cx, y: cy, toDiamond })
}

function killPlayer(g: Game) {
  if (!g.player.alive) return
  g.player.alive = false
  if (g.status === 'playing') {
    g.status = 'dead'
    g.events.push({ k: 'die' })
  }
}

function collect(g: Game, x: number, y: number) {
  g.diamonds++
  g.score += g.exitOpen ? g.settings.extra : g.settings.value
  g.events.push({ k: 'collect', x, y })
}

/** Haritada kalan elmaslar (elmasa dönüşecek patlamalar dahil). */
export function diamondsLeft(g: Game): number {
  let n = 0
  for (const c of g.cells) if (c.t === T.DIAMOND || (c.t === T.EXPLODE && c.toDiamond)) n++
  return n
}

/**
 * Kural: çıkış, mağaradaki bütün elmaslar toplanınca açılır (haritada elmas
 * kalmayınca ve en az mağaranın gerekli sayısı kadar toplanmışsa).
 */
function checkExit(g: Game) {
  if (g.exitOpen || g.diamonds < g.settings.needed || diamondsLeft(g) > 0) return
  g.exitOpen = true
  g.events.push({ k: 'exitOpen' })
}

function updatePlayer(g: Game, x: number, y: number, input: Input) {
  const c = at(g, x, y)
  g.player.x = x
  g.player.y = y
  if (g.status !== 'playing' || input.dir < 0) return
  const d = input.dir
  if (d === 1 || d === 3) c.dir = d
  const nx = x + DX[d]
  const ny = y + DY[d]
  const target = at(g, nx, ny)
  let go = false
  switch (target.t) {
    case T.SPACE:
      go = true
      break
    case T.DIRT:
      g.events.push({ k: 'dig', x: nx, y: ny })
      go = true
      break
    case T.DIAMOND:
      collect(g, nx, ny)
      go = true
      break
    case T.EXIT:
      if (g.exitOpen && !input.snap) {
        set(g, x, y, blank(T.SPACE))
        g.player.alive = false
        g.status = 'won'
        g.score += Math.ceil(g.timeTicks / TICKS_PER_SECOND)
        g.events.push({ k: 'win' })
      }
      return
    case T.BOULDER: {
      // Yatay itme: arkası boşsa ve taş düşmüyorsa, 1/4 olasılıkla
      if ((d === 1 || d === 3) && !target.falling) {
        const bx = nx + DX[d]
        if (isEmpty(at(g, bx, ny)) && rand(g) < 0.25) {
          move(g, nx, ny, bx, ny)
          g.events.push({ k: 'push', x: bx, y: ny })
          go = true
        }
      }
      break
    }
  }
  if (!go) return
  if (input.snap) {
    if (target.t !== T.SPACE && target.t !== T.BOULDER) set(g, nx, ny, blank(T.SPACE))
    return
  }
  move(g, x, y, nx, ny)
  g.player.x = nx
  g.player.y = ny
}

function updateFalling(g: Game, x: number, y: number) {
  const c = at(g, x, y)
  const below = at(g, x, y + 1)
  if (isEmpty(below)) {
    c.falling = true
    move(g, x, y, x, y + 1)
    return
  }
  if (c.falling) {
    if (below.t === T.PLAYER || below.t === T.FIREFLY || below.t === T.BUTTERFLY) {
      explode(g, x, y + 1, below.t === T.BUTTERFLY)
      return
    }
    if (below.t === T.MAGIC) {
      if (g.magic === 'dormant') g.magic = 'active'
      if (g.magic === 'active') {
        set(g, x, y, blank(T.SPACE))
        g.events.push({ k: 'magic', x, y: y + 1 })
        if (isEmpty(at(g, x, y + 2))) spawn(g, x, y + 2, c.t === T.BOULDER ? T.DIAMOND : T.BOULDER, true)
        return
      }
    }
  }
  if (isRounded(below.t) && !below.falling && tryRoll(g, x, y)) return
  if (c.falling) {
    c.falling = false
    g.events.push({ k: 'land', x, y, t: c.t })
  }
}

function tryRoll(g: Game, x: number, y: number): boolean {
  for (const dx of [-1, 1]) {
    if (isEmpty(at(g, x + dx, y)) && isEmpty(at(g, x + dx, y + 1))) {
      at(g, x, y).falling = true
      move(g, x, y, x + dx, y)
      return true
    }
  }
  return false
}

function updateEnemy(g: Game, x: number, y: number) {
  const c = at(g, x, y)
  for (let d = 0; d < 4; d++) {
    const n = at(g, x + DX[d], y + DY[d]).t
    if (n === T.PLAYER || n === T.AMOEBA) {
      explode(g, x, y, c.t === T.BUTTERFLY)
      return
    }
  }
  // Ateşböceği sola, kelebek sağa dönmeyi dener (duvar takibi)
  const turn = c.t === T.FIREFLY ? (c.dir + 3) % 4 : (c.dir + 1) % 4
  if (isEmpty(at(g, x + DX[turn], y + DY[turn]))) {
    c.dir = turn
    move(g, x, y, x + DX[turn], y + DY[turn])
  } else if (isEmpty(at(g, x + DX[c.dir], y + DY[c.dir]))) {
    move(g, x, y, x + DX[c.dir], y + DY[c.dir])
  } else {
    c.dir = c.t === T.FIREFLY ? (c.dir + 1) % 4 : (c.dir + 3) % 4
    c.scanned = true
  }
}

interface AmoebaScan {
  count: number
  canGrow: boolean
}

function updateAmoeba(g: Game, x: number, y: number, scan: AmoebaScan) {
  if (g.amoeba !== 'normal') {
    spawn(g, x, y, g.amoeba === 'toDiamond' ? T.DIAMOND : T.BOULDER)
    return
  }
  scan.count++
  let free = false
  for (let d = 0; d < 4; d++) {
    const n = at(g, x + DX[d], y + DY[d]).t
    if (n === T.SPACE || n === T.DIRT) free = true
  }
  if (!free) return
  scan.canGrow = true
  const fast = g.tick >= (g.settings.amoebaTime ?? 30) * TICKS_PER_SECOND
  if (rand(g) < (fast ? 0.25 : 0.03)) {
    const d = Math.floor(rand(g) * 4)
    const n = at(g, x + DX[d], y + DY[d])
    if (n.t === T.SPACE || n.t === T.DIRT) spawn(g, x + DX[d], y + DY[d], T.AMOEBA)
  }
}

export function step(g: Game, input: Input): GameEvent[] {
  g.events = []
  for (const c of g.cells) c.scanned = false
  const scan: AmoebaScan = { count: 0, canGrow: false }

  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const c = at(g, x, y)
      if (c.scanned) continue
      switch (c.t) {
        case T.PLAYER:
          updatePlayer(g, x, y, input)
          break
        case T.BOULDER:
        case T.DIAMOND:
          updateFalling(g, x, y)
          break
        case T.FIREFLY:
        case T.BUTTERFLY:
          updateEnemy(g, x, y)
          break
        case T.AMOEBA:
          updateAmoeba(g, x, y, scan)
          break
        case T.EXPLODE:
          if (++c.stage >= EXPLODE_TICKS) spawn(g, x, y, c.toDiamond ? T.DIAMOND : T.SPACE)
          break
        case T.INBOX:
          if (++c.stage >= INBOX_TICKS && g.status === 'playing') {
            const p = spawn(g, x, y, T.PLAYER)
            p.dir = 1
            g.player = { x, y, alive: true, spawned: true }
            g.events.push({ k: 'spawn', x, y })
          }
          break
      }
    }

  // Amip durumu bir sonraki tick'te uygulanır (orijinaldeki gibi)
  g.amoebaCount = scan.count
  if (g.amoeba === 'normal') {
    if (scan.count >= AMOEBA_MAX) g.amoeba = 'toBoulder'
    else if (scan.count > 0 && !scan.canGrow) g.amoeba = 'toDiamond'
  }

  if (g.magic === 'active' && --g.magicTicks <= 0) g.magic = 'expired'
  checkExit(g)

  if (g.status === 'playing' && g.player.spawned) {
    if (--g.timeTicks <= 0) {
      g.timeTicks = 0
      g.status = 'timeout'
      g.events.push({ k: 'timeout' })
    }
  }
  g.tick++
  return g.events
}

export function timeLeft(g: Game): number {
  return Math.ceil(g.timeTicks / TICKS_PER_SECOND)
}

export function countTiles(g: Game, t: Tile): number {
  let n = 0
  for (const c of g.cells) if (c.t === t) n++
  return n
}
