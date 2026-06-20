import { chromium } from 'playwright-core'
const L = process.env.CLAUDE_JOB_DIR + '/tmp/loop'
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const p = await b.newPage({
  colorScheme: 'light',
  viewport: { width: 760, height: 1500 },
  deviceScaleFactor: 2,
})
await p.goto('file://' + L + '/showcase.html')
await p.waitForTimeout(600)
const has = await p.evaluate(() => !!document.querySelector('.vp-compare'))
console.log('has compare:', has)
const box = await p.evaluate(() => {
  const r = document.querySelector('.vp-compare').getBoundingClientRect()
  return { x: 40, y: r.top + window.scrollY - 8, width: 700, height: 360 }
})
console.log('box', JSON.stringify(box))
await p.evaluate(y => window.scrollTo(0, y), box.y - 40)
await p.waitForTimeout(300)
await p.screenshot({
  path: L + '/shots/compare-aligned.png',
  clip: { x: 40, y: 32, width: 700, height: 360 },
})
console.log('captured')
await b.close()
