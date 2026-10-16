// Oyuncu karakteri: kasklı, kafa lambalı küçük bir madenci.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export interface MinerState {
  x: number
  y: number
  dir: number
  moving: boolean
  visible: boolean
}

const SKIN = '#f1c27d'
const SUIT = '#2f6fd6'

export function Miner({ state }: { state: MinerState }) {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const phase = useRef(0)

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    root.current.visible = state.visible
    root.current.position.set(state.x, state.y, 0.05)
    const face = state.dir === 1 ? 1.0 : state.dir === 3 ? -1.0 : 0
    body.current.rotation.y = THREE.MathUtils.damp(body.current.rotation.y, face, 12, dt)
    if (state.moving) phase.current += dt * 16
    const s = Math.sin(phase.current)
    const swing = state.moving ? 0.7 : 0
    legL.current.rotation.x = THREE.MathUtils.damp(legL.current.rotation.x, s * swing, 20, dt)
    legR.current.rotation.x = THREE.MathUtils.damp(legR.current.rotation.x, -s * swing, 20, dt)
    armL.current.rotation.x = THREE.MathUtils.damp(armL.current.rotation.x, -s * swing, 20, dt)
    armR.current.rotation.x = THREE.MathUtils.damp(armR.current.rotation.x, s * swing, 20, dt)
    // Boşta: hafif nefes alma ve sabırsız ayak vurma
    const idleTap = !state.moving && Math.sin(t * 0.7) > 0.6 ? Math.abs(Math.sin(t * 9)) * 0.3 : 0
    if (!state.moving) legR.current.rotation.x = -idleTap
    body.current.position.y = state.moving ? Math.abs(s) * 0.05 : Math.sin(t * 2.2) * 0.012
  })

  return (
    <group ref={root}>
      <group ref={body}>
        {/* gövde */}
        <mesh castShadow position={[0, -0.05, 0]}>
          <capsuleGeometry args={[0.16, 0.2, 4, 12]} />
          <meshStandardMaterial color={SUIT} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.13, 0]}>
          <torusGeometry args={[0.165, 0.025, 6, 20]} />
          <meshStandardMaterial color="#5a3a1a" roughness={0.8} />
        </mesh>
        {/* kafa */}
        <mesh castShadow position={[0, 0.24, 0]}>
          <sphereGeometry args={[0.14, 20, 16]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>
        <mesh position={[-0.05, 0.25, 0.125]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshBasicMaterial color="#111" />
        </mesh>
        <mesh position={[0.05, 0.25, 0.125]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshBasicMaterial color="#111" />
        </mesh>
        {/* kask ve lamba */}
        <mesh castShadow position={[0, 0.27, 0]}>
          <sphereGeometry args={[0.158, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#ffc21a" metalness={0.3} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.27, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.02, 20]} />
          <meshStandardMaterial color="#e0a800" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.34, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 12]} />
          <meshBasicMaterial color={[4, 3.6, 2.4]} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 0.34, 0.45]} intensity={4} distance={5} decay={1.6} color="#ffd9a0" />
        {/* kollar */}
        <group ref={armL} position={[-0.2, 0.08, 0]}>
          <mesh castShadow position={[0, -0.11, 0]}>
            <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
            <meshStandardMaterial color={SUIT} roughness={0.6} />
          </mesh>
        </group>
        <group ref={armR} position={[0.2, 0.08, 0]}>
          <mesh castShadow position={[0, -0.11, 0]}>
            <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
            <meshStandardMaterial color={SUIT} roughness={0.6} />
          </mesh>
        </group>
        {/* bacaklar */}
        <group ref={legL} position={[-0.075, -0.24, 0]}>
          <mesh castShadow position={[0, -0.1, 0]}>
            <boxGeometry args={[0.09, 0.2, 0.1]} />
            <meshStandardMaterial color="#3b3b46" roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.2, 0.025]}>
            <boxGeometry args={[0.1, 0.05, 0.15]} />
            <meshStandardMaterial color="#2a1c10" roughness={0.9} />
          </mesh>
        </group>
        <group ref={legR} position={[0.075, -0.24, 0]}>
          <mesh castShadow position={[0, -0.1, 0]}>
            <boxGeometry args={[0.09, 0.2, 0.1]} />
            <meshStandardMaterial color="#3b3b46" roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.2, 0.025]}>
            <boxGeometry args={[0.1, 0.05, 0.15]} />
            <meshStandardMaterial color="#2a1c10" roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
