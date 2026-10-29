// Draws the link preview image (frontend/public/og-image.jpg, 1200 × 630): what LinkedIn, Slack, WhatsApp and the
// rest show when someone pastes a link to the site. The Riviera art, with the site's name in its own font.
// Run from the repository root after changing the art or the words: node scripts/build_link_preview.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const asDataUrl = (path, type) => `data:${type};base64,${readFileSync(new URL(path, import.meta.url)).toString('base64')}`
const art = asDataUrl('../frontend/src/widgets/background/artwork/riviera-3840.webp', 'image/webp')
const font = asDataUrl('../frontend/node_modules/@fontsource/mr-dafoe/files/mr-dafoe-latin-400-normal.woff2', 'font/woff2')

const page = `<!doctype html>
<html><head><style>
  @font-face { font-family: 'Mr Dafoe'; src: url(${font}) format('woff2'); }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { background: url(${art}) center 40% / cover; position: relative; font-family: -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif; }
  .words { position: absolute; right: 64px; top: 56px; text-align: right; color: #fff; text-shadow: 0 2px 14px rgb(20 10 60 / 0.55); }
  .brand { text-shadow: none; font-family: 'Mr Dafoe', cursive; font-size: 132px; line-height: 1.25; padding: 0 12px 0 60px; margin-bottom: -20px;
    background: linear-gradient(90deg, #ff5cc0, #b07bff); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 2px 0 rgb(40 0 70 / 0.75)) drop-shadow(0 0 5px rgb(255 120 210 / 0.6)); }
  .name { margin-top: 18px; font-size: 44px; font-weight: 700; letter-spacing: 0.5px; }
  .what { margin-top: 8px; font-size: 28px; font-weight: 500; opacity: 0.95; }
</style></head>
<body><div class="words"><div class="brand">jechel.dev</div><div class="name">Claudiu Mihai Jechel</div><div class="what">Apps · Videos · Experience</div></div></body></html>`

const browser = await chromium.launch()
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await tab.setContent(page)
await tab.evaluate(() => document.fonts.ready)
writeFileSync(new URL('../frontend/public/og-image.jpg', import.meta.url), await tab.screenshot({ type: 'jpeg', quality: 86 }))
await browser.close()
console.log('frontend/public/og-image.jpg')
