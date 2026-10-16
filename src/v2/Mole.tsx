// Sürüm 2 karakteri: kasklı, gözlüklü, kafa lambalı tüylü bir köstebek.
// Kafa lambası gölge düşüren bir spot ışıktır; karanlık mağarayı o aydınlatır.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export interface MoleState {
  x: number
  y: number
  dir: number
  moving: boolean
  visible: boolean
}

const FUR = '#5b4636'
const FUR_SHEEN = '#c9a27e'
const PINK = '#f29aa6'

function furMaterial(color: string) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(FUR_SHEEN), sheenRoughness: 0.55 })
}

export function Mole({ state }: { state: MoleState }) {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const squash = useRef<THREE.Group>(null!)
  const nose = useRef<THREE.Mesh>(null!)
  const pawL = useRef<THREE.Group>(null!)
  const pawR = useRef<THREE.Group>(null!)
  const footL = useRef<THREE.Mesh>(null!)
  const footR = useRef<THREE.Mesh>(null!)
  const tail = useRef<THREE.Mesh>(null!)
  const spot = useRef<THREE.SpotLight>(null!)
  const spotTarget = useMemo(() => new THREE.Object3D(), [])
  const phase = useRef(0)
  const blink = useRef(0)
  const eyes = useRef<THREE.Mesh[]>([])

  const mats = useMemo(
    () => ({
      fur: furMaterial(FUR),
      belly: furMaterial('#8a6e57'),
      pink: new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.45 }),
      claw: new THREE.MeshStandardMaterial({ color: '#f4ecdf', roughness: 0.3 }),
      helmet: new THREE.MeshPhysicalMaterial({ color: '#ffb81c', roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.2 }),
      rim: new THREE.MeshStandardMaterial({ color: '#2b2b30', metalness: 0.8, roughness: 0.3 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, clearcoat: 1 }),
      eye: new THREE.MeshBasicMaterial({ color: '#0b0b0d' }),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.4, 3), toneMapped: false }),
    }),
    [],
  )

  useEffect(() => {
    spot.current.target = spotTarget
  }, [spotTarget])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    root.current.visible = state.visible
    spot.current.intensity = state.visible ? 22 : 0
    root.current.position.set(state.x, state.y, 0.05)

    // Yürürken yana döner (burun gidiş yönüne bakar), dururken kameraya
    const face = state.dir === 1 ? 1.15 : state.dir === 3 ? -1.15 : 0
    const turn = state.moving ? face : face * 0.45
    body.current.rotation.y = THREE.MathUtils.damp(body.current.rotation.y, turn, 10, dt)

    if (state.moving) phase.current += dt * 18
    const s = Math.sin(phase.current)
    const m = state.moving ? 1 : 0
    // Kazma hareketi: pençeler sırayla öne doğru kürek çeker
    pawL.current.rotation.x = THREE.MathUtils.damp(pawL.current.rotation.x, m * s * 1.1 - 0.2, 18, dt)
    pawR.current.rotation.x = THREE.MathUtils.damp(pawR.current.rotation.x, -m * s * 1.1 - 0.2, 18, dt)
    pawL.current.rotation.z = THREE.MathUtils.damp(pawL.current.rotation.z, 0.5 + m * Math.cos(phase.current) * 0.4, 18, dt)
    pawR.current.rotation.z = THREE.MathUtils.damp(pawR.current.rotation.z, -0.5 - m * Math.cos(phase.current) * 0.4, 18, dt)
    footL.current.position.y = -0.33 + Math.max(0, s) * 0.06 * m
    footR.current.position.y = -0.33 + Math.max(0, -s) * 0.06 * m

    // Esneme-sıkışma: her adımda hafifçe ezilip uzar
    const sq = m * Math.abs(s) * 0.08
    const idle = (1 - m) * Math.sin(t * 2.4) * 0.02
    squash.current.scale.set(1 + sq, 1 - sq + idle, 1 + sq * 0.5)
    squash.current.position.y = m * Math.abs(s) * 0.04

    // Burun koklama ve kuyruk sallama
    const sniff = Math.sin(t * 22) * 0.5 + 0.5
    nose.current.scale.setScalar(1 + sniff * 0.12 * (Math.sin(t * 1.3) > 0 ? 1 : 0.2))
    tail.current.rotation.z = Math.sin(t * 6) * 0.4

    // Arada bir göz kırpma
    blink.current -= dt
    if (blink.current < -3 - Math.random() * 3) blink.current = 0.12
    for (const e of eyes.current) e.scale.y = blink.current > 0 ? 0.1 : 1

    // Kafa lambası: hafif önde ve yukarıda, baktığı yöne doğru
    spot.current.position.set(state.x + face * 0.4, state.y + 0.9, 2.6)
    spotTarget.position.set(state.x + face * 2.2, state.y - 0.3, 0)
    spotTarget.updateMatrixWorld()
  })

  return (
    <>
      <spotLight
        ref={spot}
        angle={0.75}
        penumbra={0.65}
        distance={22}
        decay={1.4}
        color="#ffe3b8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      <primitive object={spotTarget} />
      <group ref={root}>
        {/* Yakın dolgu ışığı: köstebeğin kendisini ve yakın çevresini aydınlatır */}
        <pointLight position={[0, 0.3, 0.9]} intensity={2.2} distance={3.5} decay={1.5} color="#ffd6a0" />
        <group ref={body}>
          <group ref={squash}>
            {/* gövde */}
            <mesh castShadow material={mats.fur} scale={[0.3, 0.3, 0.27]} position={[0, -0.05, 0]}>
              <sphereGeometry args={[1, 28, 20]} />
            </mesh>
            <mesh material={mats.belly} scale={[0.2, 0.22, 0.12]} position={[0, -0.09, 0.18]}>
              <sphereGeometry args={[1, 20, 14]} />
            </mesh>
            {/* burun ucu */}
            <mesh castShadow material={mats.fur} scale={[0.13, 0.11, 0.17]} position={[0, 0.04, 0.27]}>
              <sphereGeometry args={[1, 20, 14]} />
            </mesh>
            <mesh ref={nose} material={mats.pink} position={[0, 0.06, 0.44]}>
              <sphereGeometry args={[0.055, 16, 12]} />
            </mesh>
            {/* bıyıklar */}
            {[-1, 1].map((side) =>
              [-0.03, 0.02].map((dy) => (
                <mesh key={`${side}${dy}`} material={mats.claw} position={[side * 0.1, 0.04 + dy, 0.38]} rotation={[0, 0, side * (0.15 + dy * 4)]}>
                  <boxGeometry args={[0.16, 0.005, 0.005]} />
                </mesh>
              )),
            )}
            {/* gözler ve gözlük */}
            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.095, 0.15, 0.22]} rotation={[0, side * 0.35, 0]}>
                <mesh material={mats.eye} ref={(m) => void (m && (eyes.current[side < 0 ? 0 : 1] = m))}>
                  <sphereGeometry args={[0.028, 12, 10]} />
                </mesh>
                <mesh material={mats.rim} position={[0, 0, 0.01]}>
                  <torusGeometry args={[0.058, 0.014, 8, 20]} />
                </mesh>
                <mesh material={mats.glass} position={[0, 0, 0.012]}>
                  <circleGeometry args={[0.055, 20]} />
                </mesh>
              </group>
            ))}
            <mesh material={mats.rim} position={[0, 0.15, 0.24]}>
              <boxGeometry args={[0.07, 0.015, 0.015]} />
            </mesh>
            {/* kask ve lamba */}
            <group position={[0, 0.17, -0.02]}>
              <mesh castShadow material={mats.helmet}>
                <sphereGeometry args={[0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
              </mesh>
              <mesh material={mats.helmet} rotation={[0, 0, 0]} position={[0, 0.01, 0]} scale={[1, 0.12, 1]}>
                <cylinderGeometry args={[0.27, 0.27, 0.1, 24]} />
              </mesh>
              <mesh material={mats.rim} position={[0, 0.13, 0.19]} rotation={[Math.PI / 2 - 0.5, 0, 0]}>
                <cylinderGeometry args={[0.055, 0.045, 0.07, 16]} />
              </mesh>
              <mesh material={mats.lamp} position={[0, 0.15, 0.225]} rotation={[Math.PI / 2 - 0.5, 0, 0]}>
                <circleGeometry args={[0.042, 16]} />
              </mesh>
            </group>
            {/* kürek pençeler */}
            <group ref={pawL} position={[-0.27, -0.06, 0.1]}>
              <mesh castShadow material={mats.pink} scale={[0.1, 0.03, 0.12]} position={[0, 0, 0.06]}>
                <sphereGeometry args={[1, 14, 10]} />
              </mesh>
              {[-0.06, -0.02, 0.02, 0.06].map((cx) => (
                <mesh key={cx} material={mats.claw} position={[cx, 0, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
                  <coneGeometry args={[0.012, 0.05, 6]} />
                </mesh>
              ))}
            </group>
            <group ref={pawR} position={[0.27, -0.06, 0.1]}>
              <mesh castShadow material={mats.pink} scale={[0.1, 0.03, 0.12]} position={[0, 0, 0.06]}>
                <sphereGeometry args={[1, 14, 10]} />
              </mesh>
              {[-0.06, -0.02, 0.02, 0.06].map((cx) => (
                <mesh key={cx} material={mats.claw} position={[cx, 0, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
                  <coneGeometry args={[0.012, 0.05, 6]} />
                </mesh>
              ))}
            </group>
            {/* ayaklar ve kuyruk */}
            <mesh ref={footL} material={mats.pink} scale={[0.07, 0.035, 0.1]} position={[-0.13, -0.33, 0.06]}>
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
            <mesh ref={footR} material={mats.pink} scale={[0.07, 0.035, 0.1]} position={[0.13, -0.33, 0.06]}>
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
            <mesh ref={tail} material={mats.pink} position={[0, -0.22, -0.26]} rotation={[0.9, 0, 0]}>
              <capsuleGeometry args={[0.02, 0.1, 4, 8]} />
            </mesh>
          </group>
        </group>
      </group>
    </>
  )
}
