// Headless smoke test: opens index.html, lights the pumpkin, exercises the recording shortcuts,
// saves screenshots to tools/out/. Needs Playwright with Chromium:
//   npm i -D playwright && npx playwright install chromium && node tools/check.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const root = path.resolve(__dirname, '..'), out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(root, 'index.html'));
  const info = () => page.evaluate(() => ({
    zoom: document.getElementById('device').style.zoom,
    state: document.getElementById('screen').dataset.state,
    label: document.getElementById('playLabel').textContent,
    scale: localStorage.getItem('hl-scale')
  }));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(out, '1-dark.png') });
  await page.keyboard.press('Space');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(out, '2-lit.png') });
  console.log('after Space', JSON.stringify(await info()));
  await page.keyboard.press('Minus');
  console.log('after -', JSON.stringify(await info()));
  await page.keyboard.press('Digit0');
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  console.log('after R (reset)', JSON.stringify(await info()));
  await page.waitForTimeout(2500);
  console.log('after R (replayed)', JSON.stringify(await info()));
  const mob = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
  mob.on('pageerror', e => errs.push('mobile pageerror: ' + e.message));
  await mob.goto('file://' + path.join(root, 'index.html'));
  await mob.waitForTimeout(2000);
  await mob.locator('#pkHit').click();
  await mob.waitForTimeout(3500);
  await mob.screenshot({ path: path.join(out, '3-mobile.png') });
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
