// Oyun motoru için davranış testleri: node --experimental-strip-types scripts/check-game.ts
import { T, createGame, step, tilesFromRows, at, countTiles, type CaveSettings, type Game, type Input } from '../src/engine.ts'
import { CAVES, W, H, buildCave } from '../src/levels.ts'
import { findBarRuns } from '../src/v3/bricks.ts'

let failed = 0
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? `  (${info})` : ''}`)
  if (!ok) failed++
}

const NONE: Input = { dir: -1, snap: false }
const settings: CaveSettings = { needed: 1, time: 100, value: 10, extra: 20, seed: 7 }
function game(rows: string[], s = settings): Game {
  const { w, h, tiles } = tilesFromRows(rows)
  return createGame(w, h, tiles, s)
}
const run = (g: Game, n: number, input = NONE) => {
  for (let i = 0; i < n; i++) step(g, input)
}

// Taş düşer ve toprağa oturur
{
  const g = game(['WWWWW', 'W r W', 'W   W', 'W   W', 'W...W', 'WWWWW'])
  run(g, 3)
  check('taş boşluğa düşer ve toprakta durur', at(g, 2, 3).t === T.BOULDER && !at(g, 2, 3).falling)
}

// Taş başka bir taşın üstünden yuvarlanır (önce sola)
{
  const g = game(['WWWWW', 'W r W', 'W r W', 'W...W', 'WWWWW'])
  run(g, 2)
  check('taş taşın üstünden sola yuvarlanır', at(g, 1, 2).t === T.BOULDER)
}

// Duran taş oyuncuya zarar vermez, düşen taş öldürür
{
  const g = game(['WWWWWWW', 'W  r  W', 'W  .  W', 'W  .  W', 'W     W', 'W..P..W', 'WWWWWWW'])
  run(g, 20)
  check('oyuncu giriş kapısından doğar', at(g, 3, 5).t === T.PLAYER)
  // taşın altındaki toprağı kazmak için oyuncu yukarı kazar
  step(g, { dir: 0, snap: false }) // (3,4) boşluk -> taşın altına doğru
  step(g, { dir: 0, snap: false }) // (3,3) toprak kaz
  check('oyuncu yukarı kazar', g.player.y === 3)
  run(g, 3)
  check('duran taşın altında oyuncu sağ kalır', g.status === 'playing')
  step(g, { dir: 0, snap: false }) // (3,2) toprağı kaz; taş hemen üstte
  run(g, 1)
  // oyuncu kaçmazsa taş düşmez (oyuncunun üstünde duruyordu); kaçınca ve geri gelince düşen taş öldürür
  step(g, { dir: 2, snap: false })
  step(g, { dir: 2, snap: false })
  run(g, 1)
  check('düşen taşın altına girilirse ölünür', countTiles(g, T.BOULDER) === 1)
}

// Taşın düşerek oyuncuya çarpması
{
  const g = game(['WWWWW', 'W r W', 'W   W', 'W   W', 'W   W', 'WWWWW'])
  const p = at(g, 2, 4)
  p.t = T.PLAYER
  p.id = 999
  g.player = { x: 2, y: 4, alive: true, spawned: true }
  run(g, 4)
  check('düşen taş oyuncuyu patlatır', g.status === 'dead' && countTiles(g, T.EXPLODE) > 0)
  run(g, 6)
  check('patlama sonrası boşluk kalır', countTiles(g, T.EXPLODE) === 0 && countTiles(g, T.DIAMOND) === 0)
}

// Elmas toplama ve kapının açılması
{
  const g = game(['WWWWWWW', 'WPd.X.W', 'WWWWWWW'], { ...settings, needed: 1 })
  run(g, 15)
  check('kapı başta kapalı', !g.exitOpen)
  step(g, { dir: 1, snap: false })
  check('elmas toplanır, kapı açılır', g.diamonds === 1 && g.exitOpen && g.score === 10)
  step(g, { dir: 1, snap: false })
  step(g, { dir: 1, snap: false })
  check('açık kapıdan çıkılır', g.status === 'won')
}

// Yerinde kazma (snap): oyuncu kıpırdamaz
{
  const g = game(['WWWWW', 'WPd.W', 'WWWWW'])
  run(g, 15)
  step(g, { dir: 1, snap: true })
  check('yerinde alma: oyuncu yerinde kalır, elmas alınır', g.player.x === 1 && g.diamonds === 1 && at(g, 2, 1).t === T.SPACE)
}

// Taş itme
{
  const g = game(['WWWWWW', 'WPr  W', 'WWWWWW'])
  run(g, 15)
  let pushed = false
  for (let i = 0; i < 40 && !pushed; i++) {
    step(g, { dir: 1, snap: false })
    pushed = at(g, 3, 1).t === T.BOULDER
  }
  check('taş sağa itilebilir', pushed && g.player.x === 2)
}

// Ateşböceği duvar takip eder ve oyuncuya değince patlar
{
  // Ortası toprak sütunlu halka koridor: ateşböceği sol duvarını takip ederek dolaşır
  const g = game(['WWWWWWW', 'Wq    W', 'W ... W', 'W     W', 'WWWWWWW'])
  const seen = new Set<string>()
  for (let i = 0; i < 30; i++) {
    step(g, NONE)
    const c = g.cells.findIndex((c) => c.t === T.FIREFLY)
    seen.add(`${c % g.w},${Math.floor(c / g.w)}`)
  }
  check('ateşböceği halkayı dolaşır', seen.size === 12, `${seen.size} farklı hücre`)
  check('ateşböceği toprağa girmez', countTiles(g, T.DIRT) === 3)
}
{
  const g = game(['WWWWWW', 'W q  W', 'WWWWWW'])
  const p = at(g, 3, 1)
  p.t = T.PLAYER
  p.id = 999
  g.player = { x: 3, y: 1, alive: true, spawned: true }
  step(g, NONE)
  check('ateşböceği oyuncuya değince patlar', g.status === 'dead')
}

// Kelebek ezilince elmas bırakır
{
  const g = game(['WWWWWWW', 'W  r  W', 'W     W', 'W     W', 'W  B  W', 'WWWWWWW'])
  // kelebeği hareketsiz tutmak için çevresini toprakla doldur
  for (const [x, y] of [[2, 4], [4, 4], [1, 4], [5, 4]]) at(g, x, y).t = T.DIRT
  run(g, 4)
  run(g, 8)
  check('kelebek ezilince 3x3 elmas', countTiles(g, T.DIAMOND) >= 6, `${countTiles(g, T.DIAMOND)} elmas`)
}

// Sihirli duvar taşı elmasa çevirir
{
  const g = game(['WWWWW', 'W r W', 'W   W', 'WWMWW', 'W   W', 'W...W', 'WWWWW'])
  run(g, 8)
  check('sihirli duvar taşı elmasa çevirir', at(g, 2, 4).t === T.DIAMOND && countTiles(g, T.BOULDER) === 0)
}

// Kapalı alandaki amip elmasa döner
{
  const g = game(['WWWWWW', 'Wa...W', 'W....W', 'WWWWWW'], { ...settings, amoebaTime: 0 })
  run(g, 200)
  check('kapalı amip elmasa dönüşür', countTiles(g, T.AMOEBA) === 0 && countTiles(g, T.DIAMOND) === 8)
}

// Süre dolması
{
  const g = game(['WWWW', 'WP.W', 'WWWW'], { ...settings, time: 2 })
  run(g, 60)
  check('süre dolunca oyun biter', g.status === 'timeout')
}

// Sürüm 3: duvar hücreleri tek parça çubuklara bölünür, her hücre tam bir kez
{
  const rows = ['wwww.', 'w....', 'w..w.', '...w.']
  const isWall = (x: number, y: number) => rows[y][x] === 'w'
  const runs = findBarRuns(isWall, 5, 4)
  const cover = new Map<string, number>()
  for (const r of runs)
    for (let k = 0; k < r.len; k++) {
      const key = r.vertical ? `${r.x},${r.y + k}` : `${r.x + k},${r.y}`
      cover.set(key, (cover.get(key) ?? 0) + 1)
    }
  const walls = rows.join('').split('').filter((c) => c === 'w').length
  const once = [...cover.values()].every((n) => n === 1) && cover.size === walls
  const shape = runs.map((r) => `${r.vertical ? 'd' : 'y'}${r.len}`).sort().join(' ')
  check('duvar çubukları: her hücre tam bir kez', once, shape)
  check('duvar çubukları: yatay 4 + dikey 2 + dikey 2', shape === 'd2 d2 y4')
  for (const cave of CAVES) {
    const tiles = buildCave(cave)
    const r = findBarRuns((x, y) => tiles[y * W + x] === T.WALL, W, H)
    const n = r.reduce((a, b) => a + b.len, 0)
    const total = tiles.filter((t) => t === T.WALL).length
    if (n !== total) check(`  "${cave.name}" duvarları çubuklara eksiksiz bölünür`, false, `${n}/${total}`)
  }
}

// Seviyeler: boyut, kenarlar, giriş/çıkış, yeterli elmas potansiyeli, rastgele oyunla çökme yok
for (const cave of CAVES) {
  const tiles = buildCave(cave)
  const border = tiles.every((t, i) => {
    const x = i % W
    const y = Math.floor(i / W)
    return x > 0 && y > 0 && x < W - 1 && y < H - 1 ? true : t === T.STEEL || t === T.EXIT
  })
  const count = (t: number) => tiles.filter((x) => x === t).length
  const potential = count(T.DIAMOND) + 9 * count(T.BUTTERFLY) + (count(T.AMOEBA) ? 40 : 0) + (count(T.MAGIC) ? 30 : 0)
  check(
    `mağara "${cave.name}"`,
    tiles.length === W * H && border && count(T.INBOX) === 1 && count(T.EXIT) === 1 && potential >= cave.needed,
    `elmas ${count(T.DIAMOND)}, potansiyel ${potential} / gerekli ${cave.needed}`,
  )
  {
    // Oyuncu bir şey yapmadan düşmanlar kendiliğinden ölmemeli (ör. kafese taş düşmesi)
    const idle = createGame(W, H, tiles, cave)
    const enemies = (gm: Game) => countTiles(gm, T.FIREFLY) + countTiles(gm, T.BUTTERFLY)
    const n0 = enemies(idle)
    run(idle, 40)
    check(`  boşta 5 sn: düşmanlar yerinde`, enemies(idle) === n0, `${enemies(idle)}/${n0}`)
  }
  const g = createGame(W, H, tiles, cave)
  let maxPlayers = 0
  const rnd = Math.random
  for (let i = 0; i < 2000; i++) {
    step(g, { dir: Math.floor(rnd() * 5) - 1, snap: rnd() < 0.1 })
    maxPlayers = Math.max(maxPlayers, countTiles(g, T.PLAYER))
  }
  check(`  rastgele 2000 tick: en fazla bir oyuncu`, maxPlayers <= 1)
}

if (failed) {
  console.error(`\n${failed} kontrol başarısız`)
  process.exit(1)
}
console.log('\nTüm oyun kontrolleri geçti')
