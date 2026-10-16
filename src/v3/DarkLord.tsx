// Sürüm 3 karakteri: oyuncak figür oranlarında "Kara Lord".
// Kara kask, kızıl gözler, göğüs paneli, pelerin ve kırmızı enerji kılıcı.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export interface LordState {
  x: number
  y: number
  dir: number
  moving: boolean
  visible: boolean
}

/** Figür gövdesi: üstü dar, altı geniş kesik piramit. */
function torsoGeometry() {
  const g = new THREE.CylinderGeometry(0.21, 0.27, 0.32, 4, 1).rotateY(Math.PI / 4)
  g.scale(1, 1, 0.5)
  g.computeVertexNormals()
  return g
}

/** Kask: kubbe + öne ve yanlara açılan etek. */
function helmetGeometry() {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2)
    pts.push(new THREE.Vector2(Math.sin(a) * 0.15, Math.cos(a) * 0.15 + 0.03))
  }
  pts.push(new THREE.Vector2(0.155, 0.0))
  pts.push(new THREE.Vector2(0.19, -0.1))
  pts.push(new THREE.Vector2(0.2, -0.13))
  pts.reverse()
  return new THREE.LatheGeometry(pts, 32)
}

export function DarkLord({ state }: { state: LordState }) {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const cape = useRef<THREE.Group>(null!)
  const blade = useRef<THREE.Mesh>(null!)
  const panel = useRef<THREE.Mesh[]>([])
  const phase = useRef(0)

  const geo = useMemo(() => ({ torso: torsoGeometry(), helmet: helmetGeometry() }), [])
  const mats = useMemo(
    () => ({
      black: new THREE.MeshPhysicalMaterial({ color: '#16161b', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 }),
      gloss: new THREE.MeshPhysicalMaterial({ color: '#0b0b0e', roughness: 0.12, metalness: 0.3, clearcoat: 1 }),
      grey: new THREE.MeshPhysicalMaterial({ color: '#6b6e78', roughness: 0.3, metalness: 0.4, clearcoat: 1 }),
      cape: new THREE.MeshStandardMaterial({ color: '#111114', roughness: 0.75, side: THREE.DoubleSide }),
      eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.2), toneMapped: false }),
      blade: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.5, 0.4), toneMapped: false }),
      hilt: new THREE.MeshPhysicalMaterial({ color: '#c9ccd6', metalness: 0.9, roughness: 0.25 }),
      lights: ['#ff3030', '#30ff60', '#3080ff'].map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), toneMapped: false })),
    }),
    [],
  )

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    root.current.visible = state.visible
    root.current.position.set(state.x, state.y - 0.02, 0.15)
    const face = state.dir === 1 ? 1.1 : state.dir === 3 ? -1.1 : 0
    body.current.rotation.y = THREE.MathUtils.damp(body.current.rotation.y, state.moving ? face : face * 0.5, 10, dt)
    if (state.moving) phase.current += dt * 15
    const s = Math.sin(phase.current)
    const m = state.moving ? 1 : 0
    // Oyuncak figür yürüyüşü: bacaklar kalçadan sallanır
    legL.current.rotation.x = THREE.MathUtils.damp(legL.current.rotation.x, s * 0.7 * m, 18, dt)
    legR.current.rotation.x = THREE.MathUtils.damp(legR.current.rotation.x, -s * 0.7 * m, 18, dt)
    armL.current.rotation.x = THREE.MathUtils.damp(armL.current.rotation.x, -s * 0.6 * m - 0.1, 18, dt)
    // Kılıçlı kol: yürürken önde, dururken havada kılıç tutar
    armR.current.rotation.x = THREE.MathUtils.damp(armR.current.rotation.x, m ? -1.2 + s * 0.2 : -0.6 + Math.sin(t * 1.5) * 0.08, 12, dt)
    body.current.position.y = m * Math.abs(s) * 0.035
    // Pelerin yürürken arkaya savrulur
    cape.current.rotation.x = THREE.MathUtils.damp(cape.current.rotation.x, 0.08 + m * (0.35 + Math.abs(s) * 0.1), 8, dt)
    // Kılıç vızıltısı ve göğüs paneli ışıkları
    blade.current.scale.x = blade.current.scale.z = 1 + Math.sin(t * 40) * 0.08
    panel.current.forEach((p, i) => (p.visible = Math.sin(t * 3 + i * 2.1) > -0.3))
  })

  return (
    <group ref={root} scale={1.05}>
      <pointLight position={[0.3, 0.1, 0.5]} intensity={1.6} distance={2.5} decay={1.5} color="#ff3a2a" />
      <group ref={body}>
        {/* bacaklar ve kalça */}
        <mesh material={mats.black} position={[0, -0.13, 0]}>
          <boxGeometry args={[0.36, 0.06, 0.16]} />
        </mesh>
        <group ref={legL} position={[-0.09, -0.16, 0]}>
          <mesh castShadow material={mats.black} position={[0, -0.13, 0]}>
            <boxGeometry args={[0.17, 0.26, 0.16]} />
          </mesh>
          <mesh material={mats.black} position={[0, -0.26, 0.03]}>
            <boxGeometry args={[0.17, 0.05, 0.22]} />
          </mesh>
        </group>
        <group ref={legR} position={[0.09, -0.16, 0]}>
          <mesh castShadow material={mats.black} position={[0, -0.13, 0]}>
            <boxGeometry args={[0.17, 0.26, 0.16]} />
          </mesh>
          <mesh material={mats.black} position={[0, -0.26, 0.03]}>
            <boxGeometry args={[0.17, 0.05, 0.22]} />
          </mesh>
        </group>
        {/* gövde ve kemer */}
        <mesh castShadow geometry={geo.torso} material={mats.black} position={[0, 0.06, 0]} />
        <mesh material={mats.grey} position={[0, -0.075, 0.075]}>
          <boxGeometry args={[0.3, 0.04, 0.02]} />
        </mesh>
        {/* göğüs paneli */}
        <mesh material={mats.grey} position={[0, 0.1, 0.075]}>
          <boxGeometry args={[0.12, 0.08, 0.015]} />
        </mesh>
        {mats.lights.map((mt, i) => (
          <mesh key={i} material={mt} position={[-0.035 + i * 0.035, 0.1, 0.085]} ref={(m) => void (m && (panel.current[i] = m))}>
            <boxGeometry args={[0.022, 0.022, 0.01]} />
          </mesh>
        ))}
        {/* kollar */}
        <group ref={armL} position={[-0.22, 0.17, 0]} rotation={[0, 0, -0.15]}>
          <mesh castShadow material={mats.black} position={[0, -0.12, 0]} rotation={[0, 0, 0.1]}>
            <cylinderGeometry args={[0.055, 0.065, 0.24, 12]} />
          </mesh>
          <mesh material={mats.black} position={[0, -0.26, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.04, 0.02, 8, 16, Math.PI * 1.5]} />
          </mesh>
        </group>
        <group ref={armR} position={[0.22, 0.17, 0]} rotation={[0, 0, 0.15]}>
          <mesh castShadow material={mats.black} position={[0, -0.12, 0]} rotation={[0, 0, -0.1]}>
            <cylinderGeometry args={[0.055, 0.065, 0.24, 12]} />
          </mesh>
          {/* el ve enerji kılıcı */}
          <group position={[0, -0.26, 0.03]}>
            <mesh material={mats.hilt} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.022, 0.022, 0.14, 12]} />
            </mesh>
            <mesh ref={blade} material={mats.blade} position={[0, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 0.66, 10]} />
            </mesh>
          </group>
        </group>
        {/* boyun, baş ve kask */}
        <mesh material={mats.black} position={[0, 0.235, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 12]} />
        </mesh>
        <mesh material={mats.black} position={[0, 0.33, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.16, 20]} />
        </mesh>
        <mesh castShadow geometry={geo.helmet} material={mats.gloss} position={[0, 0.37, 0]} />
        {/* yüz maskesi: gözler ve ızgara */}
        {[-1, 1].map((sd) => (
          <mesh key={sd} material={mats.eye} position={[sd * 0.045, 0.35, 0.108]} rotation={[0, 0, sd * -0.35]}>
            <boxGeometry args={[0.05, 0.022, 0.01]} />
          </mesh>
        ))}
        <mesh material={mats.grey} position={[0, 0.29, 0.105]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.04, 0.06, 3]} />
        </mesh>
        {/* pelerin */}
        <group ref={cape} position={[0, 0.24, -0.1]}>
          <mesh material={mats.cape} position={[0, -0.32, 0]}>
            <planeGeometry args={[0.46, 0.64, 4, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
