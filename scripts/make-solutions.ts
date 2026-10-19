// Çözümü olan varsayılan mağaraların başlangıçtan çözümlerini hesaplayıp
// src/solutions.json'a yazar: node --experimental-strip-types scripts/make-solutions.ts
// Her girdi tek harf: '.' bekle, u/r/d/l yön, büyük harf "yerinde kazı".
import { writeFileSync } from 'node:fs'
import { createGame, cloneGame, step } from '../src/engine.ts'
import { CAVES, W, H, buildCave } from '../src/levels.ts'
import { solve } from '../src/solver.ts'
import { encodeInputs } from '../src/solutions.ts'

const out: Record<string, string> = {}
CAVES.forEach((cave, i) => {
  if (!cave.solvable) return
  const g = createGame(W, H, buildCave(cave), cave)
  const s = solve(g, { maxMs: 120000 })
  const r = cloneGame(g)
  for (const inp of s.inputs) step(r, inp)
  if (!s.ok || r.status !== 'won') throw new Error(`"${cave.name}" çözülemedi: ${s.reason}`)
  out[i] = encodeInputs(s.inputs)
  console.log(`${cave.name}: ${s.inputs.length} tick, ${r.diamonds} elmas, ${s.ms} ms`)
})
writeFileSync(new URL('../src/solutions.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
