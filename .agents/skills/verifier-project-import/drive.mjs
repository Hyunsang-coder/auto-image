import { chromium } from '@playwright/test'

// Usage: node drive.mjs [out-dir]  (run make-sample.sh <out-dir> first)
const OUT = process.argv[2] ?? '/tmp/verify-import'
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/app/'
const SHOTS = `${OUT}/shots`
const FOLDER = `${OUT}/folder`
const FILES = [
  'manifest.json',
  'screenshot-copy.csv',
  '01-home.ko.png',
  '01-home.en.png',
  '02-decks.ko.png',
  '04-review.ko.png',
].map((f) => `${FOLDER}/${f}`)
const log = (...a) => console.log('::', ...a)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

// Count img: blobs WITHOUT ever creating the DB — an unversioned open() on a
// missing DB would create it store-less and break idb-keyval's upgrade.
const idbCount = () =>
  page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    if (!dbs.some((d) => d.name === 'keyval-store')) return 0
    return new Promise((res) => {
      const open = indexedDB.open('keyval-store')
      open.onsuccess = () => {
        const db = open.result
        try {
          if (!db.objectStoreNames.contains('keyval')) { db.close(); return res(0) }
          const tx = db.transaction('keyval', 'readonly')
          const req = tx.objectStore('keyval').getAllKeys()
          req.onsuccess = () => { db.close(); res(req.result.filter((k) => String(k).startsWith('img:')).length) }
          req.onerror = () => { db.close(); res(-1) }
        } catch { db.close(); res(-1) }
      }
      open.onerror = () => res(-1)
    })
  })

await page.goto(BASE_URL)
// Fresh launch = fresh profile, but clear anyway so the script also works
// against a long-lived profile. Clear store CONTENTS, never delete the DB
// (a blocked delete + unversioned reopen leaves a store-less DB behind).
await page.evaluate(async () => {
  localStorage.clear()
  const dbs = await indexedDB.databases()
  if (!dbs.some((d) => d.name === 'keyval-store')) return
  await new Promise((res) => {
    const open = indexedDB.open('keyval-store')
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('keyval')) { db.close(); return res(undefined) }
      const tx = db.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').clear()
      tx.oncomplete = () => { db.close(); res(undefined) }
      tx.onerror = () => { db.close(); res(undefined) }
    }
    open.onerror = () => res(undefined)
  })
})
await page.reload()
await page.getByText('프로젝트 가져오기').first().waitFor()
await page.screenshot({ path: `${SHOTS}/01-setup.png` })
log('idb blobs at start:', await idbCount())

// --- happy path ---
const importInput = page.locator('input[accept=".json,.csv,image/*"]')
await importInput.setInputFiles(FILES)
const summary = page.locator('p', { hasText: /슬라이드 \d+장 · 스크린샷 \d+개 · 캡션 \d+개 적용/ })
await summary.waitFor()
log('modal summary:', (await summary.textContent()).trim())
log('happy-path warning visible:', await page.getByText(/경고 \d+건 보기/).isVisible())
await page.screenshot({ path: `${SHOTS}/02-modal.png` })
await page.getByRole('button', { name: '에디터에서 검수 →' }).click()

const thumbs = page.locator('nav:has(button[aria-label]) button[aria-label]')
await thumbs.first().waitFor()
log('thumbs:', await thumbs.count(), JSON.stringify(await thumbs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))))
log('idb blobs after commit:', await idbCount())
await page.waitForTimeout(1000)
await page.screenshot({ path: `${SHOTS}/03-editor-slide1-ko.png` })
for (let i = 1; i < 4; i++) {
  await thumbs.nth(i).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOTS}/0${3 + i}-editor-slide${i + 1}-ko.png` })
}

// --- per-locale: slide 1 has its own en screenshot; ja borrows the base ---
await thumbs.nth(0).click()
await page.waitForTimeout(400)
const localeSel = page.locator('select[title^="편집 언어"]')
await localeSel.selectOption('en')
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/07-editor-slide1-en.png` })
await localeSel.selectOption('ja')
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/08-editor-slide1-ja.png` })
await localeSel.selectOption('')
await page.waitForTimeout(300)

// --- localize table ---
await page.getByRole('button', { name: '로컬라이즈' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOTS}/09-localize.png`, fullPage: true })

// --- probe A: re-import over existing → overwrite note; cancel → gc sweep ---
await page.getByRole('button', { name: '프로젝트' }).click()
await importInput.setInputFiles(FILES)
await summary.waitFor()
log('overwrite note visible:', await page.getByText(/현재 편집 중인 프로젝트를 덮어씁니다/).isVisible())
log('idb blobs during dry-run:', await idbCount())
await page.screenshot({ path: `${SHOTS}/10-reimport-modal.png` })
await page.getByRole('button', { name: '취소' }).click()
await page.waitForTimeout(1200)
log('idb blobs after cancel+gc:', await idbCount())
await page.getByRole('button', { name: '에디터' }).click()
await thumbs.first().waitFor()
log('thumbs after cancelled re-import:', await thumbs.count())

// --- probe B: garbage file + manifest-only ---
await page.getByRole('button', { name: '프로젝트' }).click()
await importInput.setInputFiles([`${FOLDER}/manifest.json`, `${OUT}/readme.txt`])
await summary.waitFor()
log('garbage summary:', (await summary.textContent()).trim())
const warnToggle = page.getByText(/경고 \d+건 보기/)
log('garbage warning visible:', await warnToggle.isVisible())
await warnToggle.click()
log('garbage issues:', (await page.locator('details ul').textContent()).trim())
await page.screenshot({ path: `${SHOTS}/11-garbage-modal.png` })
await page.getByRole('button', { name: '취소' }).click()

// --- probe C: double-select rapid fire (same input twice quickly) ---
await importInput.setInputFiles(FILES)
await summary.waitFor()
await page.getByRole('button', { name: '취소' }).click()
await page.waitForTimeout(300)
await importInput.setInputFiles(FILES)
await summary.waitFor()
log('probe C second modal summary:', (await summary.textContent()).trim())
await page.getByRole('button', { name: '취소' }).click()
await page.waitForTimeout(800)
log('idb blobs at end:', await idbCount())

log('console errors:', errors.length ? JSON.stringify(errors) : 'none')
await browser.close()
