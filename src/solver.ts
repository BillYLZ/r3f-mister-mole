// Mağara çözücü: oyunun kopyasını motorla adım adım ileri simüle ederek
// kazandıran bir hamle dizisi arar. Motor belirlenimci olduğu için bulunan
// hamleler gerçek oyunda aynen oynanınca aynı sonucu verir.
//
// Yöntem: derinlik öncelikli arama. Her düğümde hedefler (çıkış, en yakın
// elmaslar, gerekirse taş düşürme noktaları) sırayla denenir. Hedefe her tick
// yeniden hesaplanan en kısa yoldan yürünür; her adım simüle edilip ölümle
// biten adımlar elenir. Çıkmaz sokakta geri dönülür, aynı durum ikinci kez
// denenmez.
import { DX, DY, T, at, cloneGame, mulberry32, step, type Game, type Input, type Tile } from './engine.ts'

export interface Solution {
  ok: boolean
  inputs: Input[] // tick başına girdi
  path: number[] // her tick sonunda oyuncunun hücresi (çizim için)
  reason?: string
  allGems: boolean // mağaradaki bütün elmaslar toplandı mı
  ms: number
  nodes: number
}

const NONE: Input = { dir: -1, snap: false }
const MOVE = [0, 1, 2, 3].map((dir) => ({ dir, snap: false }) as Input)

class Timeout extends Error {}

interface Ctx {
  t0: number
  maxMs: number
  nodes: number
  failed: Set<string>
  best: number // aramada ulaşılan en çok elmas (tanı için)
  width: number // her düğümde denenecek elmas hedefi sayısı
  rnd: (() => number) | null // elmas sırasını hafifçe karıştırmak için (null: karıştırma)
}

interface Plan {
  g: Game
  inputs: Input[]
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const isEnemy = (t: Tile) => t === T.FIREFLY || t === T.BUTTERFLY
const ok = (g: Game) => g.status === 'won' || (g.status === 'playing' && g.player.alive)

function tick(c: Ctx, g: Game, input: Input) {
  step(g, input)
  if (++c.nodes % 256 === 0 && now() - c.t0 > c.maxMs) throw new Timeout()
}

/** Oyuncunun güvenle girebileceği hücre mi? */
function passable(g: Game, x: number, y: number): boolean {
  const c = at(g, x, y)
  if (c.t === T.EXIT) return g.exitOpen
  if (c.t !== T.SPACE && c.t !== T.DIRT && c.t !== T.DIAMOND) return false
  for (let d = 0; d < 4; d++) if (isEnemy(at(g, x + DX[d], y + DY[d]).t)) return false
  const up = at(g, x, y - 1)
  if ((up.t === T.BOULDER || up.t === T.DIAMOND) && up.falling) return false
  return true
}

/** Oyuncudan tüm hücrelere en kısa yol uzunlukları (-1: ulaşılamaz). */
function bfs(g: Game): Int16Array {
  const dist = new Int16Array(g.w * g.h).fill(-1)
  if (!g.player.alive) return dist
  const start = g.player.y * g.w + g.player.x
  const q = [start]
  dist[start] = 0
  for (let h = 0; h < q.length; h++) {
    const i = q[h]
    const x = i % g.w
    const y = (i - x) / g.w
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]
      const ny = y + DY[d]
      const j = ny * g.w + nx
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || dist[j] >= 0 || !passable(g, nx, ny)) continue
      dist[j] = dist[i] + 1
      q.push(j)
    }
  }
  return dist
}

/** Hedefe giden en kısa yolların ilk adım yönleri (hedeften geriye BFS). */
function firstSteps(g: Game, target: number): number[] {
  const dist = new Int16Array(g.w * g.h).fill(-1)
  const q = [target]
  dist[target] = 0
  const px = g.player.x
  const py = g.player.y
  for (let h = 0; h < q.length; h++) {
    const i = q[h]
    const x = i % g.w
    const y = (i - x) / g.w
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]
      const ny = y + DY[d]
      const j = ny * g.w + nx
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || dist[j] >= 0) continue
      if (!(nx === px && ny === py) && !passable(g, nx, ny)) continue
      dist[j] = dist[i] + 1
      q.push(j)
    }
  }
  const here = dist[py * g.w + px]
  if (here <= 0) return []
  const dirs: number[] = []
  for (let d = 0; d < 4; d++) {
    const nx = px + DX[d]
    const ny = py + DY[d]
    const v = dist[ny * g.w + nx]
    if (v >= 0 && v === here - 1) dirs.push(d)
  }
  return dirs
}

/** Bu durumdan kısa vadede sağ çıkılabiliyor mu? (beklemek ya da bir yöne kaçmak) */
function survives(c: Ctx, g: Game): boolean {
  if (!ok(g)) return false
  if (g.status === 'won') return true
  for (const inp of [NONE, ...MOVE]) {
    const t = cloneGame(g)
    let alive = true
    for (let k = 0; k < 3 && alive; k++) {
      tick(c, t, inp)
      alive = ok(t)
    }
    if (alive) return true
  }
  return false
}

type Done = (g: Game) => boolean

/** Hedefe yürü: her tick en kısa yolu yeniden hesapla, ölümcül adımları ele. */
function walk(c: Ctx, g0: Game, target: number, done: Done, maxTicks = 220): Plan | null {
  let g = cloneGame(g0)
  const inputs: Input[] = []
  let waits = 0
  for (let k = 0; k < maxTicks; k++) {
    if (done(g)) return inputs.length || g.status === 'won' ? { g, inputs } : null
    // Önce hedefe giden adımlar, sonra bekleme, en son kaçış (diğer yönler):
    // örneğin yolu kesen bir ateşböceğinden uzaklaşıp geçmesini beklemek için
    const first = firstSteps(g, target)
    const options = [...first.map((d) => MOVE[d]), NONE, ...MOVE.filter((m) => !first.includes(m.dir))]
    let moved = false
    for (const inp of options) {
      const t = cloneGame(g)
      tick(c, t, inp)
      if (!survives(c, t)) continue
      if (!first.includes(inp.dir) && ++waits > 24) return null
      g = t
      inputs.push(inp)
      moved = true
      break
    }
    if (!moved) return null
    if (g.status === 'won') return { g, inputs }
  }
  return null
}

/** Oyuncunun şu an yol bulabildiği elmaslar. */
function reachableGems(g: Game): number {
  const dist = bfs(g)
  let n = 0
  g.cells.forEach((cell, i) => {
    if (cell.t === T.DIAMOND && dist[i] >= 0) n++
  })
  return n
}

/** Ortaya çıkmış ve çıkacak elmaslar (kelebek patlamaları dahil). */
function diamondTiles(g: Game): number {
  let n = 0
  for (const cell of g.cells) if (cell.t === T.DIAMOND || (cell.t === T.EXPLODE && cell.toDiamond)) n++
  return n
}

/**
 * Taş düşürme: altındaki toprağı yandan "yerinde kazı" ile al. Taş bir kelebeği
 * ezer ya da sihirli duvardan geçip elmasa dönüşürse elmas sayısı artar.
 * Kelebeğin konumu zamana bağlı olduğu için birkaç bekleme süresi denenir.
 */
function drop(c: Ctx, g0: Game, dirt: number, stand: number, unbury: boolean): Plan | null {
  let base: Plan | null = null
  if (g0.player.y * g0.w + g0.player.x === stand) base = { g: g0, inputs: [] }
  else base = walk(c, g0, stand, (g) => g.player.y * g.w + g.player.x === stand)
  if (!base) return null
  const dx = (dirt % g0.w) - (stand % g0.w)
  const snap: Input = { dir: dx > 0 ? 1 : 3, snap: true }
  const before = diamondTiles(base.g)
  const reachBefore = unbury ? reachableGems(base.g) : 0
  for (let wait = 0; wait < 8; wait++) {
    const g = cloneGame(base.g)
    const inputs = [...base.inputs]
    let alive = true
    for (let k = 0; k < wait && alive; k++) {
      tick(c, g, NONE)
      inputs.push(NONE)
      alive = ok(g)
    }
    if (!alive) break
    tick(c, g, snap)
    inputs.push(snap)
    for (let k = 0; k < 16 && alive; k++) {
      tick(c, g, NONE)
      inputs.push(NONE)
      alive = survives(c, g)
    }
    // Başarı: yeni elmas çıktı ya da gömülü bir elmasa yol açıldı
    if (alive && (diamondTiles(g) > before || (unbury && reachableGems(g) > reachBefore))) return { g, inputs }
  }
  return null
}

/** Yanında boşluk olan taşı it (itme 1/4 olasılıklı, birkaç kez denenir). */
function push(c: Ctx, g0: Game, stand: number, dir: number): Plan | null {
  const atStand = (g: Game) => g.player.y * g.w + g.player.x === stand
  const base = atStand(g0) ? { g: g0, inputs: [] as Input[] } : walk(c, g0, stand, atStand)
  if (!base) return null
  const g = cloneGame(base.g)
  const inputs = [...base.inputs]
  for (let k = 0; k < 16; k++) {
    tick(c, g, MOVE[dir])
    inputs.push(MOVE[dir])
    if (!survives(c, g)) return null
    if (!atStand(g)) return { g, inputs }
  }
  return null
}

/** Keşif: bir noktaya git ve düşen taşların yerleşmesini bekle (yeni yollar açar). */
function explore(c: Ctx, g0: Game, cell: number): Plan | null {
  const plan = walk(c, g0, cell, (g) => g.player.y * g.w + g.player.x === cell)
  if (!plan) return null
  const g = cloneGame(plan.g)
  const inputs = [...plan.inputs]
  for (let k = 0; k < 6; k++) {
    tick(c, g, NONE)
    inputs.push(NONE)
    if (!survives(c, g)) return null
  }
  return { g, inputs }
}

interface Candidate {
  run: () => Plan | null
}

function candidates(c: Ctx, g: Game): Candidate[] {
  const dist = bfs(g)
  const list: Candidate[] = []
  const reachable = (i: number) => dist[i] >= 0
  const exit = g.cells.findIndex((cell) => cell.t === T.EXIT)
  // Kural gereği çıkış ancak bütün elmaslar toplanınca açılır
  const exitAllowed = g.exitOpen
  const exitBlocked = exitAllowed && !(exit >= 0 && reachable(exit))
  if (exitAllowed && !exitBlocked) list.push({ run: () => walk(c, g, exit, (s) => s.status === 'won') })
  const gems: number[] = []
  g.cells.forEach((cell, i) => {
    if (cell.t === T.DIAMOND && reachable(i)) gems.push(i)
  })
  // En yakından uzağa; karıştırmalı denemelerde yakın olanların sırası biraz oynatılır
  const jitter = new Map<number, number>()
  for (const i of gems) jitter.set(i, dist[i] + (c.rnd ? c.rnd() * 6 : 0))
  gems.sort((a, b) => jitter.get(a)! - jitter.get(b)!)
  const startD = g.diamonds
  for (const i of gems.slice(0, c.width)) list.push({ run: () => walk(c, g, i, (s) => s.diamonds > startD) })
  if (!g.exitOpen) {
    // taş düşürme noktaları: üstünde duran taş olan toprak, yanında durulacak yer
    const drops: [number, number, number][] = []
    for (let y = 1; y < g.h - 1; y++)
      for (let x = 1; x < g.w - 1; x++) {
        const i = y * g.w + x
        if (g.cells[i].t !== T.DIRT) continue
        const up = at(g, x, y - 1)
        if (up.t !== T.BOULDER || up.falling) continue
        for (const sx of [x - 1, x + 1]) {
          const s = y * g.w + sx
          if (reachable(s) || (sx === g.player.x && y === g.player.y)) drops.push([i, s, dist[s]])
        }
      }
    // Önce işe yarayacak olanlar: taş sihirli duvara ya da bir düşmanın yanına düşecekse
    const useful = (dirt: number) => {
      const x = dirt % g.w
      let y = (dirt - x) / g.w
      while (at(g, x, y + 1).t === T.SPACE) y++
      const below = at(g, x, y + 1).t
      if (below === T.MAGIC || isEnemy(below)) return true
      for (let yy = (dirt - x) / g.w + 1; yy <= y + 1; yy++)
        for (let dx = -2; dx <= 2; dx++) if (at(g, x + dx, yy).t === T.BUTTERFLY) return true
      return false
    }
    // Ulaşılamayan (gömülü) elmas varsa, onlara yakın düşürmeler öne alınır
    const buried: number[] = []
    g.cells.forEach((cell, i) => {
      if (cell.t === T.DIAMOND && !reachable(i)) buried.push(i)
    })
    const nearBuried = (i: number) => {
      let best = 999
      for (const b of buried) best = Math.min(best, Math.abs((b % g.w) - (i % g.w)) + Math.abs(Math.floor(b / g.w) - Math.floor(i / g.w)))
      return best
    }
    const near = (d: [number, number, number]) => (gems.length === 0 && buried.length ? nearBuried(d[0]) : 0)
    drops.sort((a, b) => Number(useful(b[0])) - Number(useful(a[0])) || near(a) - near(b) || a[2] - b[2])
    // Mağaradaki elmaslar yetmiyorsa işe yarayan düşürmeler elmas toplamadan önce
    // denenir (sihirli duvarın süresi ilk taşla başlar, beklemeye gelmez)
    let onMap = 0
    for (const cell of g.cells) if (cell.t === T.DIAMOND) onMap++
    const short = g.diamonds + onMap < g.settings.needed
    const dropCands = drops.slice(0, 6).map(([dirt, stand]) => ({ run: () => drop(c, g, dirt, stand, gems.length === 0), useful: useful(dirt) }))
    if (short) list.splice(g.exitOpen ? 1 : 0, 0, ...dropCands.filter((d) => d.useful))
    list.push(...dropCands.filter((d) => !short || !d.useful))
  }
  // Taş itme: duran taşın yanındaki ulaşılabilir hücreden, öbür yanı boşsa
  const pushes: [number, number, number][] = []
  const here = g.player.y * g.w + g.player.x
  for (let y = 1; y < g.h - 1; y++)
    for (let x = 1; x < g.w - 1; x++) {
      const b = at(g, x, y)
      if (b.t !== T.BOULDER || b.falling) continue
      for (const dir of [1, 3]) {
        const sx = x - DX[dir]
        const s = y * g.w + sx
        if (at(g, x + DX[dir], y).t === T.SPACE && (reachable(s) || s === here)) pushes.push([s, dir, s === here ? 0 : dist[s]])
      }
    }
  pushes.sort((a, b) => a[2] - b[2])
  for (const [stand, dir] of pushes.slice(0, 3)) list.push({ run: () => push(c, g, stand, dir) })
  // Keşif: ulaşılan hücrelerden, ulaşılamayan hedefe (elmaslar ya da açık ama
  // yolu tıkalı çıkış) kuş uçuşu en yakın olanlar
  if (gems.length === 0 || exitBlocked) {
    const far: number[] = []
    if (exitBlocked) far.push(exit)
    else
      g.cells.forEach((cell, i) => {
        if (cell.t === T.DIAMOND) far.push(i)
      })
    if (far.length) {
      const score = (i: number) => {
        const x = i % g.w
        const y = (i - x) / g.w
        let best = Infinity
        for (const f of far) best = Math.min(best, Math.abs((f % g.w) - x) + Math.abs(Math.floor(f / g.w) - y))
        return best
      }
      const spots: [number, number][] = []
      dist.forEach((d, i) => {
        if (d > 0) spots.push([i, score(i)])
      })
      spots.sort((a, b) => a[1] - b[1])
      for (const [cell] of spots.slice(0, 3)) list.push({ run: () => explore(c, g, cell) })
    }
  }
  return list
}

/**
 * Durumun kısa özeti: aynı durumu ikinci kez aramamak için. Kazılmış toprak ve
 * düşmanların anlık yeri dikkate alınmaz; yalnızca taşlar, elmaslar, duvarlar,
 * karakter ve toplanan elmas sayısı. Böylece aynı elmasları farklı sırayla
 * toplayıp aynı yere varan yollar tek kez denenir.
 */
function key(g: Game): string {
  let h = 2166136261
  for (let i = 0; i < g.cells.length; i++) {
    const t = g.cells[i].t
    if (t === T.DIRT || t === T.SPACE || t === T.FIREFLY || t === T.BUTTERFLY) continue
    h = Math.imul(h ^ (i * 31 + t), 16777619)
  }
  return `${g.player.x},${g.player.y},${g.diamonds},${h >>> 0}`
}

function dfs(c: Ctx, g: Game, depth: number): Input[] | null {
  if (g.status === 'won') return []
  if (!ok(g) || depth > 80) return null
  if (g.diamonds > c.best) c.best = g.diamonds
  const k = key(g)
  if (c.failed.has(k)) return null
  for (const cand of candidates(c, g)) {
    const plan = cand.run()
    if (!plan) continue
    const rest = dfs(c, plan.g, depth + 1)
    if (rest) return plan.inputs.concat(rest)
  }
  c.failed.add(k)
  return null
}

/**
 * Verilen andan itibaren mağarayı çözmeye çalışır. Oyun nesnesi değişmez.
 * Kural gereği çözüm mağaradaki bütün elmasları toplar.
 *
 * Tekrarlı dar arama: önce her düğümde yalnızca en yakın elmas denenir (hızlı,
 * çoğu mağarayı çözer); olmazsa elmas sırası hafifçe karıştırılarak ve sonra
 * daha çok seçenekle yeniden denenir. Her deneme kısa süreyle sınırlıdır, böylece
 * tek bir kötü dal bütün süreyi tüketemez.
 */
export function solve(game: Game, opts: { maxMs?: number } = {}): Solution {
  const maxMs = opts.maxMs ?? 8000
  const t0 = now()
  // [genişlik, karıştırma tohumu, süre payı]
  const schedule: [number, number, number][] = [
    [1, 0, 0.08], [5, 0, 0.4], [1, 1, 0.08], [2, 0, 0.15], [1, 2, 0.08], [3, 0, 0.2], [1, 3, 0.08], [5, 1, 0.3], [2, 1, 0.15],
  ]
  let nodes = 0
  let best = 0
  let reason = ''
  for (let k = 0; ; k++) {
    const left = maxMs - (now() - t0)
    if (left < 150) break
    const [width, seed, share] = k < schedule.length ? schedule[k] : [1 + (k % 5), k, 0.15]
    const r = attempt(game, Math.min(left, Math.max(400, maxMs * share)), width, seed, t0)
    nodes += r.nodes
    best = Math.max(best, r.best)
    if (r.ok) return { ...r, nodes }
    reason = r.reason ?? ''
    if (reason === 'Oyun bitmiş') break
  }
  const sol = attempt(game, 0, 1, 0, t0, true)
  return { ...sol, nodes, reason: reason === 'Oyun bitmiş' ? reason : `Çözüm bulunamadı (en çok ${best} elmas toplanabildi)` }
}

function attempt(game: Game, maxMs: number, width: number, seed: number, start: number, empty = false): Solution & { best: number } {
  const c: Ctx = { t0: now(), maxMs, nodes: 0, failed: new Set(), best: 0, width, rnd: seed ? mulberry32(seed * 7919) : null }
  const result = (okk: boolean, inputs: Input[], reason?: string) => {
    const path: number[] = []
    const g = cloneGame(game)
    for (const inp of inputs) {
      step(g, inp)
      path.push(g.player.y * g.w + g.player.x)
    }
    return { ok: okk, inputs, path, reason, allGems: okk, ms: Math.round(now() - start), nodes: c.nodes, best: c.best }
  }
  if (empty) return result(false, [])
  if (game.status !== 'playing') return result(false, [], 'Oyun bitmiş')
  try {
    // Oyuncu henüz girişten çıkmadıysa bekle
    const g = cloneGame(game)
    const pre: Input[] = []
    while (!g.player.spawned && pre.length < 60) {
      tick(c, g, NONE)
      pre.push(NONE)
    }
    const rest = dfs(c, g, 0)
    if (rest) return result(true, pre.concat(rest))
    return result(false, [], 'Bu durumdan çözüm bulunamadı')
  } catch (e) {
    if (e instanceof Timeout) return result(false, [], 'Süre yetmedi')
    throw e
  }
}
export const _attempt = attempt
