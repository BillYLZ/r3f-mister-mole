// Çözüm düğmesi: o anki oyunun kopyasını çözücüye gönderir; bulunan hamleleri
// her tick'te sırayla oyuna verir ve yolu çizim için sunar. Oyuncu bir yön
// tuşuna basınca kontrol ona geçer.
import type { Game, Input } from './engine.ts'
import { cloneGame, createGame, step } from './engine.ts'
import { CAVES, W, H, buildCave, caveSeed } from './levels.ts'
import { decodeInputs } from './solutions.ts'
import SOLUTIONS from './solutions.json'
import type { Solution } from './solver.ts'
import { setPressListener } from './input.ts'
import { useGame } from './store.ts'

let live: Game | null = null
let plan: { inputs: Input[]; path: number[]; index: number } | null = null
let worker: Worker | null = null
let request = 0
let toastTimer: ReturnType<typeof setTimeout> | undefined
let replayFromStart: Input[] | null = null // mağara baştan kurulunca oynatılacak kayıtlı çözüm

/** Sahneler yeni mağara kurduklarında çağırır. */
export function setLiveGame(g: Game) {
  live = g
  stopAuto()
  if (replayFromStart) {
    const inputs = replayFromStart
    replayFromStart = null
    plan = { inputs, path: pathOf(g, inputs), index: 0 }
    useGame.getState().setSolve('running')
  }
}

/** Bu tick'te otomatik pilotun girdisi (yoksa null: oyuncu oynar). */
export function autoInput(): Input | null {
  if (!plan) return null
  const inp = plan.inputs[plan.index++]
  if (plan.index >= plan.inputs.length) {
    plan = null
    useGame.getState().setSolve('idle')
  }
  return inp ?? null
}

/** Çizim için kalan yol: oyuncunun sırayla geçeceği hücreler. */
export function remainingPath(): number[] {
  return plan ? plan.path.slice(plan.index) : []
}

export function stopAuto() {
  request++ // süren bir arama varsa sonucu yok sayılır
  plan = null
  const st = useGame.getState()
  if (st.solve !== 'idle' && st.solve !== 'failed') st.setSolve('idle')
}

function toast(message: string) {
  useGame.getState().setSolve('failed', message)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (useGame.getState().solve === 'failed') useGame.getState().setSolve('idle')
  }, 3500)
}

/** İki oyun durumu aynı mı (önceden hesaplanmış çözüm geçerli mi)? */
function same(a: Game, b: Game): boolean {
  if (a.tick !== b.tick || a.rngState !== b.rngState || a.diamonds !== b.diamonds || a.cells.length !== b.cells.length) return false
  for (let i = 0; i < a.cells.length; i++) {
    const x = a.cells[i]
    const y = b.cells[i]
    if (x.t !== y.t || x.falling !== y.falling || x.dir !== y.dir || x.stage !== y.stage) return false
  }
  return true
}

/**
 * Oyuncu henüz hiçbir hamle yapmadıysa önceden hesaplanmış çözümü kullan.
 * 'continue': kayıtlı çözüm bu andan aynen sürdürülebilir (kalan girdiler).
 * 'restart': zaman geçmiş, mağara baştan kurulup çözüm en baştan oynatılmalı.
 */
function storedPlan(g: Game): { mode: 'continue' | 'restart'; inputs: Input[] } | null {
  const { level, seed } = useGame.getState()
  const cave = CAVES[level]
  const stored = (SOLUTIONS as Record<string, string>)[level]
  if (!stored || caveSeed(level, seed) !== cave.seed) return null
  // Oyuncu hiç hamle yapmadıysa durum, aynı sayıda "bekle" ile oynanmış taze mağarayla aynıdır
  const fresh = createGame(W, H, buildCave(cave), cave)
  for (let k = 0; k < g.tick; k++) step(fresh, { dir: -1, snap: false })
  if (!same(fresh, g)) return null
  const inputs = decodeInputs(stored)
  const waitedOnly = g.tick <= inputs.length && inputs.slice(0, g.tick).every((i) => i.dir < 0)
  return waitedOnly ? { mode: 'continue', inputs: inputs.slice(g.tick) } : { mode: 'restart', inputs }
}

function pathOf(g: Game, inputs: Input[]): number[] {
  const t = cloneGame(g)
  return inputs.map((inp) => {
    step(t, inp)
    return t.player.y * t.w + t.player.x
  })
}

export function startSolve() {
  const st = useGame.getState()
  if (!live || st.screen !== 'playing' || st.solve === 'solving') return
  if (st.solve === 'running') {
    stopAuto()
    return
  }
  if (live.status !== 'playing') return
  // Mağaranın başındaysak önceden hesaplanmış çözüm anında kullanılır
  const ready = storedPlan(live)
  if (ready?.mode === 'continue') {
    request++
    plan = { inputs: ready.inputs, path: pathOf(live, ready.inputs), index: 0 }
    st.setSolve('running')
    return
  }
  if (ready?.mode === 'restart') {
    // Mağarayı can kaybetmeden baştan kur; sahne yeni oyunu bildirince çözüm başlar
    replayFromStart = ready.inputs
    st.retry()
    return
  }
  const id = ++request
  st.setSolve('solving')
  if (!worker) worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
  const game = cloneGame(live)
  worker.onmessage = (e: MessageEvent<Solution>) => {
    if (id !== request) return
    const s = e.data
    if (s.ok && s.inputs.length) {
      plan = { inputs: s.inputs, path: s.path, index: 0 }
      useGame.getState().setSolve('running')
    } else toast(s.reason ?? 'Çözüm bulunamadı')
  }
  worker.onerror = () => {
    if (id === request) toast('Çözücü çalışmadı')
  }
  worker.postMessage({ game, maxMs: 25000 })
}

// Oyuncu yön tuşuna basınca otomatik pilot durur
setPressListener(() => {
  if (plan) stopAuto()
})
