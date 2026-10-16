// Sürüm 3: oyuncak tuğla geometrileri ve renk paleti.
// Tuğlalar kameraya düğmeli yüzüyle bakar (üstten görünüm gibi).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../engine.ts'

// Referans görseldeki canlı renkler
export const PALETTE = {
  red: '#e8352b',
  yellow: '#ffc21f',
  blue: '#1f6fe0',
  green: '#2f9e2f',
  pink: '#ff5ca8',
  purple: '#9b35e0',
  sky: '#36a6ff',
}
export const DIRT_COLORS = [PALETTE.red, PALETTE.yellow, PALETTE.blue, PALETTE.green, PALETTE.pink, PALETTE.purple, PALETTE.sky]

/** Hücre için tuğla rengi: 2x2'lik gruplar aynı renk olur, büyük parçalar gibi görünür. */
export function dirtColorIndex(x: number, y: number) {
  const bx = Math.floor((x + (Math.floor(y / 2) % 2)) / 2)
  const by = Math.floor(y / 2)
  const s = Math.sin(bx * 91.7 + by * 47.3 + 13.1) * 43758.5453
  return Math.floor((s - Math.floor(s)) * DIRT_COLORS.length)
}

function studs(n: number, size: number, radius: number, height: number, z: number) {
  const parts: THREE.BufferGeometry[] = []
  const step = size / n
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const s = new THREE.CylinderGeometry(radius, radius, height, 20, 1).rotateX(Math.PI / 2)
      s.translate(-size / 2 + step * (i + 0.5), -size / 2 + step * (j + 0.5), z + height / 2)
      parts.push(s.toNonIndexed())
    }
  return parts
}

/** Düğmeli kare tuğla (1 hücre, 2x2 düğme). */
export function studBrick(depth = 0.7) {
  const body = new RoundedBoxGeometry(0.96, 0.96, depth, 3, 0.06).toNonIndexed()
  body.deleteAttribute('uv')
  const st = studs(2, 0.96, 0.15, 0.1, depth / 2)
  st.forEach((g) => g.deleteAttribute('uv'))
  return mergeGeometries([body, ...st])!
}

/** Yuvarlak parça (kaya yerine): plastik top, ön yüzünde tek düğme. */
export function roundBrick() {
  const ball = new THREE.SphereGeometry(0.44, 32, 20).scale(1, 1, 0.85).toNonIndexed()
  const stud = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 24, 1).rotateX(Math.PI / 2).translate(0, 0, 0.4).toNonIndexed()
  for (const g of [ball, stud]) g.deleteAttribute('uv')
  // Kürenin kendi yumuşak normalleri korunur (yeniden hesaplamak köşeli gösterir)
  return mergeGeometries([ball, stud])!
}

/** Düğmesiz düz karo (çerçeve ve çelik duvar). */
export function tile(depth = 0.9) {
  return new RoundedBoxGeometry(1, 1, depth, 4, 0.14)
}

/** Kristal mücevher parçası (elmas yerine): yuvarlak kesimli şeffaf taş. */
export function jewel() {
  const crown = new THREE.CylinderGeometry(0.2, 0.33, 0.16, 10, 1).rotateX(Math.PI / 2).translate(0, 0, 0.08)
  const pav = new THREE.CylinderGeometry(0.33, 0.05, 0.26, 10, 1).rotateX(Math.PI / 2).rotateX(Math.PI).translate(0, 0, -0.13)
  const g = mergeGeometries([crown.toNonIndexed(), pav.toNonIndexed()])!
  g.computeVertexNormals()
  return g
}

/** Resimdeki gibi hilal desenli mor arka plan. */
export function moonTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#3b33b8'
  g.fillRect(0, 0, 256, 256)
  // ince yatay çizgiler (tahta görünümü)
  g.strokeStyle = 'rgba(20,10,80,0.35)'
  g.lineWidth = 2
  for (let y = 0; y < 256; y += 21) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(256, y)
    g.stroke()
  }
  const rnd = mulberry32(42)
  g.fillStyle = 'rgba(140,130,255,0.45)'
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256
    const y = rnd() * 256
    const r = 5 + rnd() * 7
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
    g.save()
    g.globalCompositeOperation = 'destination-out'
    g.beginPath()
    g.arc(x + r * 0.45, y - r * 0.3, r, 0, Math.PI * 2)
    g.fill()
    g.restore()
    g.fillStyle = '#3b33b8'
    g.globalCompositeOperation = 'destination-over'
    g.fillRect(0, 0, 256, 256)
    g.globalCompositeOperation = 'source-over'
    g.fillStyle = 'rgba(140,130,255,0.45)'
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(10, 6)
  return tex
}

/** Çıkış karosu üzerindeki beyaz üçgen ok. */
export function arrowGeometry() {
  const s = new THREE.Shape()
  s.moveTo(-0.22, -0.1)
  s.lineTo(0.22, -0.1)
  s.lineTo(0, 0.18)
  s.closePath()
  return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 2 })
}
