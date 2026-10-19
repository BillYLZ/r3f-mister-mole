// Sürüm 2: aynı oyun motoru, modern görünüm.
// Karanlık mağara; ışığı köstebeğin kafa lambası, elmaslar, ateşböcekleri ve
// patlamalar verir. Organik toprak, bazalt sütunlar, kesilmiş mücevherler,
// toz zerreleri, şok dalgaları, ağır çekim ve esneyip sıkışan nesneler.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DX, T, TICKS_PER_SECOND, createGame, diamondsLeft, step, timeLeft, type Game, type GameEvent, type Input } from '../engine.ts'
import { CAVES, W, H, buildCave, caveSeed } from '../levels.ts'
import { useGame } from '../store.ts'
import { clearInput, takeInput } from '../input.ts'
import { autoInput, setLiveGame } from '../autopilot.ts'
import { SolutionPath } from '../SolutionPath.tsx'
import { sfx } from '../sfx.ts'
import { makeTextures } from '../textures.ts'
import { Particles } from '../Particles.ts'
import { Mole, type MoleState } from './Mole.tsx'

const TICK = 1 / TICKS_PER_SECOND
const N = W * H
const wx = (x: number) => x - (W - 1) / 2
const wy = (y: number) => (H - 1) / 2 - y
const NONE: Input = { dir: -1, snap: false }
const GLOW_LIGHTS = 10
const SHOCKWAVES = 8
const DUST = 700

function newGame(level: number): Game {
  const cave = CAVES[level]
  const seed = caveSeed(level, useGame.getState().seed)
  return createGame(W, H, buildCave(cave, seed), { ...cave, seed })
}

function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // titreşim desteklenmiyorsa sessizce geç
  }
}

/** Yuvarlatılmış, pürüzlü topak: yan yana dizilince birbirine kaynayan organik toprak. */
function lumpGeometry(size: number, roundness: number, roughness: number, seed: number) {
  const g = new THREE.SphereGeometry(1, 16, 12)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize()
    const r = Math.pow(Math.abs(v.x) ** roundness + Math.abs(v.y) ** roundness + Math.abs(v.z) ** roundness, -1 / roundness)
    const n =
      Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 2) * Math.sin(v.z * 6.7 + seed * 3) +
      0.5 * Math.sin(v.x * 11.3 + v.y * 9.1 + seed) * Math.sin(v.z * 10.7 - seed)
    v.multiplyScalar(r * size * (1 + n * roughness))
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

function rockGeometry() {
  const g = new THREE.DodecahedronGeometry(0.46, 2)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = Math.sin(v.x * 9.7 + v.y * 6.1) * Math.sin(v.z * 8.3 - v.y * 4.4)
    v.multiplyScalar(0.92 + n * 0.09)
    p.setXYZ(i, v.x, v.y * 0.92, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** Pırlanta kesimi: taç (üst) + köşk (alt) bölümü. */
function gemGeometry() {
  const crown = new THREE.CylinderGeometry(0.17, 0.32, 0.14, 8, 1).translate(0, 0.07, 0)
  const pavilion = new THREE.CylinderGeometry(0.32, 0.0, 0.34, 8, 1).translate(0, -0.17, 0)
  const g = mergeGeometries([crown.toNonIndexed(), pavilion.toNonIndexed()])!
  g.computeVertexNormals()
  return g
}

function wingGeometry(side: 1 | -1) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(0.15 * side, 0.4, 0.5 * side, 0.45, 0.46 * side, 0.08)
  s.bezierCurveTo(0.5 * side, -0.22, 0.2 * side, -0.42, 0, -0.05)
  return new THREE.ShapeGeometry(s, 10)
}

function dotTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

type LayerKey = 'dirt' | 'wall' | 'basalt' | 'magic' | 'boulder' | 'diamond' | 'fly' | 'flyRing' | 'wingL' | 'wingR' | 'amoeba' | 'explode'

interface Glow {
  x: number
  y: number
  r: number
  g: number
  b: number
  i: number
  d: number
  prio: number
}

export function SceneV2() {
  const level = useGame((s) => s.level)
  const gameKey = useGame((s) => s.gameKey)
  const { camera, size, gl } = useThree()

  const tex = useMemo(() => makeTextures(), [])
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const t = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    return t
  }, [gl])

  const geo = useMemo(
    () => ({
      dirt: lumpGeometry(0.6, 3.2, 0.07, 1.7),
      basalt: new THREE.CylinderGeometry(0.58, 0.58, 1, 6, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 6),
      brick: new RoundedBoxGeometry(1, 1, 1, 3, 0.1),
      rock: rockGeometry(),
      gem: gemGeometry(),
      fly: new THREE.IcosahedronGeometry(0.16, 2),
      flyRing: new THREE.TorusGeometry(0.3, 0.025, 6, 32),
      wingL: wingGeometry(-1),
      wingR: wingGeometry(1),
      amoeba: lumpGeometry(0.55, 2.2, 0.16, 4.2),
      explode: new THREE.IcosahedronGeometry(0.5, 1),
    }),
    [],
  )
  const mat = useMemo(
    () => ({
      dirt: new THREE.MeshStandardMaterial({ map: tex.dirt, bumpMap: tex.dirt, bumpScale: 4, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ map: tex.brick, bumpMap: tex.brick, bumpScale: 3, roughness: 0.8 }),
      basalt: new THREE.MeshStandardMaterial({ color: '#2a2c33', roughness: 0.5, metalness: 0.3, flatShading: true, envMap: env, envMapIntensity: 0.08 }),
      magic: new THREE.MeshStandardMaterial({ map: tex.brick, color: '#9a8cff', roughness: 0.5, emissive: '#7b4dff', emissiveIntensity: 0.1 }),
      boulder: new THREE.MeshStandardMaterial({ roughness: 0.85, bumpMap: tex.rockBump, bumpScale: 3, flatShading: true }),
      diamond: new THREE.MeshPhysicalMaterial({
        color: '#6fdcff',
        emissive: '#0a7fd0',
        emissiveIntensity: 0.45,
        roughness: 0,
        metalness: 0,
        clearcoat: 1,
        iridescence: 1,
        iridescenceIOR: 1.7,
        envMap: env,
        envMapIntensity: 1.4,
        flatShading: true,
      }),
      fly: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 0.5), toneMapped: false }),
      flyRing: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.2), toneMapped: false }),
      wing: new THREE.MeshStandardMaterial({ color: '#8fc0ff', emissive: '#7a5cff', emissiveIntensity: 3, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.9 }),
      amoeba: new THREE.MeshPhysicalMaterial({ color: '#5be05a', emissive: '#1f8f1c', emissiveIntensity: 0.9, roughness: 0.15, clearcoat: 1, envMap: env, envMapIntensity: 0.8 }),
      explode: new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      ring: new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    }),
    [tex, env],
  )

  const layers = useRef<Partial<Record<LayerKey, THREE.InstancedMesh>>>({})
  const reg = (k: LayerKey) => (m: THREE.InstancedMesh | null) => {
    if (m) layers.current[k] = m
  }

  const particles = useMemo(() => new Particles(1200), [])
  const mole = useRef<MoleState>({ x: 0, y: 0, dir: 1, moving: false, visible: false }).current
  const inboxRef = useRef<THREE.Group>(null!)
  const exitRef = useRef<THREE.Group>(null!)
  const exitGlow = useRef<THREE.MeshBasicMaterial>(null!)
  const glowLights = useRef<THREE.PointLight[]>([])

  // Şok dalgası halkaları (havuz)
  const waves = useMemo(
    () =>
      Array.from({ length: SHOCKWAVES }, () => {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), mat.ring.clone())
        m.visible = false
        return { mesh: m, age: 1, life: 0.6, grow: 8 }
      }),
    [mat],
  )
  const nextWave = useRef(0)
  const wave = (x: number, y: number, color: [number, number, number], life = 0.6, grow = 8) => {
    const w = waves[nextWave.current]
    nextWave.current = (nextWave.current + 1) % SHOCKWAVES
    w.mesh.position.set(x, y, 0.6)
    ;(w.mesh.material as THREE.MeshBasicMaterial).color.setRGB(...color)
    w.age = 0
    w.life = life
    w.grow = grow
  }

  // Toz zerreleri
  const dust = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(DUST * 3)
    const seed = new Float32Array(DUST)
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 34
      pos[i * 3 + 1] = (Math.random() - 0.5) * 22
      pos[i * 3 + 2] = Math.random() * 3 - 0.3
      seed[i] = Math.random() * 100
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ size: 0.07, map: dotTexture(), color: '#ffdcae', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    return { pts, pos, seed }
  }, [])

  const sim = useRef({
    game: newGame(0),
    acc: 0,
    prev: new Map<number, number>(),
    landAt: new Map<number, number>(),
    ended: false,
    endTimer: 0,
    deadAt: -1,
    lastTime: -1,
    shake: 0,
    slow: 0,
    timeScale: 1,
    look: 0,
    camTarget: new THREE.Vector3(0, 0, 0),
    camInit: false,
    zoom: 1,
    clock: 0,
  })

  useEffect(() => {
    const s = sim.current
    s.game = newGame(level)
    setLiveGame(s.game)
    s.acc = 0
    s.prev.clear()
    s.landAt.clear()
    s.ended = false
    s.endTimer = 0
    s.deadAt = -1
    s.camInit = false
    s.slow = 0
    s.timeScale = 1
    clearInput()
  }, [level, gameKey])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const s = sim.current
      s.zoom = THREE.MathUtils.clamp(s.zoom * Math.exp(e.deltaY * 0.001), 0.55, 2.2)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  function handleEvents(events: GameEvent[], live: boolean) {
    const played = new Set<string>()
    const play = (k: string, f: () => void) => {
      if (live && !played.has(k)) {
        played.add(k)
        f()
      }
    }
    const s = sim.current
    const g = s.game
    const near = (x: number, y: number) => Math.abs(x - g.player.x) + Math.abs(y - g.player.y) < 6
    for (const e of events) {
      switch (e.k) {
        case 'dig':
          play('dig', sfx.dig)
          particles.burst(wx(e.x), wy(e.y), 0.5, 12, [0.28, 0.17, 0.09], { speed: 2.6, life: 0.7, size: 0.09, gravity: 10 })
          break
        case 'collect':
          play('collect', sfx.collect)
          particles.burst(wx(e.x), wy(e.y), 0.5, 30, [0.8, 2.8, 4], { speed: 4.5, life: 0.9, size: 0.05, gravity: -3 })
          wave(wx(e.x), wy(e.y), [0.5, 2, 3], 0.35, 3)
          if (live) vibrate(10)
          break
        case 'land': {
          const c = g.cells[e.y * W + e.x]
          if (c.id) s.landAt.set(c.id, s.clock)
          if (e.t === T.BOULDER) {
            play('land', sfx.land)
            particles.burst(wx(e.x), wy(e.y) - 0.45, 0.5, 14, [0.16, 0.14, 0.12], { speed: 1.6, life: 1.1, size: 0.12, gravity: -0.6, spread: 0.6 })
            if (near(e.x, e.y)) {
              s.shake = Math.max(s.shake, 0.08)
              if (live) vibrate(15)
            }
          } else play('dland', sfx.diamondLand)
          break
        }
        case 'push':
          play('push', sfx.push)
          particles.burst(wx(e.x), wy(e.y) - 0.45, 0.5, 6, [0.16, 0.14, 0.12], { speed: 1, life: 0.6, size: 0.08, gravity: -0.3 })
          break
        case 'explode':
          play('explode', sfx.explode)
          particles.burst(wx(e.x), wy(e.y), 0.6, 110, e.toDiamond ? [1.2, 2, 5] : [5, 1.8, 0.35], { speed: 8, life: 1.3, size: 0.1, gravity: 5, spread: 1.8 })
          particles.burst(wx(e.x), wy(e.y), 0.6, 30, [0.12, 0.11, 0.1], { speed: 2.5, life: 1.8, size: 0.25, gravity: -0.8, spread: 2 })
          wave(wx(e.x), wy(e.y), e.toDiamond ? [1.2, 2.2, 5] : [5, 2.2, 0.6])
          s.shake = 0.6
          if (live) {
            s.slow = 0.55
            vibrate(120)
          }
          break
        case 'magic':
          play('magic', sfx.magic)
          particles.burst(wx(e.x), wy(e.y), 0.5, 16, [2, 1, 5], { speed: 2, life: 0.8, size: 0.05, gravity: -1.5 })
          break
        case 'exitOpen':
          play('exitOpen', sfx.exitOpen)
          break
        case 'spawn':
          play('spawn', sfx.spawn)
          particles.burst(wx(e.x), wy(e.y), 0.5, 40, [3, 3, 3], { speed: 3.5, life: 0.7, size: 0.05, gravity: 0 })
          wave(wx(e.x), wy(e.y), [2, 2, 2], 0.5, 4)
          break
        case 'win':
          play('win', sfx.win)
          break
        case 'die':
          play('die', sfx.die)
          s.deadAt = s.clock
          break
        case 'timeout':
          play('die', sfx.die)
          break
      }
    }
  }

  useFrame(({ clock }, rawDt) => {
    const realDt = Math.min(rawDt, 0.1)
    const s = sim.current
    // Patlamadan sonra kısa ağır çekim
    if (s.slow > 0) s.slow -= realDt
    s.timeScale = THREE.MathUtils.damp(s.timeScale, s.slow > 0 ? 0.3 : 1, s.slow > 0 ? 30 : 4, realDt)
    const dt = realDt * s.timeScale
    s.clock += dt
    const t = clock.elapsedTime
    const st = useGame.getState()
    const g = s.game
    const live = st.screen === 'playing'
    const running = (live || st.screen === 'title') && !st.paused && st.solve !== 'solving'

    // --- Simülasyon adımları (Sürüm 1 ile aynı) ---
    if (running) {
      s.acc += dt
      if (s.acc > TICK * 3) s.acc = TICK
      while (s.acc >= TICK) {
        s.acc -= TICK
        s.prev.clear()
        for (let i = 0; i < N; i++) {
          const c = g.cells[i]
          if (c.id) s.prev.set(c.id, i)
        }
        const before = g.status
        const events = step(g, live ? (autoInput() ?? takeInput()) : NONE)
        handleEvents(events, live)
        const tl = timeLeft(g)
        if (live && g.status === 'playing' && g.player.spawned && tl !== s.lastTime && tl <= 10 && tl > 0) sfx.tick()
        s.lastTime = tl
        if (before === 'playing' && g.status !== 'playing') {
          s.ended = true
          s.endTimer = g.status === 'won' ? 1.2 : 2.4
        }
        if (live)
          st.setHud({ diamonds: g.diamonds, needed: Math.max(g.settings.needed, g.diamonds + diamondsLeft(g)), value: g.exitOpen ? g.settings.extra : g.settings.value, time: tl, score: st.totalScore + g.score, exitOpen: g.exitOpen })
      }
      if (live && s.ended && s.endTimer > 0) {
        s.endTimer -= realDt
        if (s.endTimer <= 0 && g.status !== 'playing') st.finish(g.status, g.score)
      }
    }
    const alpha = running ? Math.min(s.acc / TICK, 1) : 1

    // --- Çizim ---
    const L = layers.current
    const counts: Record<LayerKey, number> = { dirt: 0, wall: 0, basalt: 0, magic: 0, boulder: 0, diamond: 0, fly: 0, flyRing: 0, wingL: 0, wingR: 0, amoeba: 0, explode: 0 }
    const put = (k: LayerKey, col?: THREE.Color) => {
      const m = L[k]
      if (!m) return
      dummy.updateMatrix()
      m.setMatrixAt(counts[k], dummy.matrix)
      if (col) m.setColorAt(counts[k], col)
      counts[k]++
    }
    const lerpPos = (id: number, i: number): [number, number] => {
      const x = i % W
      const y = (i - x) / W
      const p = s.prev.get(id)
      if (p === undefined || p === i) return [wx(x), wy(y)]
      const px = p % W
      const py = (p - px) / W
      if (Math.abs(px - x) + Math.abs(py - y) > 1) return [wx(x), wy(y)]
      // yumuşak başlayıp biten hareket
      const a = alpha * alpha * (3 - 2 * alpha)
      return [wx(px + (x - px) * a), wy(py + (y - py) * a)]
    }
    const squash = (id: number) => {
      const lt = s.landAt.get(id)
      if (lt === undefined) return 0
      const k = s.clock - lt
      if (k > 0.5) {
        s.landAt.delete(id)
        return 0
      }
      return Math.exp(-k * 10) * Math.cos(k * 28) * 0.22
    }

    const glows: Glow[] = []
    const ct = s.camTarget
    const addGlow = (x: number, y: number, r: number, gg: number, b: number, i: number, d: number, prio = 0) => {
      const dd = (x - ct.x) ** 2 + (y - ct.y) ** 2
      if (dd < 400) glows.push({ x, y, r, g: gg, b, i, d, prio: dd - prio })
    }

    let playerSeen = false
    let inboxAt = -1
    let exitAt = -1
    for (let i = 0; i < N; i++) {
      const c = g.cells[i]
      const x = i % W
      const y = (i - x) / W
      const h = hash(i)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      switch (c.t) {
        case T.DIRT: {
          dummy.position.set(wx(x), wy(y), -0.12 + h * 0.08)
          dummy.rotation.set(Math.floor(h * 2) * Math.PI, 0, Math.floor(hash(i + 9) * 4) * (Math.PI / 2))
          const k = 0.95 + h * 0.1
          dummy.scale.set(k, k, 0.85)
          put('dirt', color.setHSL(0.07 + h * 0.025, 0.4, 0.42 + hash(i + 3) * 0.12))
          break
        }
        case T.WALL:
          dummy.position.set(wx(x), wy(y), 0)
          put('wall', color.setRGB(0.75 + h * 0.1, 0.72 + h * 0.08, 0.7 + h * 0.08))
          break
        case T.STEEL:
        case T.EXIT:
          if (c.t === T.EXIT) {
            exitAt = i
            if (g.exitOpen) break
          }
          dummy.position.set(wx(x), wy(y), (h - 0.5) * 0.25)
          dummy.scale.set(1, 1, 1 + h * 0.3)
          put('basalt', color.setScalar(0.85 + h * 0.3))
          break
        case T.MAGIC:
          dummy.position.set(wx(x), wy(y), 0)
          put('magic')
          if (g.magic === 'active' && (x + y) % 3 === 0) addGlow(wx(x), wy(y), 0.6, 0.35, 1, 1.2, 3)
          break
        case T.BOULDER: {
          const [px, py] = lerpPos(c.id, i)
          const sq = squash(c.id)
          dummy.position.set(px, py - sq * 0.4, 0)
          dummy.rotation.set(hash(c.id) * 6, hash(c.id + 7) * 6, -px / 0.46)
          dummy.scale.set(1 + sq, 1 - sq, 1 + sq)
          const k = 0.3 + hash(c.id + 3) * 0.14
          put('boulder', color.setRGB(k * 1.05, k, k * 0.92))
          break
        }
        case T.DIAMOND: {
          const [px, py] = lerpPos(c.id, i)
          const sq = squash(c.id)
          dummy.position.set(px, py + Math.sin(t * 2 + c.id) * 0.03, 0.08)
          dummy.rotation.set(0.25, t * 1.4 + hash(c.id) * 6, 0)
          dummy.scale.set(1 + sq, 1 - sq, 1 + sq)
          put('diamond')
          addGlow(px, py, 0.25, 0.75, 1, 1.4, 3.2)
          break
        }
        case T.FIREFLY: {
          const [px, py] = lerpPos(c.id, i)
          const bob = Math.sin(t * 9 + c.id) * 0.05
          dummy.position.set(px, py + bob, 0.15)
          dummy.scale.setScalar(1 + Math.sin(t * 14 + c.id) * 0.15)
          put('fly')
          dummy.scale.setScalar(1)
          dummy.rotation.set(t * 3 + c.id, t * 4, 0)
          put('flyRing')
          dummy.rotation.set(-t * 2.5, t * 3 + c.id, Math.PI / 2)
          put('flyRing')
          addGlow(px, py, 1, 0.45, 0.1, 4, 4.5, 30)
          break
        }
        case T.BUTTERFLY: {
          const [px, py] = lerpPos(c.id, i)
          const flap = Math.sin(t * 16 + c.id) * 1.15
          dummy.position.set(px, py + Math.sin(t * 7 + c.id) * 0.06, 0.18)
          dummy.rotation.set(0.2, flap, 0)
          put('wingL')
          dummy.rotation.set(0.2, -flap, 0)
          put('wingR')
          addGlow(px, py, 0.55, 0.4, 1, 3, 4, 30)
          if (Math.random() < 0.05) particles.burst(px, py, 0.3, 1, [1.4, 1, 3], { speed: 0.4, life: 0.8, size: 0.04, gravity: 0.5 })
          break
        }
        case T.AMOEBA: {
          dummy.position.set(wx(x), wy(y), 0)
          const pulse = 0.95 + Math.sin(t * 3 + h * 20) * 0.08
          dummy.scale.set(pulse, pulse * (1 + Math.sin(t * 2.3 + h * 9) * 0.08), pulse)
          dummy.rotation.set(t * 0.4 + h * 5, t * 0.25, h * 4)
          put('amoeba')
          if ((x * 7 + y * 3) % 5 === 0) addGlow(wx(x), wy(y), 0.3, 1, 0.3, 1, 3)
          break
        }
        case T.EXPLODE: {
          const p = (c.stage + alpha) / 5
          dummy.position.set(wx(x), wy(y), 0.3)
          dummy.scale.setScalar(0.4 + Math.sin(Math.min(p, 1) * Math.PI) * 0.9)
          dummy.rotation.set(h * 6 + t * 4, h * 3 + t * 3, 0)
          if (c.toDiamond) color.setRGB(1.4 + (1 - p) * 3, 2 + (1 - p) * 3, 6)
          else color.setRGB(6 * (1 - p * 0.5), 2.6 * (1 - p), 0.5 * (1 - p))
          put('explode', color)
          if ((x + y) % 2 === 0) addGlow(wx(x), wy(y), c.toDiamond ? 0.4 : 1, c.toDiamond ? 0.7 : 0.5, c.toDiamond ? 1 : 0.15, 12 * (1 - p), 7, 400)
          break
        }
        case T.INBOX:
          inboxAt = i
          break
        case T.PLAYER: {
          playerSeen = true
          const [px, py] = lerpPos(c.id, i)
          const p = s.prev.get(c.id)
          mole.moving = running && p !== undefined && p !== i
          mole.x = px
          mole.y = py
          mole.dir = c.dir
          break
        }
      }
    }
    for (const k of Object.keys(counts) as LayerKey[]) {
      const m = L[k]
      if (!m) continue
      m.count = counts[k]
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    mole.visible = playerSeen
    if (!playerSeen) mole.moving = false

    mat.magic.emissiveIntensity = g.magic === 'active' ? 1 + Math.sin(t * 12) * 0.7 : 0.1

    // Giriş: dönen ışık halkası
    const inbox = inboxRef.current
    inbox.visible = inboxAt >= 0
    if (inboxAt >= 0) {
      const x = inboxAt % W
      const ix = wx(x)
      const iy = wy((inboxAt - x) / W)
      inbox.position.set(ix, iy, 0.2)
      inbox.rotation.z = t * 3
      inbox.scale.setScalar(0.8 + Math.sin(t * 10) * 0.15)
      addGlow(ix, iy, 1, 1, 1, 5, 5, 500)
    }
    // Çıkış: yeşil portal
    const ex = exitRef.current
    ex.visible = exitAt >= 0 && g.exitOpen
    if (exitAt >= 0 && g.exitOpen) {
      const x = exitAt % W
      const exx = wx(x)
      const exy = wy((exitAt - x) / W)
      ex.position.set(exx, exy, 0)
      ex.children[0].rotation.z = t * 1.2
      ex.children[1].rotation.z = -t * 2
      exitGlow.current.color.setRGB(0.3, 2.2 + Math.sin(t * 6) * 0.8, 1)
      addGlow(exx, exy, 0.3, 1, 0.55, 6, 6, 500)
    }

    // En yakın parlayan nesnelere ışık havuzunu dağıt
    glows.sort((a, b) => a.prio - b.prio)
    for (let k = 0; k < GLOW_LIGHTS; k++) {
      const l = glowLights.current[k]
      if (!l) continue
      const gl = glows[k]
      if (gl) {
        l.position.set(gl.x, gl.y, 0.9)
        l.color.setRGB(gl.r, gl.g, gl.b)
        l.intensity = gl.i
        l.distance = gl.d
      } else l.intensity = 0
    }

    // Şok dalgaları
    for (const w of waves) {
      if (w.age >= w.life) {
        w.mesh.visible = false
        continue
      }
      w.age += dt
      const k = Math.min(w.age / w.life, 1)
      w.mesh.visible = true
      w.mesh.scale.setScalar(0.2 + (1 - (1 - k) ** 3) * w.grow)
      ;(w.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9
    }

    particles.update(dt)

    // Toz zerreleri: yavaşça süzülür, kamera etrafında sarar
    {
      const { pos, seed } = dust
      for (let i = 0; i < DUST; i++) {
        const k = i * 3
        pos[k] += Math.sin(t * 0.3 + seed[i]) * 0.004
        pos[k + 1] += Math.cos(t * 0.23 + seed[i] * 1.3) * 0.003 - 0.0015
        if (pos[k] - ct.x > 17) pos[k] -= 34
        if (pos[k] - ct.x < -17) pos[k] += 34
        if (pos[k + 1] - ct.y > 11) pos[k + 1] -= 22
        if (pos[k + 1] - ct.y < -11) pos[k + 1] += 22
      }
      dust.pts.geometry.attributes.position.needsUpdate = true
    }

    // --- Kamera ---
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const fitDist = Math.max((H / 2 + 1) / tanHalf, (W / 2 + 1) / (tanHalf * aspect))
    const overview = st.overview || st.screen === 'title'
    let dist = overview ? fitDist : Math.min(14 * s.zoom, fitDist)
    // Ölünce kamera yavaşça geri çekilir
    if (!overview && s.deadAt >= 0 && g.status === 'dead') dist *= 1 + Math.min(1, (s.clock - s.deadAt) * 0.8) * 0.25
    // Hareket yönüne doğru hafif ileri bakış
    const lookGoal = mole.moving && (mole.dir === 1 || mole.dir === 3) ? DX[mole.dir] * 1.6 : 0
    s.look = THREE.MathUtils.damp(s.look, lookGoal, 2, realDt)
    const target = new THREE.Vector3()
    if (playerSeen) target.set(mole.x + s.look, mole.y, 0)
    else if (inboxAt >= 0) target.set(wx(inboxAt % W), wy(Math.floor(inboxAt / W)), 0)
    else target.copy(s.camTarget)
    if (overview) target.set(0, 0, 0)
    const vh = dist * tanHalf
    const vw = vh * aspect
    const lim = (v: number, half: number, view: number) => (view >= half ? 0 : THREE.MathUtils.clamp(v, -half + view, half - view))
    target.x = lim(target.x, W / 2 + 0.5, vw)
    target.y = lim(target.y, H / 2 + 0.5, vh)
    if (!s.camInit) {
      s.camTarget.copy(target)
      s.camInit = true
    }
    s.camTarget.x = THREE.MathUtils.damp(s.camTarget.x, target.x, 3.5, realDt)
    s.camTarget.y = THREE.MathUtils.damp(s.camTarget.y, target.y, 3.5, realDt)
    s.shake *= Math.exp(-realDt * 6)
    const sx = (Math.random() - 0.5) * s.shake
    const sy = (Math.random() - 0.5) * s.shake
    const drift = st.screen === 'title' ? Math.sin(t * 0.2) * 3 : Math.sin(t * 0.31) * 0.15
    const tilt = overview ? 0.14 : 0.24
    cam.position.set(s.camTarget.x + sx + drift, s.camTarget.y + sy + dist * tilt, dist)
    cam.lookAt(s.camTarget.x + sx * 0.5, s.camTarget.y + sy * 0.5, 0)
  })

  return (
    <>
      <color attach="background" args={['#020203']} />
      <ambientLight intensity={0.07} color="#8a9ad0" />
      <hemisphereLight args={['#4a5a9a', '#1a0f08', 0.14]} />
      <directionalLight position={[-10, 14, 12]} intensity={0.22} color="#9fb0ff" />
      {Array.from({ length: GLOW_LIGHTS }, (_, k) => (
        <pointLight key={k} ref={(l) => void (l && (glowLights.current[k] = l))} intensity={0} distance={4} decay={1.6} />
      ))}

      {/* Mağara arka duvarı */}
      <mesh position={[0, 0, -0.55]} receiveShadow>
        <planeGeometry args={[W + 40, H + 40]} />
        <meshStandardMaterial map={tex.rock} bumpMap={tex.rockBump} bumpScale={4} color="#8a7a6a" roughness={1} />
      </mesh>

      <instancedMesh ref={reg('dirt')} args={[geo.dirt, mat.dirt, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('wall')} args={[geo.brick, mat.wall, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('basalt')} args={[geo.basalt, mat.basalt, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('magic')} args={[geo.brick, mat.magic, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('boulder')} args={[geo.rock, mat.boulder, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('diamond')} args={[geo.gem, mat.diamond, N]} castShadow frustumCulled={false} />
      <instancedMesh ref={reg('fly')} args={[geo.fly, mat.fly, 64]} frustumCulled={false} />
      <instancedMesh ref={reg('flyRing')} args={[geo.flyRing, mat.flyRing, 128]} frustumCulled={false} />
      <instancedMesh ref={reg('wingL')} args={[geo.wingL, mat.wing, 64]} frustumCulled={false} />
      <instancedMesh ref={reg('wingR')} args={[geo.wingR, mat.wing, 64]} frustumCulled={false} />
      <instancedMesh ref={reg('amoeba')} args={[geo.amoeba, mat.amoeba, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('explode')} args={[geo.explode, mat.explode, N]} frustumCulled={false} />
      <primitive object={particles.mesh} />
      <primitive object={dust.pts} />
      {waves.map((w, k) => (
        <primitive key={k} object={w.mesh} />
      ))}

      <group ref={inboxRef}>
        <mesh>
          <torusGeometry args={[0.36, 0.04, 8, 40, Math.PI * 1.5]} />
          <meshBasicMaterial color={new THREE.Color(4, 4, 4)} toneMapped={false} />
        </mesh>
      </group>
      <group ref={exitRef}>
        <mesh>
          <torusGeometry args={[0.42, 0.06, 10, 48]} />
          <meshStandardMaterial color="#9affc8" emissive="#20ff90" emissiveIntensity={3} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.1]}>
          <torusGeometry args={[0.28, 0.03, 8, 32, Math.PI * 1.4]} />
          <meshBasicMaterial color={new THREE.Color(1, 4, 2)} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.3]}>
          <circleGeometry args={[0.4, 32]} />
          <meshBasicMaterial ref={exitGlow} toneMapped={false} />
        </mesh>
      </group>

      <Mole state={mole} />
      <SolutionPath color={[4, 2.6, 0.6]} />
    </>
  )
}
