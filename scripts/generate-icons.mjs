import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const output = new URL('../apps/web/public/icons/', import.meta.url)
await mkdir(output, { recursive: true })
const svg = await readFile(new URL('../apps/web/public/favicon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
try {
  for (const [name, size, maskable] of [
    ['icon-192', 192, false],
    ['icon-512', 512, false],
    ['apple-touch-icon', 180, false],
    ['maskable-512', 512, true],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    const mark = maskable ? svg.replace('rx="19"', 'rx="0"') : svg
    await page.setContent(
      `<html><head><style>html,body{margin:0;background:#101012}svg{width:100vw;height:100vh}</style></head><body>${mark}</body></html>`,
    )
    await page.screenshot({
      path: new URL(`${name}.png`, output).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    })
    await page.close()
  }
} finally {
  await browser.close()
}
