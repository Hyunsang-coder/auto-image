// Stamps the shared header and footer into every static page (root index.html,
// en/index.html, public/**/*.html) between <!-- site:header --> and
// <!-- site:footer --> markers. It can't be a single include: each page's
// language menu points at its own sibling, read from the page's hreflang links.
//
//   npm run site:chrome               rewrite the pages
//   npm run site:chrome -- --check    exit 1 if any page is out of date (CI)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SITE = 'https://screenshotstudio.dev'
const GH = 'https://github.com/Hyunsang-coder/auto-image'
const check = process.argv.includes('--check')

const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'
const CHEV = '<svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>'
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>'
const OPEN = '<svg class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
const CLOSE = '<svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'

const COPY = {
  ko: {
    home: '/', skip: '본문으로 건너뛰기', navLabel: '주요 메뉴', mobileLabel: '모바일 메뉴', menu: '메뉴',
    langLabel: '언어 선택, 현재 한국어', current: '한국어', download: '다운로드', downloadMac: 'Mac용 무료 다운로드',
    nav: [['/#features', '기능'], ['/guides/ko/how-to-use.html', '사용법'], ['/guides/ko/mcp-agent.html', 'AI 에이전트'], ['/#guides', '가이드'], [GH, 'GitHub']],
    tagline: 'App Store 스크린샷을 만드는 무료 오픈소스 Mac 앱.',
    cols: [
      ['제품', [[GH + '/releases/latest', 'Mac용 다운로드'], ['/#features', '기능'], [GH + '/releases', '릴리스 노트'], [GH, '소스 코드']]],
      ['가이드', [['/guides/ko/how-to-use.html', '사용법'], ['/guides/ko/mcp-agent.html', 'AI 에이전트 연결'], ['/guides/ko/app-store-screenshot-sizes.html', '스크린샷 사이즈'], ['/guides/ko/app-store-screenshot-localization.html', '현지화'], ['/guides/ko/upload-app-store-screenshots-fastlane.html', 'fastlane 업로드']]],
      ['정보', [['/ko/about.html', '소개'], ['/blog/ko/why-i-built-screenshot-studio.html', '블로그'], ['/ko/privacy.html', '개인정보처리방침'], [GH + '/issues', '문의하기']]],
    ],
    copyright: '© 2026 Hyunsang Joo. MIT 라이선스로 공개된 오픈소스입니다.',
  },
  en: {
    home: '/en/', skip: 'Skip to content', navLabel: 'Main', mobileLabel: 'Mobile', menu: 'Menu',
    langLabel: 'Language, currently English', current: 'English', download: 'Download', downloadMac: 'Download for Mac',
    nav: [['/en/#features', 'Features'], ['/guides/how-to-use.html', 'How to use'], ['/guides/mcp-agent.html', 'AI agents'], ['/en/#guides', 'Guides'], [GH, 'GitHub']],
    tagline: 'A free, open-source Mac app for App Store screenshots.',
    cols: [
      ['Product', [[GH + '/releases/latest', 'Download for Mac'], ['/en/#features', 'Features'], [GH + '/releases', 'Release notes'], [GH, 'Source code']]],
      ['Guides', [['/guides/how-to-use.html', 'How to use'], ['/guides/mcp-agent.html', 'Connect an AI agent'], ['/guides/app-store-screenshot-sizes.html', 'Screenshot sizes'], ['/guides/app-store-screenshot-localization.html', 'Localization'], ['/guides/upload-app-store-screenshots-fastlane.html', 'fastlane upload']]],
      ['About', [['/about.html', 'About'], ['/blog/why-i-built-screenshot-studio.html', 'Blog'], ['/privacy.html', 'Privacy policy'], [GH + '/issues', 'Contact']]],
    ],
    copyright: '© 2026 Hyunsang Joo. Open source under the MIT License.',
  },
}

function langMenu(t, lang, paths, up, indent) {
  const items = [['ko', '한국어'], ['en', 'English']].map(([l, name]) =>
    l === lang
      ? `${indent}    <li><a href="${paths[l]}" lang="${l}" hreflang="${l}" aria-current="true">${name}${CHECK}</a></li>`
      : `${indent}    <li><a href="${paths[l]}" lang="${l}" hreflang="${l}">${name}</a></li>`)
  return [
    `${indent}<details class="lang-menu${up ? ' lang-menu--up' : ''}">`,
    `${indent}  <summary aria-label="${t.langLabel}">${GLOBE}<span>${t.current}</span>${CHEV}</summary>`,
    `${indent}  <ul class="lang-menu__list">`,
    ...items,
    `${indent}  </ul>`,
    `${indent}</details>`,
  ].join('\n')
}

function chrome(lang, self, paths) {
  const t = COPY[lang]
  const navLinks = (indent) => t.nav.map(([href, label]) =>
    `${indent}<a href="${href}"${href === self ? ' aria-current="page"' : ''}>${label}</a>`).join('\n')
  const mobileLang = [['ko', '한국어'], ['en', 'English']].map(([l, name]) =>
    `            <a href="${paths[l]}" lang="${l}" hreflang="${l}"${l === lang ? ' aria-current="true"' : ''}>${name}</a>`).join('\n')
  const header = `<a class="skip-link" href="#main">${t.skip}</a>
<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="brand" href="${t.home}"><img class="brand-mark" src="/favicon.svg" alt="" width="28" height="28" /><span class="brand-name">Screenshot Studio</span></a>
    <nav class="site-nav" aria-label="${t.navLabel}">
${navLinks('      ')}
    </nav>
    <div class="site-actions">
${langMenu(t, lang, paths, false, '      ')}
      <a class="btn btn-primary btn-sm" href="${GH}/releases/latest">${t.download}</a>
      <details class="menu-toggle">
        <summary aria-label="${t.menu}">${OPEN}${CLOSE}</summary>
        <div class="menu-panel">
          <nav aria-label="${t.mobileLabel}">
${navLinks('            ')}
          </nav>
          <div class="menu-lang">
${mobileLang}
          </div>
          <a class="btn btn-primary" href="${GH}/releases/latest">${t.downloadMac}</a>
        </div>
      </details>
    </div>
  </div>
</header>`
  const cols = t.cols.map(([title, links]) => `    <nav aria-label="${title}">
      <h2>${title}</h2>
      <ul>
${links.map(([href, label]) => `        <li><a href="${href}">${label}</a></li>`).join('\n')}
      </ul>
    </nav>`).join('\n')
  const footer = `<footer class="site-footer">
  <div class="wrap site-footer__grid">
    <div class="site-footer__about">
      <a class="brand" href="${t.home}"><img class="brand-mark" src="/favicon.svg" alt="" width="28" height="28" /><span class="brand-name">Screenshot Studio</span></a>
      <p>${t.tagline}</p>
${langMenu(t, lang, paths, true, '      ')}
    </div>
${cols}
  </div>
  <div class="wrap site-footer__bottom">
    <p>${t.copyright}</p>
  </div>
</footer>
<script src="/site.js" defer></script>`
  return { header, footer }
}

function pages() {
  const out = ['index.html', 'en/index.html']
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (entry.name.endsWith('.html')) out.push(rel)
    }
  }
  walk('public')
  return out
}

function urlPath(rel) {
  if (rel === 'index.html') return '/'
  if (rel === 'en/index.html') return '/en/'
  return '/' + relative('public', rel)
}

function stamp(html, name, body, rel) {
  const re = new RegExp(`<!-- site:${name} -->[\\s\\S]*?<!-- /site:${name} -->`)
  if (!re.test(html)) throw new Error(`${rel}: missing <!-- site:${name} --> markers`)
  return html.replace(re, () => `<!-- site:${name} -->\n${body}\n<!-- /site:${name} -->`)
}

const stale = []
for (const rel of pages()) {
  const html = readFileSync(join(ROOT, rel), 'utf8')
  const lang = html.match(/<html lang="(ko|en)"/)?.[1]
  if (!lang) throw new Error(`${rel}: <html lang> must be ko or en`)
  const paths = {}
  for (const l of ['ko', 'en']) {
    paths[l] = html.match(new RegExp(`hreflang="${l}" href="${SITE}([^"]+)"`))?.[1]
    if (!paths[l]) throw new Error(`${rel}: missing the hreflang="${l}" link`)
  }
  if (!html.includes('<script src="/lang.js"></script>')) throw new Error(`${rel}: missing <script src="/lang.js"></script> in <head>`)
  const { header, footer } = chrome(lang, urlPath(rel), paths)
  const next = stamp(stamp(html, 'header', header, rel), 'footer', footer, rel)
  if (next === html) continue
  stale.push(rel)
  if (!check) writeFileSync(join(ROOT, rel), next)
}

if (check && stale.length) {
  console.error(`site chrome is out of date in ${stale.length} page(s) — run npm run site:chrome\n  ${stale.join('\n  ')}`)
  process.exit(1)
}
console.log(check ? 'site chrome up to date' : `site chrome: rewrote ${stale.length} page(s)`)
