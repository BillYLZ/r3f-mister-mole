// Çözüm yolunu çizer (üç sürümde de): oyuncunun geçeceği hücreler parlak
// noktalarla gösterilir, oyuncu ilerledikçe noktalar silinir.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { W, H } from './levels.ts'
import { remainingPath } from './autopilot.ts'

const MAX = 1200
const wx = (x: number) => x - (W - 1) / 2
const wy = (y: number) => (H - 1) / 2 - y

/** color: değerler 1'den büyükse parlar (bloom); glow=false ile düz renk (aydınlık sahneler için). */
export function SolutionPath({ z = 0.7, size = 0.09, glow = true, color = [3.2, 2.4, 0.5] as [number, number, number] }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.SphereGeometry(size, 12, 8), [size])
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), toneMapped: !glow, transparent: true, opacity: 0.92, depthWrite: false }),
    [color[0], color[1], color[2], glow],
  )
  const m = useMemo(() => new THREE.Matrix4(), [])
  useFrame(({ clock }) => {
    const path = remainingPath()
    let n = 0
    let last = -1
    const t = clock.elapsedTime
    for (let k = 0; k < path.length && n < MAX; k++) {
      const cell = path[k]
      if (cell === last) continue // beklenen tick'ler aynı hücre
      last = cell
      const x = cell % W
      const y = (cell - x) / W
      // yol boyunca ilerleyen hafif nabız
      const s = 1 + Math.max(0, Math.sin(t * 6 - n * 0.45)) * 0.5
      m.makeScale(s, s, s)
      m.setPosition(wx(x), wy(y), z)
      mesh.current.setMatrixAt(n++, m)
    }
    mesh.current.count = n
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[geo, mat, MAX]} frustumCulled={false} renderOrder={10} />
}
