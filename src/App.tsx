import { useEffect, type PointerEvent as RPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Scene } from './Scene.tsx'
import { useGame, LIVES } from './store.ts'
import { CAVES } from './levels.ts'
import { keyDir, press, release, setSnap, clearInput } from './input.ts'
import { setMuted, unlockAudio } from './sfx.ts'

export default function App() {
  const muted = useGame((s) => s.muted)
  useEffect(() => setMuted(muted), [muted])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      unlockAudio()
      const st = useGame.getState()
      const d = keyDir(e.code)
      if (d !== undefined) {
        e.preventDefault()
        if (st.screen === 'playing') press(d)
      }
      if (e.key === 'Shift' || e.key === 'Control') setSnap(true)
      if (e.repeat) return
      switch (e.code) {
        case 'Enter':
        case 'Space':
          e.preventDefault()
          continueGame()
          break
        case 'Escape':
          // Orijinaldeki gibi: sıkışınca mağarayı baştan al (bir can gider)
          if (st.screen === 'playing') st.finish('dead', 0)
          break
        case 'KeyP':
          if (st.screen === 'playing') st.toggle('paused')
          break
        case 'KeyM':
          st.toggle('muted')
          break
        case 'KeyV':
          st.toggle('overview')
          break
      }
    }
    const up = (e: KeyboardEvent) => {
      const d = keyDir(e.code)
      if (d !== undefined) release(d)
      if (e.key === 'Shift' || e.key === 'Control') setSnap(false)
    }
    const blur = () => clearInput()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  return (
    <div className="bd-root">
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 45, near: 0.5, far: 200, position: [0, 0, 30] }} gl={{ antialias: true }}>
        <Scene />
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.9} mipmapBlur />
          <Vignette offset={0.3} darkness={0.7} />
        </EffectComposer>
      </Canvas>
      <HudBar />
      <Overlay />
      <TouchPad />
    </div>
  )
}

function continueGame() {
  unlockAudio()
  const st = useGame.getState()
  switch (st.screen) {
    case 'title':
      st.start(0)
      break
    case 'dead':
    case 'timeout':
      st.retry()
      break
    case 'won':
      st.next()
      break
    case 'gameover':
    case 'complete':
      st.toTitle()
      break
    case 'playing':
      if (st.paused) st.toggle('paused')
      break
  }
}

function HudBar() {
  const screen = useGame((s) => s.screen)
  const hud = useGame((s) => s.hud)
  const level = useGame((s) => s.level)
  const lives = useGame((s) => s.lives)
  const muted = useGame((s) => s.muted)
  const paused = useGame((s) => s.paused)
  const toggle = useGame((s) => s.toggle)
  if (screen === 'title') return null
  return (
    <div className="bd-hud">
      <div className="bd-cave">
        <span className="bd-dim">Mağara {level + 1}</span> {CAVES[level].name}
      </div>
      <div className={`bd-gems ${hud.exitOpen ? 'open' : ''}`}>
        <span className="bd-gem">◆</span>
        <b>{hud.diamonds}</b>/{hud.needed}
        <span className="bd-dim"> ×{hud.value}</span>
      </div>
      <div className={`bd-time ${hud.time <= 10 ? 'warn' : ''}`}>⏱ {hud.time}</div>
      <div className="bd-score">{String(hud.score).padStart(6, '0')}</div>
      <div className="bd-lives">{'♥'.repeat(Math.max(0, lives))}<span className="bd-dim">{'♥'.repeat(Math.max(0, LIVES - lives))}</span></div>
      <div className="bd-buttons">
        <button onClick={() => toggle('paused')} title="Duraklat (P)">{paused ? '▶' : '⏸'}</button>
        <button onClick={() => toggle('overview')} title="Genel görünüm (V)">⛶</button>
        <button onClick={() => toggle('muted')} title="Ses (M)">{muted ? '🔇' : '🔊'}</button>
      </div>
    </div>
  )
}

function Overlay() {
  const screen = useGame((s) => s.screen)
  const level = useGame((s) => s.level)
  const totalScore = useGame((s) => s.totalScore)
  const best = useGame((s) => s.best)
  const lives = useGame((s) => s.lives)
  const paused = useGame((s) => s.paused)
  const start = useGame((s) => s.start)

  if (screen === 'playing' && !paused) return null
  const cont = (label: string) => (
    <button className="bd-primary" onClick={continueGame}>
      {label} <kbd>Enter</kbd>
    </button>
  )

  return (
    <div className="bd-overlay">
      <div className="bd-card">
        {screen === 'title' && (
          <>
            <h1>
              TAŞ AVCISI <span>3B</span>
            </h1>
            <p className="bd-sub">Klasik bir maden oyununa modern bir 3B yorum</p>
            {cont('Oyna')}
            <div className="bd-levels">
              {CAVES.map((c, i) => (
                <button key={c.name} onClick={() => (unlockAudio(), start(i))}>
                  {i + 1}. {c.name}
                </button>
              ))}
            </div>
            <Controls />
            {best > 0 && <p className="bd-dim">Rekor: {best}</p>}
          </>
        )}
        {screen === 'playing' && paused && (
          <>
            <h2>Duraklatıldı</h2>
            {cont('Devam')}
            <Controls />
          </>
        )}
        {(screen === 'dead' || screen === 'timeout') && (
          <>
            <h2>{screen === 'dead' ? 'Ezildin!' : 'Süre doldu!'}</h2>
            <p>
              Kalan can: {lives}. <span className="bd-dim">{CAVES[level].hint}</span>
            </p>
            {cont('Tekrar dene')}
          </>
        )}
        {screen === 'won' && (
          <>
            <h2>Mağara tamamlandı!</h2>
            <p>Toplam puan: {totalScore}</p>
            <p className="bd-dim">
              Sıradaki: <b>{CAVES[level + 1].name}</b>. {CAVES[level + 1].hint}
            </p>
            {cont('Sonraki mağara')}
          </>
        )}
        {screen === 'gameover' && (
          <>
            <h2>Oyun bitti</h2>
            <p>Puan: {totalScore}</p>
            {cont('Ana menü')}
          </>
        )}
        {screen === 'complete' && (
          <>
            <h2>Tüm mağaralar bitti! 🎉</h2>
            <p>Toplam puan: {totalScore}</p>
            {cont('Ana menü')}
          </>
        )}
      </div>
    </div>
  )
}

function Controls() {
  return (
    <ul className="bd-controls">
      <li>
        <kbd>←↑→↓</kbd> / <kbd>WASD</kbd> hareket
      </li>
      <li>
        <kbd>Shift</kbd> + yön: yerinden kıpırdamadan kaz / al
      </li>
      <li>
        <kbd>Esc</kbd> sıkıştıysan baştan al · <kbd>P</kbd> duraklat · <kbd>V</kbd> genel görünüm · <kbd>M</kbd> ses · fare tekerleği yakınlaştır
      </li>
    </ul>
  )
}

function TouchPad() {
  const screen = useGame((s) => s.screen)
  if (screen !== 'playing') return null
  const bind = (d: number) => ({
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      unlockAudio()
      press(d)
    },
    onPointerUp: () => release(d),
    onPointerLeave: () => release(d),
    onPointerCancel: () => release(d),
  })
  return (
    <div className="bd-touch">
      <div className="bd-pad">
        <button className="up" {...bind(0)}>▲</button>
        <button className="left" {...bind(3)}>◀</button>
        <button className="right" {...bind(1)}>▶</button>
        <button className="down" {...bind(2)}>▼</button>
      </div>
      <button
        className="bd-snap"
        onPointerDown={(e) => (e.preventDefault(), setSnap(true))}
        onPointerUp={() => setSnap(false)}
        onPointerLeave={() => setSnap(false)}
      >
        YERİNDE
        <br />
        KAZ
      </button>
    </div>
  )
}
