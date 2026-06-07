// Record a promo demo video of the studio's core story:
//   English-only import → empty Localize columns → CSV import fills 9 languages
//   → Export preview re-renders per locale → ZIP of every slide × language.
//
// Everything on screen is the REAL app UI driven headless via Playwright, plus a
// painted-on cursor (the OS file dialog can't be captured headless, so the file
// pick is done programmatically — no fake dialog is shown). Records to .webm,
// then transcodes to H.264 .mp4 (X/Threads-friendly) if an ffmpeg is found.
//
//   node .claude/skills/promo-video/record-demo.mjs \
//     --in <en-only-import-dir> --csv <translated.csv> --out <out.mp4>
//
// Flags: --base-url <url> (default http://localhost:5173/app/), --keep-webm,
//        --width 1280 --height 800.
import { chromium } from '@playwright/test'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readdir, readdir as _r, rm, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}
const has = (name) => argv.includes(`--${name}`)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const IN_DIR = flag('in')
const CSV = flag('csv')
const OUT = flag('out', join(ROOT, 'promo.mp4'))
const BASE_URL = flag('base-url', process.env.BASE_URL ?? 'http://localhost:5173/app/')
const W = Number(flag('width', '1280'))
const H = Number(flag('height', '800'))
const VID_DIR = join(dirname(resolve(OUT)), '.promo-rec')
const log = (...a) => console.log('::', ...a)

if (!IN_DIR || !CSV) {
  console.error('Usage: record-demo.mjs --in <en-only-dir> --csv <translated.csv> --out <out.mp4>')
  process.exit(2)
}

const IMPORT_EXTS = new Set(['.json', '.csv', '.png', '.jpg', '.jpeg', '.webp'])
const files = (await readdir(IN_DIR))
  .filter((f) => IMPORT_EXTS.has(extname(f).toLowerCase()))
  .map((f) => join(IN_DIR, f))

// reuse a running dev server, else start one and tear it down at the end
const ping = () => fetch(BASE_URL).then((r) => r.ok, () => false)
let server = null
if (!(await ping())) {
  log('starting dev server…')
  server = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', detached: true })
  const deadline = Date.now() + 30_000
  while (!(await ping())) {
    if (Date.now() > deadline) { console.error('no dev server on ' + BASE_URL); process.exit(1) }
    await new Promise((r) => setTimeout(r, 300))
  }
}

await rm(VID_DIR, { recursive: true, force: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: W, height: H },
  locale: 'en-US',
  recordVideo: { dir: VID_DIR, size: { width: W, height: H } },
})
let lastDurMs = 0
try {
  const page = await context.newPage()
  const t0 = Date.now()
  const sleep = (ms) => page.waitForTimeout(ms)

  await page.goto(BASE_URL)
  await page.getByText('Import Project').first().waitFor()

  // painted-on cursor (Playwright's real cursor isn't captured in the video)
  await page.evaluate(() => {
    const c = document.createElement('div')
    c.id = '__cursor'
    Object.assign(c.style, {
      position: 'fixed', left: '640px', top: '500px', width: '22px', height: '22px',
      borderRadius: '50%', background: 'rgba(35,35,35,0.5)', border: '2px solid #fff',
      boxShadow: '0 1px 5px rgba(0,0,0,0.45)', zIndex: 2147483647, pointerEvents: 'none',
      transform: 'translate(-50%,-50%)',
      transition: 'left 0.32s cubic-bezier(.3,.7,.4,1), top 0.32s cubic-bezier(.3,.7,.4,1)',
    })
    document.body.appendChild(c)
  })
  const moveTo = async (x, y) => {
    await page.evaluate(([x, y]) => {
      const c = document.getElementById('__cursor')
      c.style.left = x + 'px'; c.style.top = y + 'px'
    }, [x, y])
    await sleep(380)
  }
  const pulse = () => page.evaluate(() => {
    document.getElementById('__cursor').animate(
      [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(0.65)' }, { transform: 'translate(-50%,-50%) scale(1)' }],
      { duration: 280 })
  })
  const at = async (locator) => {
    const b = await locator.boundingBox()
    return [b.x + b.width / 2, b.y + b.height / 2]
  }
  const hoverLoc = async (l) => { const [x, y] = await at(l); await moveTo(x, y); await pulse() }
  const clickLoc = async (l) => { const [x, y] = await at(l); await moveTo(x, y); await pulse(); await page.mouse.click(x, y) }

  // ---- scene 1: import the English-only set
  await sleep(800)
  await page.locator('input[accept=".json,.csv,image/*"]').setInputFiles(files)
  await page.getByRole('button', { name: 'Review in Editor →' }).waitFor({ timeout: 30_000 })
  await sleep(1200)
  await clickLoc(page.getByRole('button', { name: 'Review in Editor →' }))
  log('scene 1 done')

  // ---- scene 2: editor — browse a few slides (by thumbnail index, data-agnostic)
  await page.locator('canvas').first().waitFor()
  await sleep(1300)
  const thumbs = page.locator('button[draggable="true"]')
  const n = await thumbs.count()
  for (const i of [Math.min(1, n - 1), Math.min(n - 1, 4), 0]) {
    await clickLoc(thumbs.nth(i))
    await sleep(720)
  }
  log('scene 2 done')

  // ---- scene 3: Localize — empty target columns, then CSV import fills them
  await clickLoc(page.getByRole('button', { name: '3 Localize' }))
  await sleep(1000)
  await moveTo(W / 2, H * 0.56)
  await page.evaluate(() => {
    window.__sc = [...document.querySelectorAll('div')]
      .find((e) => e.scrollWidth - e.clientWidth > 200 && e.clientHeight > 250)
  })
  const scrollRight = async (reps) => {
    for (let i = 0; i < reps; i++) {
      await page.evaluate(() => window.__sc && window.__sc.scrollBy({ left: 420, behavior: 'smooth' }))
      await sleep(420)
    }
  }
  await scrollRight(3)
  await sleep(900) // hold on the empty "No translation" columns

  const chooserP = page.waitForEvent('filechooser')
  await clickLoc(page.getByRole('button', { name: 'Import', exact: true }))
  ;(await chooserP).setFiles(resolve(CSV))
  await sleep(1100) // table fills
  await page.evaluate(() => window.__sc && window.__sc.scrollTo({ left: 0, behavior: 'smooth' }))
  await sleep(600)
  await scrollRight(3)
  await sleep(800)
  log('scene 3 done')

  // ---- scene 4: Export — re-render preview in two non-source locales, then ZIP
  await clickLoc(page.getByRole('button', { name: '4 Export' }))
  await page.locator('img').first().waitFor({ timeout: 20_000 })
  await sleep(900)
  const sel = page.locator('select')
  const opts = await sel.locator('option').allInnerTexts()
  const sourceValue = await sel.inputValue() // currently selected = source locale
  const sourceLabel = await sel.locator(`option[value="${sourceValue}"]`).innerText().catch(() => '')
  const picks = opts.filter((o) => o !== sourceLabel).slice(0, 2)
  for (const label of picks) {
    await hoverLoc(sel)
    await sel.selectOption({ label })
    await sleep(3000) // previews re-render in that locale
  }
  const exportBtn = page.getByRole('button', { name: /Export ZIP · \d+ PNGs/ })
  await clickLoc(exportBtn)
  await sleep(3500) // show render progress
  log('scene 4 done')

  lastDurMs = Date.now() - t0
} finally {
  await context.close() // flushes the .webm
  await browser.close()
  if (server) try { process.kill(-server.pid) } catch { /* gone */ }
}

const webm = (await _r(VID_DIR)).find((f) => f.endsWith('.webm'))
const webmPath = join(VID_DIR, webm)
log('recorded', webm, `(~${Math.round(lastDurMs / 1000)}s)`)

// transcode to H.264 mp4 if an ffmpeg is reachable
const ffmpeg = (() => {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg'
  try { return createRequire(import.meta.url)('ffmpeg-static') } catch { return null }
})()

if (!ffmpeg) {
  await rename(webmPath, OUT.replace(/\.mp4$/, '.webm'))
  await rm(VID_DIR, { recursive: true, force: true })
  log('no ffmpeg found — saved .webm instead:', OUT.replace(/\.mp4$/, '.webm'))
  log('  install one for mp4:  brew install ffmpeg   (or: npm i -D ffmpeg-static)')
} else {
  const fadeAt = Math.max(0.5, lastDurMs / 1000 - 1.0)
  const r = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-i', webmPath,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-vf', `fade=t=out:st=${fadeAt.toFixed(1)}:d=1.0`, '-an', '-y', OUT,
  ], { stdio: 'inherit' })
  await rm(VID_DIR, { recursive: true, force: true })
  if (r.status !== 0) { console.error(':: ffmpeg failed'); process.exit(1) }
  log('saved', OUT)
}
