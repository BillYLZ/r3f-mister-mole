// Klavye ve dokunmatik girdi. Son basılan yön önceliklidir; iki tick arasında
// basılıp bırakılan tuş da bir kez işlenir (mandal).
import type { Input } from './engine.ts'

const held: number[] = []
let latched = -1
let snapHeld = false

let pressListener: (() => void) | null = null
/** Oyuncu bir yön tuşuna bastığında haber al (otomatik pilotu durdurmak için). */
export function setPressListener(f: () => void) {
  pressListener = f
}

export function press(dir: number) {
  if (!held.includes(dir)) held.push(dir)
  latched = dir
  pressListener?.()
}
export function release(dir: number) {
  const i = held.indexOf(dir)
  if (i >= 0) held.splice(i, 1)
}
export function setSnap(on: boolean) {
  snapHeld = on
}
export function clearInput() {
  held.length = 0
  latched = -1
  snapHeld = false
}

/** Bir tick için girdiyi okur (mandalı tüketir). */
export function takeInput(): Input {
  const dir = held.length ? held[held.length - 1] : latched
  latched = -1
  return { dir, snap: snapHeld }
}

const KEYS: Record<string, number> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
}

export function keyDir(code: string): number | undefined {
  return KEYS[code]
}
