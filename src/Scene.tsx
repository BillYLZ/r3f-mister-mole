// Mağaranın 3B görünümü: motoru sabit adımlarla çalıştırır, hareketli nesneleri
// iki tick arasında yumuşakça kaydırır, olaylardan ses ve parçacık üretir.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { T, TICKS_PER_SECOND, createGame, step, timeLeft, type Game, type GameEvent, type Input } from './engine.ts'
import { CAVES, W, H, buildCave, caveSeed } from './levels.ts'
import { useGame } from './store.ts'
import { clearInput, takeInput } from './input.ts'
import { autoInput, setLiveGame } from './autopilot.ts'
import { SolutionPath } from './SolutionPath.tsx'
import { sfx } from './sfx.ts'
import { makeTextures } from './textures.ts'
import { Particles } from './Particles.ts'
import { Miner, type MinerState } from './Miner.tsx'

const TICK = 1 / TICKS_PER_SECOND
const N = W * H
const wx = (x: number) => x - (W - 1) / 2
const wy = (y: number) => (H - 1) / 2 - y
const NONE: Input = { dir: -1, snap: false }

function newGame(level: number): Game {
  const cave = CAVES[level]
  const seed = caveSeed(level, useGame.getState().seed)
  return createGame(W, H, buildCave(cave, seed), { ...cave, seed })
}

// Hücre konumundan sabit, küçük rastgele değer (renk/döndürme çeşitliliği için)
function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Pürüzlü kaya: köşeleri konuma bağlı olarak içeri/dışarı itilmiş dodekahedron. */
function rockGeometry() {
  const g = new THREE.DodecahedronGeometry(0.46, 1)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453
    const k = 0.86 + (n - Math.floor(n)) * 0.2
    v.multiplyScalar(k)
    p.setXYZ(i, v.x, v.y * 0.94, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** Kelebek kanadı (tek taraf; diğeri aynalanır). */
function wingGeometry(side: 1 | -1) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(0.15 * side, 0.35, 0.45 * side, 0.4, 0.42 * side, 0.08)
  s.bezierCurveTo(0.45 * side, -0.2, 0.2 * side, -0.38, 0, -0.05)
  const g = new THREE.ShapeGeometry(s, 8)
  return g
}

type LayerKey = 'dirt' | 'wall' | 'steel' | 'magic' | 'boulder' | 'diamond' | 'fly' | 'flyCore' | 'wingL' | 'wingR' | 'amoeba' | 'explode'

export function Scene() {
  const level = useGame((s) => s.level)
  const gameKey = useGame((s) => s.gameKey)
  const { camera, size } = useThree()

  const tex = useMemo(() => makeTextures(), [])
  const geo = useMemo(
    () => ({
      block: new RoundedBoxGeometry(1, 1, 1, 2, 0.07),
      rock: rockGeometry(),
      diamond: new THREE.OctahedronGeometry(0.34, 0).scale(1, 1.3, 1),
      fly: new THREE.TorusGeometry(0.3, 0.06, 6, 4),
      flyCore: new THREE.OctahedronGeometry(0.12, 0),
      wingL: wingGeometry(-1),
      wingR: wingGeometry(1),
      amoeba: new THREE.IcosahedronGeometry(0.5, 2),
      explode: new THREE.IcosahedronGeometry(0.5, 0),
    }),
    [],
  )
  const mat = useMemo(
    () => ({
      dirt: new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ map: tex.brick, roughness: 0.9 }),
      steel: new THREE.MeshStandardMaterial({ map: tex.steel, metalness: 0.7, roughness: 0.35 }),
      magic: new THREE.MeshStandardMaterial({ map: tex.brick, color: '#9a8cff', roughness: 0.6, emissive: '#7b4dff', emissiveIntensity: 0.05 }),
      boulder: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
      diamond: new THREE.MeshStandardMaterial({ color: '#bff6ff', emissive: '#22c8ff', emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.05, flatShading: true }),
      fly: new THREE.MeshStandardMaterial({ color: '#ffb340', emissive: '#ff7a00', emissiveIntensity: 3, toneMapped: false }),
      flyCore: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.4, 0.6), toneMapped: false }),
      wing: new THREE.MeshStandardMaterial({ color: '#7fb4ff', emissive: '#6a5cff', emissiveIntensity: 2.2, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.92 }),
      amoeba: new THREE.MeshStandardMaterial({ color: '#4fd14a', emissive: '#1e7a1a', emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.1 }),
      explode: new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9 }),
    }),
    [tex],
  )

  const layers = useRef<Partial<Record<LayerKey, THREE.InstancedMesh>>>({})
  const reg = (k: LayerKey) => (m: THREE.InstancedMesh | null) => {
    if (m) layers.current[k] = m
  }

  const particles = useMemo(() => new Particles(900), [])
  const miner = useRef<MinerState>({ x: 0, y: 0, dir: 1, moving: false, visible: false }).current
  const inboxRef = useRef<THREE.Mesh>(null!)
  const exitRef = useRef<THREE.Group>(null!)
  const exitGlow = useRef<THREE.MeshBasicMaterial>(null!)
  const light = useRef<THREE.DirectionalLight>(null!)

  // Oyun durumu React dışında tutulur (saniyede 8 tick, her karede render)
  const sim = useRef({
    game: newGame(0),
    acc: 0,
    prev: new Map<number, number>(),
    ended: false,
    endTimer: 0,
    lastTime: -1,
    shake: 0,
    camTarget: new THREE.Vector3(0, 0, 0),
    camInit: false,
    zoom: 1,
  })

  useEffect(() => {
    const s = sim.current
    s.game = newGame(level)
    setLiveGame(s.game)
    s.acc = 0
    s.prev.clear()
    s.ended = false
    s.endTimer = 0
    s.camInit = false
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
    l.target.position.set(0, 0, 0)
    l.parent?.add(l.target)
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  function handleEvents(events: GameEvent[], audible: boolean) {
    const played = new Set<string>()
    const play = (k: string, f: () => void) => {
      if (audible && !played.has(k)) {
        played.add(k)
        f()
      }
    }
    const s = sim.current
    for (const e of events) {
      switch (e.k) {
        case 'dig':
          play('dig', sfx.dig)
          particles.burst(wx(e.x), wy(e.y), 0.4, 7, '#8a5a2e', { speed: 2, life: 0.5, size: 0.07 })
          break
        case 'collect':
          play('collect', sfx.collect)
          particles.burst(wx(e.x), wy(e.y), 0.4, 22, [0.6, 2.4, 3], { speed: 4, life: 0.7, size: 0.06, gravity: 2 })
          break
        case 'land':
          if (e.t === T.BOULDER) {
            play('land', sfx.land)
            particles.burst(wx(e.x), wy(e.y) - 0.45, 0.4, 6, '#9b9087', { speed: 1.5, life: 0.5, size: 0.06, gravity: 2 })
            s.shake = Math.max(s.shake, 0.06)
          } else play('dland', sfx.diamondLand)
          break
        case 'push':
          play('push', sfx.push)
          break
        case 'explode':
          play('explode', sfx.explode)
          particles.burst(wx(e.x), wy(e.y), 0.5, 70, e.toDiamond ? [1, 1.5, 3.5] : [3.5, 1.4, 0.3], { speed: 7, life: 1.1, size: 0.11, gravity: 6, spread: 1.6 })
          s.shake = 0.5
          break
        case 'magic':
          play('magic', sfx.magic)
          particles.burst(wx(e.x), wy(e.y), 0.5, 10, [1.6, 0.8, 3.5], { speed: 2, life: 0.6, size: 0.05, gravity: -1 })
          break
        case 'exitOpen':
          play('exitOpen', sfx.exitOpen)
          break
        case 'spawn':
          play('spawn', sfx.spawn)
          particles.burst(wx(e.x), wy(e.y), 0.5, 30, [2.5, 2.5, 2.5], { speed: 3, life: 0.6, size: 0.05, gravity: 0 })
          break
        case 'win':
          play('win', sfx.win)
          break
        case 'die':
          play('die', sfx.die)
          break
        case 'timeout':
          play('die', sfx.die)
          break
      }
    }
  }

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    const st = useGame.getState()
    const s = sim.current
    const g = s.game
    const live = st.screen === 'playing'
    const running = (live || st.screen === 'title') && !st.paused && st.solve !== 'solving'

    // --- Simülasyon adımları ---
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
    const counts: Record<LayerKey, number> = { dirt: 0, wall: 0, steel: 0, magic: 0, boulder: 0, diamond: 0, fly: 0, flyCore: 0, wingL: 0, wingR: 0, amoeba: 0, explode: 0 }
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
      return [wx(px + (x - px) * alpha), wy(py + (y - py) * alpha)]
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
        case T.DIRT:
          dummy.position.set(wx(x), wy(y), -0.06)
          dummy.scale.set(1, 1, 0.88)
          dummy.rotation.z = Math.floor(h * 4) * (Math.PI / 2)
          put('dirt', color.setHSL(0.075 + h * 0.02, 0.35, 0.72 + h * 0.18))
          break
        case T.WALL:
          dummy.position.set(wx(x), wy(y), 0)
          put('wall', color.setRGB(0.92 + h * 0.08, 0.92 + h * 0.08, 0.92 + h * 0.08))
          break
        case T.STEEL:
          dummy.position.set(wx(x), wy(y), 0)
          put('steel')
          break
        case T.EXIT:
          exitAt = i
          if (!g.exitOpen) {
            dummy.position.set(wx(x), wy(y), 0)
            put('steel')
          }
          break
        case T.MAGIC:
          dummy.position.set(wx(x), wy(y), 0)
          put('magic')
          break
        case T.BOULDER: {
          const [px, py] = lerpPos(c.id, i)
          dummy.position.set(px, py, 0)
          // yuvarlanma: yatay konuma bağlı dönüş
          dummy.rotation.set(hash(c.id) * 6, hash(c.id + 7) * 6, -px / 0.46)
          const k = 0.45 + hash(c.id + 3) * 0.2
          put('boulder', color.setRGB(k * 1.05, k, k * 0.92))
          break
        }
        case T.DIAMOND: {
          const [px, py] = lerpPos(c.id, i)
          dummy.position.set(px, py, 0.05)
          dummy.rotation.set(0, t * 1.8 + hash(c.id) * 6, 0)
          const tw = 1 + Math.max(0, Math.sin(t * 3 + c.id * 1.7)) ** 16 * 0.25
          dummy.scale.setScalar(tw)
          put('diamond')
          break
        }
        case T.FIREFLY: {
          const [px, py] = lerpPos(c.id, i)
          dummy.position.set(px, py, 0.1)
          dummy.rotation.set(0, 0, t * 4 + c.id)
          dummy.scale.setScalar(1 + Math.sin(t * 10 + c.id) * 0.08)
          put('fly')
          dummy.rotation.set(t * 3, t * 5, 0)
          dummy.scale.setScalar(1)
          put('flyCore')
          break
        }
        case T.BUTTERFLY: {
          const [px, py] = lerpPos(c.id, i)
          const flap = Math.sin(t * 14 + c.id) * 1.1
          dummy.position.set(px, py + Math.sin(t * 7 + c.id) * 0.04, 0.15)
          dummy.rotation.set(0, flap, 0)
          put('wingL')
          dummy.rotation.set(0, -flap, 0)
          put('wingR')
          break
        }
        case T.AMOEBA: {
          dummy.position.set(wx(x), wy(y), 0)
          const pulse = 0.9 + Math.sin(t * 3 + h * 20) * 0.08
          dummy.scale.set(pulse, pulse * (1 + Math.sin(t * 2.3 + h * 9) * 0.06), pulse)
          dummy.rotation.set(t * 0.5 + h * 5, t * 0.3, h * 4)
          put('amoeba')
          break
        }
        case T.EXPLODE: {
          const p = (c.stage + alpha) / 5
          dummy.position.set(wx(x), wy(y), 0.2)
          dummy.scale.setScalar(0.5 + Math.sin(Math.min(p, 1) * Math.PI) * 0.7)
          dummy.rotation.set(h * 6 + t * 4, h * 3 + t * 3, 0)
          if (c.toDiamond) color.setRGB(1.2 + (1 - p) * 2, 1.6 + (1 - p) * 2, 4)
          else color.setRGB(4 * (1 - p * 0.5), 2 * (1 - p), 0.4 * (1 - p))
          put('explode', color)
          break
        }
        case T.INBOX:
          inboxAt = i
          break
        case T.PLAYER: {
          playerSeen = true
          const [px, py] = lerpPos(c.id, i)
          const p = s.prev.get(c.id)
          miner.moving = running && p !== undefined && p !== i
          miner.x = px
          miner.y = py
          miner.dir = c.dir
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
    miner.visible = playerSeen
    if (!playerSeen) miner.moving = false

    // Sihirli duvar etkinken parlar
    mat.magic.emissiveIntensity = g.magic === 'active' ? 0.8 + Math.sin(t * 12) * 0.6 : 0.05

    // Giriş kapısı yanıp söner
    const inbox = inboxRef.current
    inbox.visible = inboxAt >= 0
    if (inboxAt >= 0) {
      const x = inboxAt % W
      inbox.position.set(wx(x), wy((inboxAt - x) / W), 0)
      ;(inbox.material as THREE.MeshBasicMaterial).color.setScalar(Math.sin(t * 16) > 0 ? 3 : 0.4)
    }
    // Çıkış kapısı açıkken parlar
    const ex = exitRef.current
    ex.visible = exitAt >= 0 && g.exitOpen
    if (exitAt >= 0) {
      const x = exitAt % W
      ex.position.set(wx(x), wy((exitAt - x) / W), 0)
      ex.rotation.z = t * 0.8
      exitGlow.current.color.setRGB(0.4, 2.5 + Math.sin(t * 8) * 1.2, 1)
    }

    particles.update(dt)

    // --- Kamera ---
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const fitDist = Math.max((H / 2 + 1) / tanHalf, (W / 2 + 1) / (tanHalf * aspect))
    const overview = st.overview || st.screen === 'title'
    const dist = overview ? fitDist : Math.min(15 * s.zoom, fitDist)
    const target = new THREE.Vector3()
    if (playerSeen) target.set(miner.x, miner.y, 0)
    else if (inboxAt >= 0) target.set(wx(inboxAt % W), wy(Math.floor(inboxAt / W)), 0)
    else target.copy(s.camTarget)
    if (overview) target.set(0, 0, 0)
    // Görüş alanı mağaranın dışına taşmasın
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
    const tilt = overview ? 0.12 : 0.18
    cam.position.set(s.camTarget.x + sx + drift, s.camTarget.y + sy + dist * tilt, dist)
    cam.lookAt(s.camTarget.x + sx * 0.5, s.camTarget.y + sy * 0.5, 0)

    const l = light.current
    l.position.set(s.camTarget.x - 8, s.camTarget.y + 12, 14)
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
      <color attach="background" args={['#06070b']} />
      <ambientLight intensity={0.25} />
      <hemisphereLight args={['#9fb4ff', '#2a1608', 0.55]} />
      <directionalLight ref={light} intensity={2.4} color="#fff1dc" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03} shadow-camera-near={1} shadow-camera-far={60} />

      {/* Mağara arka duvarı */}
      <mesh position={[0, 0, -0.5]} receiveShadow>
        <planeGeometry args={[W + 40, H + 40]} />
        <meshStandardMaterial map={tex.rock} bumpMap={tex.rockBump} bumpScale={2} color="#a99a8c" roughness={1} />
      </mesh>

      <instancedMesh ref={reg('dirt')} args={[geo.block, mat.dirt, N]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('wall')} args={[geo.block, mat.wall, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('steel')} args={[geo.block, mat.steel, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('magic')} args={[geo.block, mat.magic, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('boulder')} args={[geo.rock, mat.boulder, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('diamond')} args={[geo.diamond, mat.diamond, N]} castShadow frustumCulled={false} />
      <instancedMesh ref={reg('fly')} args={[geo.fly, mat.fly, 64]} frustumCulled={false} />
      <instancedMesh ref={reg('flyCore')} args={[geo.flyCore, mat.flyCore, 64]} frustumCulled={false} />
      <instancedMesh ref={reg('wingL')} args={[geo.wingL, mat.wing, 64]} frustumCulled={false} />
      <instancedMesh ref={reg('wingR')} args={[geo.wingR, mat.wing, 64]} frustumCulled={false} />
      <instancedMesh ref={reg('amoeba')} args={[geo.amoeba, mat.amoeba, N]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={reg('explode')} args={[geo.explode, mat.explode, N]} frustumCulled={false} />
      <primitive object={particles.mesh} />

      <mesh ref={inboxRef} geometry={geo.block}>
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      <group ref={exitRef}>
        <mesh>
          <torusGeometry args={[0.38, 0.08, 8, 4]} />
          <meshStandardMaterial color="#9affc8" emissive="#20ff90" emissiveIntensity={2} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.2]}>
          <circleGeometry args={[0.36, 24]} />
          <meshBasicMaterial ref={exitGlow} toneMapped={false} />
        </mesh>
      </group>

      <Miner state={miner} />
      <SolutionPath color={[3.2, 2.4, 0.5]} />
    </>
  )
}
