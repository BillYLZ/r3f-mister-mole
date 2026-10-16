import { useEffect, type PointerEvent as RPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { Scene } from './Scene.tsx'
import { SceneV2 } from './v2/SceneV2.tsx'
import { SceneV3 } from './v3/SceneV3.tsx'
import { useGame, LIVES } from './store.ts'
import { CAVES } from './levels.ts'
import { keyDir, press, release, setSnap, clearInput } from './input.ts'
import { setMuted, unlockAudio } from './sfx.ts'

const CA_OFFSET = new Vector2(0.0008, 0.0008)

export default function App() {
  const muted = useGame((s) => s.muted)
  const version = useGame((s) => s.version)
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
      {version === 1 ? (
        <Canvas key="v1" shadows="percentage" dpr={[1, 2]} camera={{ fov: 45, near: 0.5, far: 200, position: [0, 0, 30] }} gl={{ antialias: true }}>
          <Scene />
          <EffectComposer multisampling={4}>
            <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.9} mipmapBlur />
            <Vignette offset={0.3} darkness={0.7} />
          </EffectComposer>
        </Canvas>
      ) : version === 3 ? (
        <Canvas key="v3" shadows="soft" dpr={[1, 2]} camera={{ fov: 42, near: 0.5, far: 200, position: [0, 0, 30] }} gl={{ antialias: true }}>
          <SceneV3 />
          <EffectComposer multisampling={4}>
            <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.8} mipmapBlur />
            <Vignette offset={0.35} darkness={0.55} />
          </EffectComposer>
        </Canvas>
      ) : (
        <Canvas key="v2" shadows="soft" dpr={[1, 2]} camera={{ fov: 42, near: 0.5, far: 200, position: [0, 0, 30] }} gl={{ antialias: true }}>
          <SceneV2 />
          <EffectComposer multisampling={4}>
            <Bloom luminanceThreshold={0.55} luminanceSmoothing={0.3} intensity={1.5} radius={0.75} mipmapBlur />
            <ChromaticAberration offset={CA_OFFSET} radialModulation modulationOffset={0.35} />
            <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.35} />
            <Vignette offset={0.22} darkness={0.92} />
          </EffectComposer>
        </Canvas>
      )}
      {version !== 1 && <DangerEdge />}
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
  const version = useGame((s) => s.version)
  if (screen === 'title') return null
  return (
    <div className={version === 1 ? 'bd-hud' : `bd-hud v2${version === 3 ? ' v3' : ''}`}>
      <div className="bd-cave">
        <span className="bd-dim">Mağara {level + 1}</span> {CAVES[level].name}
      </div>
      <div className={`bd-gems ${hud.exitOpen ? 'open' : ''}`}>
        {version !== 1 ? <GemRing value={hud.diamonds} max={hud.needed} open={hud.exitOpen} /> : <span className="bd-gem">◆</span>}
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
              MISTER <span>MOLE</span>
            </h1>
            <p className="bd-sub">Klasik bir maden oyununa modern bir 3B yorum</p>
            <VersionPicker />
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

function VersionPicker() {
  const version = useGame((s) => s.version)
  const setVersion = useGame((s) => s.setVersion)
  return (
    <div className="bd-version" role="radiogroup" aria-label="Sürüm">
      <button role="radio" aria-checked={version === 1} className={version === 1 ? 'on' : ''} onClick={() => setVersion(1)}>
        <b>Sürüm 1</b>
        <span>Klasik</span>
      </button>
      <button role="radio" aria-checked={version === 2} className={version === 2 ? 'on' : ''} onClick={() => setVersion(2)}>
        <b>Sürüm 2</b>
        <span>Modern · karanlık mağara</span>
      </button>
      <button role="radio" aria-checked={version === 3} className={version === 3 ? 'on' : ''} onClick={() => setVersion(3)}>
        <b>Sürüm 3</b>
        <span>Oyuncak tuğla</span>
      </button>
    </div>
  )
}

/** Sürüm 2: toplanan elmas oranını gösteren halka. */
function GemRing({ value, max, open }: { value: number; max: number; open: boolean }) {
  const r = 11
  const c = 2 * Math.PI * r
  const k = max > 0 ? Math.min(1, value / max) : 1
  return (
    <svg className={`bd-ring ${open ? 'open' : ''}`} viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
      <circle cx="14" cy="14" r={r} className="track" />
      <circle cx="14" cy="14" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - k)} />
      <path d="M14 8 L18 12 L14 20 L10 12 Z" className="gem" />
    </svg>
  )
}

/** Sürüm 2: süre azalınca ekran kenarları kırmızı nabız atar. */
function DangerEdge() {
  const screen = useGame((s) => s.screen)
  const time = useGame((s) => s.hud.time)
  const on = screen === 'playing' && time > 0 && time <= 10
  return <div className={`bd-danger ${on ? 'on' : ''}`} />
}
