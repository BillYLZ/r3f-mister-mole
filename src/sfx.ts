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

/** Yumuşak bozulma eğrisi: uğultuya sıcak bir vızıltı katar. */
let saberCurve: Float32Array | null = null
function softClip() {
  if (!saberCurve) {
    saberCurve = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1
      saberCurve[i] = Math.tanh(x * 2.2)
    }
  }
  return saberCurve
}

/**
 * Lazer kılıç savurma sesi (sıfırdan sentez, kayıt kullanılmaz).
 * Alçak sinüs uğultu (temel + armonikler) yumuşak bozulmadan geçer; savrulurken
 * perde bir an yükselip düşer (Doppler etkisi) ve ses kabarır; altta hafif bir
 * hava hışırtısı. Tiz cızırtı yoktur.
 */
function saberSwing() {
  if (!ctx || !master || !noiseBuf || muted) return
  saberGraph(ctx, master, noiseBuf, ctx.currentTime)
}

/** Kılıç sesini verilen ses bağlamında kurar (dosyaya kaydetmek için de kullanılır). */
export function saberGraph(ctx: BaseAudioContext, master: AudioNode, noiseBuf: AudioBuffer, t: number) {
  const dur = 0.62
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, t)
  out.gain.linearRampToValueAtTime(0.42, t + 0.05)
  out.gain.linearRampToValueAtTime(0.55, t + 0.16) // savruluşun doruğu
  out.gain.linearRampToValueAtTime(0.18, t + 0.38)
  out.gain.linearRampToValueAtTime(0, t + dur)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.7
  lp.frequency.setValueAtTime(700, t)
  lp.frequency.linearRampToValueAtTime(1500, t + 0.16)
  lp.frequency.linearRampToValueAtTime(800, t + dur)
  out.connect(lp).connect(master)

  // Uğultu: temel 92 Hz ve armonikleri, birlikte perde süpürmesi
  const hum = ctx.createGain()
  hum.gain.value = 0.5
  const shaper = ctx.createWaveShaper()
  shaper.curve = softClip() as Float32Array<ArrayBuffer>
  hum.connect(shaper).connect(out)
  const base = 92
  for (const [mult, amp, type] of [
    [1, 1, 'sine'],
    [2, 0.45, 'sine'],
    [3, 0.2, 'triangle'],
    [1.007, 0.6, 'sine'], // hafif zonklama için çok az kaydırılmış ikinci ses
  ] as const) {
    const o = ctx.createOscillator()
    o.type = type
    const f = base * mult
    o.frequency.setValueAtTime(f, t)
    o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.15) // yaklaşırken perde yükselir
    o.frequency.linearRampToValueAtTime(f * 0.88, t + 0.4) // uzaklaşırken düşer
    o.frequency.linearRampToValueAtTime(f * 0.95, t + dur)
    const g = ctx.createGain()
    g.gain.value = amp
    o.connect(g).connect(hum)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  // Hava hışırtısı: yumuşak, alçak bant gürültü
  const n = ctx.createBufferSource()
  n.buffer = noiseBuf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.8
  bp.frequency.setValueAtTime(350, t)
  bp.frequency.linearRampToValueAtTime(900, t + 0.16)
  bp.frequency.linearRampToValueAtTime(400, t + dur)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0, t)
  ng.gain.linearRampToValueAtTime(0.12, t + 0.15)
  ng.gain.linearRampToValueAtTime(0, t + dur)
  n.connect(bp).connect(ng).connect(out)
  n.start(t, Math.random() * 0.5)
  n.stop(t + dur + 0.05)
}

export const sfx = {
  saber: saberSwing,
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
