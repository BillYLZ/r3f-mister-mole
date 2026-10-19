// Sürüm 3: aynı oyun motoru, oyuncak tuğla görünümü.
// Aydınlık mor sahne, düğmeli canlı renkli tuğlalar, parlak plastik malzemeler,
// mücevher elmaslar ve kılıçlı Kara Lord figürü.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { T, TICKS_PER_SECOND, createGame, step, timeLeft, type Game, type GameEvent, type Input } from '../engine.ts'
import { CAVES, W, H, buildCave, caveSeed } from '../levels.ts'
import { useGame } from '../store.ts'
import { clearInput, takeInput } from '../input.ts'
import { sfx } from '../sfx.ts'
import { Particles } from '../Particles.ts'
import { DarkLord, type LordState } from './DarkLord.tsx'
import { BEAM_COLORS, DIRT_COLORS, PALETTE, addWave, waveOf, arrowGeometry, beamGeometry, createWaveUniforms, dirtColorIndex, findBarRuns, moonTexture, robotBody, robotHead, roundBrick, studBrick, tile } from './bricks.ts'

const TICK = 1 / TICKS_PER_SECOND
const N = W * H
const wx = (x: number) => x - (W - 1) / 2
const wy = (y: number) => (H - 1) / 2 - y
const NONE: Input = { dir: -1, snap: false }
const IDLE_BEFORE_WAVE = 2.5 // saniye
const WAVE_AMP = 0.42
const DIRT_RGB = DIRT_COLORS.map((c) => new THREE.Color(c))
const BEAM_RGB = BEAM_COLORS.map((c) => new THREE.Color(c))
const rgb = (c: THREE.Color): [number, number, number] => [c.r, c.g, c.b]

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

/** Kelebek kanadı: ince plastik plaka. */
function wingGeometry(side: 1 | -1) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(0.15 * side, 0.4, 0.48 * side, 0.42, 0.44 * side, 0.08)
  s.bezierCurveTo(0.48 * side, -0.22, 0.2 * side, -0.4, 0, -0.05)
  return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 })
}

type LayerKey = 'brick' | 'frame' | 'magic' | 'boulder' | 'robot' | 'robotHead' | 'fly' | 'wingL' | 'wingR' | 'amoeba' | 'explode'

export function SceneV3() {
  const level = useGame((s) => s.level)
  const gameKey = useGame((s) => s.gameKey)
  const { camera, size, gl } = useThree()

  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const t = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    return t
  }, [gl])
  const moons = useMemo(() => moonTexture(), [])

  const geo = useMemo(
    () => ({
      brick: studBrick(),
      tile: tile(),
      round: roundBrick(),
      robot: robotBody(),
      robotHead: robotHead(),
      wingL: wingGeometry(-1),
      wingR: wingGeometry(1),
      arrow: arrowGeometry(),
    }),
    [],
  )
  const plastic = (extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    // Cilalı ABS plastik: düşük pürüz, tam cila katmanı, belirgin yansıma
    new THREE.MeshPhysicalMaterial({
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      ior: 1.53,
      specularIntensity: 1,
      envMap: env,
      envMapIntensity: 0.7,
      ...extra,
    })
  const mat = useMemo(
    () => ({
      brick: plastic(),
      wall: plastic({ vertexColors: true }),
      frame: plastic({ color: '#6158e0', roughness: 0.4, clearcoat: 0.4 }),
      magic: plastic({ color: '#b48cff', transparent: true, opacity: 0.75, emissive: '#7b3dff', emissiveIntensity: 0.15 }),
      boulder: plastic({ color: '#6d7380', roughness: 0.35 }),
      robot: plastic({ vertexColors: true }),
      fly: plastic({ color: '#ff8a1f', emissive: '#ff5a00', emissiveIntensity: 0.9 }),
      wingL: plastic({ color: PALETTE.pink, emissive: '#ff2f8a', emissiveIntensity: 0.25 }),
      wingR: plastic({ color: PALETTE.sky, emissive: '#1f7fff', emissiveIntensity: 0.25 }),
      amoeba: plastic({ color: '#5fe03a', emissive: '#2a9a10', emissiveIntensity: 0.4 }),
      explode: plastic({ emissiveIntensity: 0.6 }),
      exit: plastic({ color: PALETTE.red }),
      arrow: plastic({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.3 }),
      inbox: new THREE.MeshPhysicalMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.3, transparent: true, opacity: 0.85 }),
    }),
    [env],
  )

  // Oyuncu durunca çıkıştan yayılan dalga: tüm tuğla malzemelerine eklenir
  useMemo(() => {
    const u = createWaveUniforms()
    // Sabit parçalar (kirişler, çerçeve, giriş ve çıkış) dalgaya katılmaz
    const still = new Set<THREE.Material>([mat.wall, mat.frame, mat.exit, mat.arrow, mat.inbox])
    for (const m of Object.values(mat)) if (!still.has(m)) addWave(m, u)
  }, [mat])

  const layers = useRef<Partial<Record<LayerKey, THREE.InstancedMesh>>>({})
  const reg = (k: LayerKey) => (m: THREE.InstancedMesh | null) => {
    if (m) layers.current[k] = m
  }

  const particles = useMemo(() => new Particles(1200), [])
  const lord = useRef<LordState>({ x: 0, y: 0, dir: 1, moving: false, visible: false, strikeAt: -10 }).current
  const inboxRef = useRef<THREE.Mesh>(null!)
  const exitRef = useRef<THREE.Group>(null!)
  const arrowRef = useRef<THREE.Mesh>(null!)
  const light = useRef<THREE.DirectionalLight>(null!)
  const wallRef = useRef<THREE.Mesh>(null!)

  const sim = useRef({
    game: newGame(0),
    acc: 0,
    prev: new Map<number, number>(),
    landAt: new Map<number, number>(),
    ended: false,
    endTimer: 0,
    lastTime: -1,
    shake: 0,
    camTarget: new THREE.Vector3(0, 0, 0),
    camInit: false,
    zoom: 1,
    clock: 0,
    idle: 0,
    waveAmp: 0,
    waveTime: 0,
    wallKey: -1,
    wallCount: -1,
    wallGame: null as Game | null,
  })

  useEffect(() => {
    const s = sim.current
    s.game = newGame(level)
    s.acc = 0
    s.prev.clear()
    s.landAt.clear()
    s.ended = false
    s.endTimer = 0
    s.camInit = false
    s.idle = 0
    s.waveAmp = 0
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

  useEffect(() => {
    const l = light.current
    l.parent?.add(l.target)
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
    for (const e of events) {
      switch (e.k) {
        case 'dig':
          play('dig', sfx.dig)
          // kazılan tuğla kendi renginde parçalara ayrılır
          particles.burst(wx(e.x), wy(e.y), 0.5, 10, rgb(DIRT_RGB[dirtColorIndex(e.x, e.y)]), { speed: 3, life: 0.7, size: 0.13, gravity: 12 })
          break
        case 'collect':
          // Kara Lord robota lazer kılıçla vurur: kılıç sesi, parlama, kıvılcım
          play('collect', sfx.saber)
          lord.strikeAt = performance.now() / 1000
          particles.burst(wx(e.x), wy(e.y), 0.6, 18, [5, 0.6, 0.3], { speed: 5, life: 0.5, size: 0.04, gravity: 4 })
          // robot toplanınca beyaz-mavi parçalar
          particles.burst(wx(e.x), wy(e.y), 0.5, 14, [2.2, 2.3, 2.6], { speed: 4, life: 0.8, size: 0.07, gravity: -2 })
          particles.burst(wx(e.x), wy(e.y), 0.5, 14, [0.4, 1.2, 3.4], { speed: 4, life: 0.8, size: 0.07, gravity: -2 })
          if (live) vibrate(10)
          break
        case 'land': {
          const c = g.cells[e.y * W + e.x]
          if (c.id) s.landAt.set(c.id, s.clock)
          if (e.t === T.BOULDER) {
            play('land', sfx.land)
            s.shake = Math.max(s.shake, 0.06)
          } else play('dland', sfx.diamondLand)
          break
        }
        case 'push':
          play('push', sfx.push)
          break
        case 'explode': {
          play('explode', sfx.explode)
          // rengarenk tuğla parçaları saçılır
          for (const c of [PALETTE.red, PALETTE.yellow, PALETTE.blue, PALETTE.green, PALETTE.pink, PALETTE.sky]) {
            const k = new THREE.Color(c)
            particles.burst(wx(e.x), wy(e.y), 0.6, 14, rgb(k), { speed: 8, life: 1.3, size: 0.16, gravity: 12, spread: 1.6 })
          }
          if (e.toDiamond) particles.burst(wx(e.x), wy(e.y), 0.6, 30, [0.8, 2.6, 3.4], { speed: 5, life: 1, size: 0.06, gravity: 0 })
          s.shake = 0.45
          if (live) vibrate(100)
          break
        }
        case 'magic':
          play('magic', sfx.magic)
          particles.burst(wx(e.x), wy(e.y), 0.5, 10, [1.6, 0.9, 3], { speed: 2, life: 0.6, size: 0.06, gravity: -1 })
          break
        case 'exitOpen':
          play('exitOpen', sfx.exitOpen)
          break
        case 'spawn':
          play('spawn', sfx.spawn)
          particles.burst(wx(e.x), wy(e.y), 0.5, 30, [2.5, 2.5, 2.5], { speed: 3, life: 0.6, size: 0.06, gravity: 0 })
          break
        case 'win':
          play('win', sfx.win)
          break
        case 'die':
        case 'timeout':
          play('die', sfx.die)
          break
      }
    }
  }

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = sim.current
    s.clock += dt
    const t = clock.elapsedTime
    const st = useGame.getState()
    const g = s.game
    const live = st.screen === 'playing'
    const running = (live || st.screen === 'title') && !st.paused

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
        const events = step(g, live ? takeInput() : NONE)
        handleEvents(events, live)
        const tl = timeLeft(g)
        if (live && g.status === 'playing' && g.player.spawned && tl !== s.lastTime && tl <= 10 && tl > 0) sfx.tick()
        s.lastTime = tl
        if (before === 'playing' && g.status !== 'playing') {
          s.ended = true
          s.endTimer = g.status === 'won' ? 1.2 : 2.2
        }
        if (live)
          st.setHud({ diamonds: g.diamonds, needed: g.settings.needed, value: g.exitOpen ? g.settings.extra : g.settings.value, time: tl, score: st.totalScore + g.score, exitOpen: g.exitOpen })
      }
      if (live && s.ended && s.endTimer > 0) {
        s.endTimer -= dt
        if (s.endTimer <= 0 && g.status !== 'playing') st.finish(g.status, g.score)
      }
    }
    const alpha = running ? Math.min(s.acc / TICK, 1) : 1

    // --- Çizim ---
    const L = layers.current
    const counts: Record<LayerKey, number> = { brick: 0, frame: 0, magic: 0, boulder: 0, robot: 0, robotHead: 0, fly: 0, wingL: 0, wingR: 0, amoeba: 0, explode: 0 }
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
      const a = alpha * alpha * (3 - 2 * alpha)
      return [wx(px + (x - px) * a), wy(py + (y - py) * a)]
    }
    const bounce = (id: number) => {
      const lt = s.landAt.get(id)
      if (lt === undefined) return 0
      const k = s.clock - lt
      if (k > 0.4) {
        s.landAt.delete(id)
        return 0
      }
      return Math.abs(Math.sin(k * 16)) * Math.exp(-k * 9) * 0.12
    }

    let wallKey = 0
    let wallCount = 0
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
        case T.DIRT:
          dummy.position.set(wx(x), wy(y), 0)
          put('brick', DIRT_RGB[dirtColorIndex(x, y)])
          break
        case T.WALL:
          // duvarlar aşağıda tek parça çubuklar olarak çizilir
          wallKey = (Math.imul(wallKey, 31) + i) | 0
          wallCount++
          break
        case T.STEEL:
        case T.EXIT:
          if (c.t === T.EXIT) {
            exitAt = i
            if (g.exitOpen) break
          }
          dummy.position.set(wx(x), wy(y), -0.05)
          put('frame', color.setScalar(0.9 + h * 0.15))
          break
        case T.MAGIC:
          dummy.position.set(wx(x), wy(y), 0)
          put('magic')
          break
        case T.BOULDER: {
          const [px, py] = lerpPos(c.id, i)
          dummy.position.set(px, py + bounce(c.id), 0.02)
          // yuvarlanırken düğme dönerek konum değiştirir
          dummy.rotation.set(Math.sin(-px / 0.44) * 0.5, Math.cos(-px / 0.44) * 0.5 - 0.5, 0)
          put('boulder', color.setScalar(0.85 + hash(c.id) * 0.3))
          break
        }
        case T.DIAMOND: {
          // Küçük robot: gövde hafifçe sallanır, kubbe kafa sağa sola bakar
          const [px, py] = lerpPos(c.id, i)
          const by = py + bounce(c.id) + 0.04
          const sway = Math.sin(t * 2.2 + c.id) * 0.12
          dummy.position.set(px, by, 0.15)
          dummy.rotation.set(0, Math.sin(t * 0.7 + c.id) * 0.25, sway)
          put('robot')
          dummy.rotation.order = 'ZYX'
          dummy.position.set(px - Math.sin(sway) * 0.14, by + Math.cos(sway) * 0.14, 0.15)
          dummy.rotation.set(0, Math.sin(t * 1.3 + c.id * 2.1) * 1.1, sway)
          put('robotHead')
          dummy.rotation.order = 'XYZ'
          break
        }
        case T.FIREFLY: {
          const [px, py] = lerpPos(c.id, i)
          dummy.position.set(px, py + Math.sin(t * 9 + c.id) * 0.05, 0.15)
          dummy.rotation.set(0, 0, t * 5 + c.id)
          dummy.scale.setScalar(0.72 + Math.sin(t * 12 + c.id) * 0.06)
          put('fly')
          break
        }
        case T.BUTTERFLY: {
          const [px, py] = lerpPos(c.id, i)
          const flap = Math.sin(t * 14 + c.id) * 1.05
          dummy.position.set(px, py + Math.sin(t * 7 + c.id) * 0.05, 0.2)
          dummy.rotation.set(0, flap, 0)
          put('wingL')
          dummy.rotation.set(0, -flap, 0)
          put('wingR')
          break
        }
        case T.AMOEBA: {
          dummy.position.set(wx(x), wy(y), 0)
          const pulse = 0.94 + Math.sin(t * 4 + h * 20) * 0.06
          dummy.scale.set(pulse, pulse, 1)
          put('amoeba')
          break
        }
        case T.EXPLODE: {
          const p = (c.stage + alpha) / 5
          dummy.position.set(wx(x), wy(y), 0.3 + p)
          dummy.rotation.set(h * 6 + t * 6, h * 3 + t * 5, h * 9)
          dummy.scale.setScalar(Math.max(0.01, 0.8 * (1 - p)))
          put('explode', DIRT_RGB[Math.floor(h * DIRT_RGB.length)])
          break
        }
        case T.INBOX:
          inboxAt = i
          break
        case T.PLAYER: {
          playerSeen = true
          const [px, py] = lerpPos(c.id, i)
          const p = s.prev.get(c.id)
          lord.moving = running && p !== undefined && p !== i
          lord.x = px
          lord.y = py
          lord.dir = c.dir
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
    // Duvar düzeni değiştiyse (yeni mağara ya da patlama) çubukları yeniden kur
    if (wallKey !== s.wallKey || wallCount !== s.wallCount || g !== s.wallGame) {
      s.wallKey = wallKey
      s.wallCount = wallCount
      s.wallGame = g
      const runs = findBarRuns((x, y) => g.cells[y * W + x].t === T.WALL, W, H)
      const old = wallRef.current.geometry
      wallRef.current.geometry = beamGeometry(
        runs,
        (x, y) => [wx(x), wy(y)],
        (r) => BEAM_RGB[Math.floor(hash(r.x * 57 + r.y * 13 + r.len) * BEAM_RGB.length)],
      )
      old.dispose()
    }
    lord.visible = playerSeen
    if (!playerSeen) lord.moving = false

    // Hareketsizlik sayacı: oyuncu 2,5 sn durursa dalga yumuşakça başlar,
    // hareket edince yumuşakça söner
    s.idle = lord.moving ? 0 : s.idle + dt
    const waveOn = s.idle > IDLE_BEFORE_WAVE && !st.paused
    s.waveAmp = THREE.MathUtils.damp(s.waveAmp, waveOn ? WAVE_AMP : 0, waveOn ? 1.6 : 5, dt)
    if (s.waveAmp > 0.001) s.waveTime += dt
    else s.waveTime = 0
    const wave = waveOf(mat.brick)
    wave.uWaveAmp.value = s.waveAmp
    wave.uWaveTime.value = s.waveTime
    if (exitAt >= 0) wave.uWaveCenter.value.set(wx(exitAt % W), wy(Math.floor(exitAt / W)))
    if (playerSeen) wave.uWavePlayer.value.set(lord.x, lord.y)
    else wave.uWavePlayer.value.set(1e4, 1e4)

    mat.magic.emissiveIntensity = g.magic === 'active' ? 0.8 + Math.sin(t * 12) * 0.5 : 0.15

    const inbox = inboxRef.current
    inbox.visible = inboxAt >= 0
    if (inboxAt >= 0) {
      const x = inboxAt % W
      inbox.position.set(wx(x), wy((inboxAt - x) / W), 0)
      mat.inbox.emissiveIntensity = Math.sin(t * 14) > 0 ? 1.4 : 0.2
    }
    // Açık çıkış: beyaz oklu kırmızı karo (oku zıplar)
    const ex = exitRef.current
    ex.visible = exitAt >= 0 && g.exitOpen
    if (exitAt >= 0 && g.exitOpen) {
      const x = exitAt % W
      ex.position.set(wx(x), wy((exitAt - x) / W), 0)
      arrowRef.current.position.y = Math.abs(Math.sin(t * 5)) * 0.08
      mat.exit.emissive.set(PALETTE.red)
      mat.exit.emissiveIntensity = 0.3 + Math.sin(t * 6) * 0.25
    }

    particles.update(dt)

    // --- Kamera ---
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const fitDist = Math.max((H / 2 + 1) / tanHalf, (W / 2 + 1) / (tanHalf * aspect))
    const overview = st.overview || st.screen === 'title'
    const dist = overview ? fitDist : Math.min(14 * s.zoom, fitDist)
    const target = new THREE.Vector3()
    if (playerSeen) target.set(lord.x, lord.y, 0)
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
    s.camTarget.x = THREE.MathUtils.damp(s.camTarget.x, target.x, 4, dt)
    s.camTarget.y = THREE.MathUtils.damp(s.camTarget.y, target.y, 4, dt)
    s.shake *= Math.exp(-dt * 7)
    const sx = (Math.random() - 0.5) * s.shake
    const sy = (Math.random() - 0.5) * s.shake
    const drift = st.screen === 'title' ? Math.sin(t * 0.2) * 3 : 0
    const tilt = overview ? 0.1 : 0.2
    cam.position.set(s.camTarget.x + sx + drift, s.camTarget.y + sy + dist * tilt, dist)
    cam.lookAt(s.camTarget.x + sx * 0.5, s.camTarget.y + sy * 0.5, 0)

    const l = light.current
    l.position.set(s.camTarget.x - 6, s.camTarget.y + 10, 16)
    l.target.position.set(s.camTarget.x, s.camTarget.y, 0)
    const sc = l.shadow.camera
    const ext = Math.max(vw, vh) + 3
    if (sc.right !== ext) {
      sc.left = -ext
      sc.right = ext
      sc.top = ext
      sc.bottom = -ext
      sc.updateProjectionMatrix()
    }
  })

  return (
    <>
      <color attach="background" args={['#24206a']} />
      <ambientLight intensity={0.3} color="#c9c4ff" />
      <hemisphereLight args={['#ffffff', '#4a3fb0', 0.6]} />
      <directionalLight
        ref={light}
        intensity={2.8}
        color="#fff6ea"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />

      {/* Hilal desenli mor arka plan */}
      <mesh position={[0, 0, -0.45]} receiveShadow>
        <planeGeometry args={[W + 40, H + 40]} />
        <meshStandardMaterial map={moons} roughness={0.8} />
      </mesh>

      <instancedMesh ref={reg('brick')} args={[geo.brick, mat.brick, N]} castShadow receiveShadow frustumCulled={false} />
      <mesh ref={wallRef} material={mat.wall} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('frame')} args={[geo.tile, mat.frame, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('magic')} args={[geo.brick, mat.magic, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('boulder')} args={[geo.round, mat.boulder, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('robot')} args={[geo.robot, mat.robot, N]} castShadow frustumCulled={false} />
      <instancedMesh ref={reg('robotHead')} args={[geo.robotHead, mat.robot, N]} castShadow frustumCulled={false} />
      <instancedMesh ref={reg('fly')} args={[geo.round, mat.fly, 64]} castShadow frustumCulled={false} />
      <instancedMesh ref={reg('wingL')} args={[geo.wingL, mat.wingL, 64]} castShadow frustumCulled={false} />
      <instancedMesh ref={reg('wingR')} args={[geo.wingR, mat.wingR, 64]} castShadow frustumCulled={false} />
      <instancedMesh ref={reg('amoeba')} args={[geo.brick, mat.amoeba, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('explode')} args={[geo.brick, mat.explode, N]} frustumCulled={false} />
      <primitive object={particles.mesh} />

      <mesh ref={inboxRef} geometry={geo.tile} material={mat.inbox} />
      <group ref={exitRef}>
        <mesh geometry={geo.tile} material={mat.exit} castShadow />
        <mesh ref={arrowRef} geometry={geo.arrow} material={mat.arrow} position={[0, 0, 0.45]} />
      </group>

      <DarkLord state={lord} />
    </>
  )
}
