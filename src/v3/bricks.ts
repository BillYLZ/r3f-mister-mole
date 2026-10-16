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

export interface BarRun {
  x: number // ilk hücre (ızgara)
  y: number
  len: number
  vertical: boolean
}

/**
 * Bitişik duvar hücrelerini tek parça çubuklara ayırır: önce yatay diziler
 * (en az 2 hücre), kalan tek hücreler dikey diziler olarak birleştirilir.
 */
export function findBarRuns(isWall: (x: number, y: number) => boolean, w: number, h: number): BarRun[] {
  const used = new Uint8Array(w * h)
  const runs: BarRun[] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!isWall(x, y) || used[y * w + x]) continue
      let len = 1
      while (x + len < w && isWall(x + len, y)) len++
      if (len >= 2) {
        for (let k = 0; k < len; k++) used[y * w + x + k] = 1
        runs.push({ x, y, len, vertical: false })
      }
    }
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      if (!isWall(x, y) || used[y * w + x]) continue
      let len = 1
      while (y + len < h && isWall(x, y + len) && !used[(y + len) * w + x]) len++
      for (let k = 0; k < len; k++) used[(y + k) * w + x] = 1
      runs.push({ x, y, len, vertical: true })
    }
  return runs
}

function nonIndexed(g: THREE.BufferGeometry) {
  return g.index ? g.toNonIndexed() : g
}

function paint(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.deleteAttribute('uv')
  return g
}

/**
 * Delikli kiriş: düğmesiz, uçları yuvarlak tek parça uzun parça; her hücrede
 * bir yuvarlak delik. Tüm duvar dizileri tek geometride birleştirilir.
 */
export function beamGeometry(runs: BarRun[], toWorld: (x: number, y: number) => [number, number], colorOf: (r: BarRun) => THREE.Color, depth = 0.55) {
  const parts: THREE.BufferGeometry[] = []
  const r0 = 0.45 // uç yarıçapı
  for (const r of runs) {
    const len = r.len - 0.06
    const half = len / 2 - r0
    const s = new THREE.Shape()
    s.moveTo(-half, -r0)
    s.lineTo(half, -r0)
    s.absarc(half, 0, r0, -Math.PI / 2, Math.PI / 2, false)
    s.lineTo(-half, r0)
    s.absarc(-half, 0, r0, Math.PI / 2, (3 * Math.PI) / 2, false)
    for (let k = 0; k < r.len; k++) {
      const hole = new THREE.Path()
      hole.absarc(-(r.len - 1) / 2 + k, 0, 0.19, 0, Math.PI * 2, true)
      s.holes.push(hole)
    }
    const g = new THREE.ExtrudeGeometry(s, { depth, curveSegments: 20, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3 })
    g.translate(0, 0, -depth / 2)
    if (r.vertical) g.rotateZ(Math.PI / 2)
    const [x0, y0] = toWorld(r.x, r.y)
    const [x1, y1] = toWorld(r.vertical ? r.x : r.x + r.len - 1, r.vertical ? r.y + r.len - 1 : r.y)
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0)
    parts.push(paint(nonIndexed(g), colorOf(r)))
  }
  if (!parts.length) return new THREE.BufferGeometry()
  return mergeGeometries(parts)!
}

/** Kirişlerin klasik renkleri: açık gri, koyu gri, kırmızı, sarı, mavi. */
export const BEAM_COLORS = ['#a7adb4', '#5b616b', PALETTE.red, PALETTE.yellow, PALETTE.blue]

/** Dalga efektinin tüm malzemelerce paylaşılan değerleri. */
export interface WaveUniforms {
  uWaveAmp: { value: number }
  uWaveTime: { value: number }
  uWaveCenter: { value: THREE.Vector2 }
  uWavePlayer: { value: THREE.Vector2 }
}

/** Malzemeye bağlı dalga değerleri (addWave ile eklenmiş olmalı). */
export function waveOf(mat: THREE.Material): WaveUniforms {
  return mat.userData.wave as WaveUniforms
}

export function createWaveUniforms(): WaveUniforms {
  return {
    uWaveAmp: { value: 0 },
    uWaveTime: { value: 0 },
    uWaveCenter: { value: new THREE.Vector2() },
    uWavePlayer: { value: new THREE.Vector2(1e4, 1e4) },
  }
}

/**
 * Malzemeye Z ekseninde dairesel dalga ekler: merkezden (çıkış) halka halka
 * yayılır, uzaklaştıkça hafifçe söner, oyuncunun çevresinde sakin kalır.
 * Her parça kendi merkezindeki dalga yüksekliği kadar bütün olarak ileri
 * geri gider (eğilmez, kıvrılmaz).
 */
export function addWave(mat: THREE.Material, u: WaveUniforms) {
  // Gölgelendiricinin okuduğu değerler malzemede tutulur; güncelleyen kod da
  // buradan okur (React'in geliştirme modunda iki kez oluşturmasına karşı)
  mat.userData.wave = u
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWaveAmp;
uniform float uWaveTime;
uniform vec2 uWaveCenter;
uniform vec2 uWavePlayer;
varying float vWaveH;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 waveWorld = vec4( transformed, 1.0 );
// Parçanın merkezi: her tuğla şeklini bozmadan bütün olarak hareket eder
vec4 waveCenter = vec4( 0.0, 0.0, 0.0, 1.0 );
#ifdef USE_BATCHING
	waveWorld = batchingMatrix * waveWorld;
	waveCenter = batchingMatrix * waveCenter;
#endif
#ifdef USE_INSTANCING
	waveWorld = instanceMatrix * waveWorld;
	waveCenter = instanceMatrix * waveCenter;
#endif
waveWorld = modelMatrix * waveWorld;
waveCenter = modelMatrix * waveCenter;
float waveD = distance( waveCenter.xy, uWaveCenter );
float waveCalm = smoothstep( 1.2, 3.2, distance( waveCenter.xy, uWavePlayer ) );
float waveH = uWaveAmp * waveCalm * sin( waveD * 1.25 - uWaveTime * 3.0 ) / ( 1.0 + waveD * 0.035 );
waveWorld.z += waveH;
vWaveH = waveH / 0.4;
vec4 mvPosition = viewMatrix * waveWorld;
gl_Position = projectionMatrix * mvPosition;`,
      )
    // Karşıdan bakınca da görünsün: dalga tepeleri parlar, çukurlar hafif koyulaşır
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vWaveH;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * max( vWaveH, 0.0 ) * 1.1;
diffuseColor.rgb *= 1.0 + min( vWaveH, 0.0 ) * 0.45;`,
      )
  }
  mat.customProgramCacheKey = () => 'wave-v3'
}
