import { create } from 'zustand'
import { CAVES } from './levels.ts'

export type Screen = 'title' | 'playing' | 'dead' | 'timeout' | 'won' | 'gameover' | 'complete'

export interface Hud {
  diamonds: number
  needed: number
  value: number
  time: number
  score: number
  exitOpen: boolean
}

interface State {
  screen: Screen
  level: number
  lives: number
  totalScore: number
  best: number
  gameKey: number // değişince mağara yeniden kurulur
  paused: boolean
  muted: boolean
  overview: boolean
  hud: Hud
  setHud: (h: Hud) => void
  start: (level: number) => void
  retry: () => void
  next: () => void
  finish: (result: 'dead' | 'timeout' | 'won', caveScore: number) => void
  toTitle: () => void
  toggle: (k: 'paused' | 'muted' | 'overview') => void
}

const readBest = () => {
  try {
    return Number(localStorage.getItem('boulder3d-best')) || 0
  } catch {
    return 0
  }
}

export const LIVES = 3

export const useGame = create<State>((set, get) => ({
  screen: 'title',
  level: 0,
  lives: LIVES,
  totalScore: 0,
  best: readBest(),
  gameKey: 0,
  paused: false,
  muted: false,
  overview: false,
  hud: { diamonds: 0, needed: 0, value: 0, time: 0, score: 0, exitOpen: false },
  setHud: (hud) => set({ hud }),
  start: (level) => set((s) => ({ screen: 'playing', level, lives: LIVES, totalScore: 0, gameKey: s.gameKey + 1, paused: false })),
  retry: () => set((s) => ({ screen: 'playing', gameKey: s.gameKey + 1, paused: false })),
  next: () => set((s) => ({ screen: 'playing', level: s.level + 1, gameKey: s.gameKey + 1, paused: false })),
  finish: (result, caveScore) => {
    const s = get()
    if (result === 'won') {
      const totalScore = s.totalScore + caveScore
      const last = s.level >= CAVES.length - 1
      saveBest(totalScore)
      set({ totalScore, screen: last ? 'complete' : 'won', best: Math.max(s.best, totalScore) })
    } else {
      const lives = s.lives - 1
      if (lives <= 0) saveBest(s.totalScore)
      set({ lives, screen: lives <= 0 ? 'gameover' : result, best: Math.max(s.best, s.totalScore) })
    }
  },
  toTitle: () => set({ screen: 'title', paused: false }),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<State>),
}))

function saveBest(score: number) {
  try {
    if (score > readBest()) localStorage.setItem('boulder3d-best', String(score))
  } catch {
    // depolama kapalıysa rekor yalnızca bu oturumda tutulur
  }
}
