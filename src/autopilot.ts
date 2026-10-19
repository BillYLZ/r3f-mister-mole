// Çözüm düğmesi: o anki oyunun kopyasını çözücüye gönderir; bulunan hamleleri
// her tick'te sırayla oyuna verir ve yolu çizim için sunar. Oyuncu bir yön
// tuşuna basınca kontrol ona geçer.
import type { Game, Input } from './engine.ts'
import { cloneGame } from './engine.ts'
import type { Solution } from './solver.ts'
import { setPressListener } from './input.ts'
import { useGame } from './store.ts'

let live: Game | null = null
let plan: { inputs: Input[]; path: number[]; index: number } | null = null
let worker: Worker | null = null
let request = 0
let toastTimer: ReturnType<typeof setTimeout> | undefined

/** Sahneler yeni mağara kurduklarında çağırır. */
export function setLiveGame(g: Game) {
  live = g
  stopAuto()
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

export function startSolve() {
  const st = useGame.getState()
  if (!live || st.screen !== 'playing' || st.solve === 'solving') return
  if (st.solve === 'running') {
    stopAuto()
    return
  }
  if (live.status !== 'playing') return
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
  worker.postMessage({ game, maxMs: 10000 })
}

// Oyuncu yön tuşuna basınca otomatik pilot durur
setPressListener(() => {
  if (plan) stopAuto()
})
