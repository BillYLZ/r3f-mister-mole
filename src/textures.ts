// Prosedürel (canvas ile üretilen) dokular: dışarıdan görsel dosyası gerekmez.
import * as THREE from 'three'
import { mulberry32 } from './engine.ts'

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void, seed = 1) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  draw(g, mulberry32(seed))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function speckle(g: CanvasRenderingContext2D, rnd: () => number, size: number, n: number, colors: string[], r0: number, r1: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)]
    const r = r0 + rnd() * (r1 - r0)
    g.beginPath()
    g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2)
    g.fill()
  }
}

export function makeTextures() {
  const dirt = canvasTexture(128, (g, rnd) => {
    g.fillStyle = '#7a4b26'
    g.fillRect(0, 0, 128, 128)
    speckle(g, rnd, 128, 500, ['#5c3519', '#8f5c30', '#6a3f1f', '#a06a3a'], 1, 4)
    speckle(g, rnd, 128, 40, ['#3d2412', '#b98652'], 2, 5)
  })

  const brick = canvasTexture(128, (g, rnd) => {
    g.fillStyle = '#3a2a24'
    g.fillRect(0, 0, 128, 128)
    const bh = 32
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? -32 : 0
      for (let col = -1; col < 3; col++) {
        const x = off + col * 64 + 3
        const y = row * bh + 3
        const shade = 0.85 + rnd() * 0.3
        g.fillStyle = `rgb(${Math.round(150 * shade)},${Math.round(62 * shade)},${Math.round(44 * shade)})`
        g.fillRect(x, y, 58, bh - 6)
        g.fillStyle = 'rgba(255,255,255,0.08)'
        g.fillRect(x, y, 58, 3)
      }
    }
    speckle(g, rnd, 128, 200, ['rgba(0,0,0,0.18)', 'rgba(255,220,200,0.08)'], 0.5, 1.8)
  }, 2)

  const steel = canvasTexture(128, (g, rnd) => {
    const grd = g.createLinearGradient(0, 0, 128, 128)
    grd.addColorStop(0, '#9aa4b0')
    grd.addColorStop(1, '#59626e')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 128; i += 2) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`
      g.fillRect(0, i, 128, 1)
    }
    g.strokeStyle = 'rgba(20,24,30,0.7)'
    g.lineWidth = 4
    g.strokeRect(6, 6, 116, 116)
    for (const [x, y] of [[18, 18], [110, 18], [18, 110], [110, 110]]) {
      g.fillStyle = '#2b3038'
      g.beginPath()
      g.arc(x, y, 6, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#c9d1db'
      g.beginPath()
      g.arc(x - 1.5, y - 1.5, 3, 0, Math.PI * 2)
      g.fill()
    }
  }, 3)

  const rock = canvasTexture(256, (g, rnd) => {
    g.fillStyle = '#1b1714'
    g.fillRect(0, 0, 256, 256)
    speckle(g, rnd, 256, 900, ['#241e19', '#14110f', '#2c241d', '#0e0c0a'], 2, 10)
  }, 4)
  rock.wrapS = rock.wrapT = THREE.RepeatWrapping
  rock.repeat.set(12, 7)

  const rockBump = canvasTexture(128, (g, rnd) => {
    g.fillStyle = '#808080'
    g.fillRect(0, 0, 128, 128)
    speckle(g, rnd, 128, 300, ['#606060', '#a0a0a0', '#505050', '#b0b0b0'], 2, 9)
  }, 5)

  return { dirt, brick, steel, rock, rockBump }
}
