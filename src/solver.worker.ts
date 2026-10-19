// Çözücüyü ayrı iş parçacığında çalıştırır: arama sürerken oyun ve arayüz donmaz.
import { solve } from './solver.ts'
import type { Game } from './engine.ts'

self.onmessage = (e: MessageEvent<{ game: Game; maxMs: number }>) => {
  const { game, maxMs } = e.data
  self.postMessage(solve(game, { maxMs }))
}
