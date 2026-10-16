// Tek bir InstancedMesh ile çalışan basit parçacık havuzu (kıvılcım, toz, patlama).
import * as THREE from 'three'

export class Particles {
  readonly mesh: THREE.InstancedMesh
  private n: number
  private pos: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private maxLife: Float32Array
  private size: Float32Array
  private grav: Float32Array
  private next = 0
  private m = new THREE.Matrix4()
  private c = new THREE.Color()

  constructor(n = 800) {
    this.n = n
    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.life = new Float32Array(n)
    this.maxLife = new Float32Array(n).fill(1)
    this.size = new Float32Array(n)
    this.grav = new Float32Array(n)
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false })
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n)
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.m.makeScale(0, 0, 0)
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, this.m)
      this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1))
    }
  }

  burst(x: number, y: number, z: number, count: number, color: THREE.ColorRepresentation | [number, number, number], opts: { speed?: number; life?: number; size?: number; gravity?: number; spread?: number } = {}) {
    const { speed = 3, life = 0.8, size = 0.08, gravity = 9, spread = 0.3 } = opts
    const base = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color)
    for (let k = 0; k < count; k++) {
      const i = this.next
      this.next = (this.next + 1) % this.n
      const a = Math.random() * Math.PI * 2
      const b = Math.acos(Math.random() * 2 - 1)
      const v = speed * (0.4 + Math.random() * 0.6)
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread
      this.vel[i * 3] = Math.cos(a) * Math.sin(b) * v
      this.vel[i * 3 + 1] = Math.sin(a) * Math.sin(b) * v + speed * 0.3
      this.vel[i * 3 + 2] = Math.abs(Math.cos(b)) * v
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6)
      this.size[i] = size * (0.6 + Math.random() * 0.8)
      this.grav[i] = gravity
      const j = 0.8 + Math.random() * 0.4
      this.mesh.setColorAt(i, this.c.setRGB(base.r * j, base.g * j, base.b * j))
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      const k = i * 3
      this.vel[k + 1] -= this.grav[i] * dt
      const drag = Math.exp(-dt * 1.5)
      this.vel[k] *= drag
      this.vel[k + 2] *= drag
      this.pos[k] += this.vel[k] * dt
      this.pos[k + 1] += this.vel[k + 1] * dt
      this.pos[k + 2] += this.vel[k + 2] * dt
      const s = this.life[i] > 0 ? this.size[i] * Math.min(1, (this.life[i] / this.maxLife[i]) * 1.5) : 0
      this.m.makeScale(s, s, s)
      this.m.setPosition(this.pos[k], this.pos[k + 1], this.pos[k + 2])
      this.mesh.setMatrixAt(i, this.m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
