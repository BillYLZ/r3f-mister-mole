// Önceden hesaplanmış çözümler (scripts/make-solutions.ts üretir): düğmeye
// mağaranın başında basılınca çözüm aranmadan anında kullanılır.
import type { Input } from './engine.ts'

const DIRS = 'urdl'

export function encodeInputs(inputs: Input[]): string {
  return inputs.map((i) => (i.dir < 0 ? '.' : i.snap ? DIRS[i.dir].toUpperCase() : DIRS[i.dir])).join('')
}

export function decodeInputs(s: string): Input[] {
  return [...s].map((ch) => (ch === '.' ? { dir: -1, snap: false } : { dir: DIRS.indexOf(ch.toLowerCase()), snap: ch !== ch.toLowerCase() }))
}
