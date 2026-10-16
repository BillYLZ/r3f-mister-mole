// Web Audio ile sentezlenen küçük ses efektleri (dosya gerektirmez).

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = false

export function setMuted(m: boolean) {
  muted = m
  if (master) master.gain.value = m ? 0 : 0.5
}

/** Tarayıcılar sesi bir kullanıcı etkileşimiyle açmayı ister. */
export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return
    }
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.5
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak = 0.3, delay = 0) {
  if (!ctx || !master || muted) return
  const t = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  env(g, t, peak, 0.005, dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function noise(dur: number, freq: number, peak = 0.3, q = 1, sweepTo?: number) {
  if (!ctx || !master || !noiseBuf || muted) return
  const t = ctx.currentTime
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.Q.value = q
  f.frequency.setValueAtTime(freq, t)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
  const g = ctx.createGain()
  env(g, t, peak, 0.005, dur)
  s.connect(f).connect(g).connect(master)
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.05)
}

export const sfx = {
  dig: () => noise(0.07, 1800, 0.12),
  collect: () => {
    tone('triangle', 1320, 2640, 0.12, 0.2)
    tone('sine', 1980, 3000, 0.18, 0.1, 0.04)
  },
  land: () => {
    tone('sine', 140, 50, 0.18, 0.35)
    noise(0.1, 600, 0.15)
  },
  diamondLand: () => tone('triangle', 2400, 1800, 0.08, 0.08),
  push: () => noise(0.12, 400, 0.2),
  explode: () => {
    noise(0.9, 2200, 0.6, 1, 80)
    tone('sine', 90, 30, 0.6, 0.5)
  },
  magic: () => tone('triangle', 900 + Math.random() * 600, 2200, 0.25, 0.08),
  spawn: () => [0, 0.06, 0.12].forEach((d, i) => tone('square', 440 * (i + 2), 440 * (i + 2), 0.05, 0.06, d)),
  exitOpen: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.1, 0.08, i * 0.08)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f * 1.01, 0.16, 0.2, i * 0.09)),
  die: () => tone('sawtooth', 440, 55, 0.9, 0.15),
  tick: () => tone('square', 1000, 1000, 0.03, 0.05),
}
