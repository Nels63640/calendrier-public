import { test, expect, type Locator } from '@playwright/test'

test('balayer les journées conserve les heures et traverse semaines et mois', async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-26T09:00:00Z'))
  await page.goto('/')
  await page.getByRole('button', { name: 'septembre 2026', exact: true }).click()
  await expect(page.locator('[data-zooming]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Voir le 2026-09-26', exact: true }).click()
  const heading = page.getByRole('heading', { level: 1 })
  const viewport = page.locator('.day-scroll')
  const swipe = async (surface: Locator, direction: number, vertical = false) => {
    const rect = await surface.boundingBox()
    if (!rect) throw Error('Surface absente')
    const x = rect.x + rect.width * (direction < 0 ? 0.75 : 0.25)
    const y = rect.y + Math.min(100, rect.height / 2)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + (vertical ? 12 : direction * 140), y + (vertical ? 100 : 5), {
      steps: 8,
    })
    await page.mouse.up()
  }
  const hourOffset = (date: string) =>
    page
      .locator('[data-day="' + date + '"] .native-timeline')
      .evaluate(
        (element) =>
          element.closest('.native-scroll')!.getBoundingClientRect().top -
          element.getBoundingClientRect().top,
      )
  await page.locator('[data-day="2026-09-26"] .native-timeline').evaluate((element) => {
    const scroll = element.closest('.native-scroll')!
    scroll.scrollTop +=
      element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + 675
  })
  await expect(heading).toContainText('26 sept.')
  await page.waitForTimeout(300)
  const offset = await hourOffset('2026-09-26')
  await swipe(viewport, -1)
  await expect(heading).toContainText('27 sept.')
  expect(Math.abs((await hourOffset('2026-09-27')) - offset)).toBeLessThan(2)
  await swipe(viewport, -1)
  await expect(heading).toContainText('28 sept.')
  await expect(
    page.getByRole('button', { name: 'Voir le 2026-09-28', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await swipe(viewport, 1)
  await expect(heading).toContainText('27 sept.')
  await swipe(viewport, 1, true)
  await expect(heading).toContainText('27 sept.')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Le bandeau change aussi de journée, sans activer le bouton sous le doigt.
  for (let n = 0; n < 4; n++) await swipe(page.locator('.native-week-strip'), -1)
  await expect(heading).toContainText('1 oct.')
  await swipe(page.locator('.native-week-strip'), 1)
  await expect(heading).toContainText('30 sept.')
  await page.getByRole('button', { name: 'Voir le 2026-09-29', exact: true }).click()
  await expect(heading).toContainText('29 sept.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await swipe(viewport, -1)
  await expect(heading).toContainText('30 sept.')
  expect(
    await viewport.evaluate((element) => element.getAnimations({ subtree: true }).length),
  ).toBe(0)
  if (browserName === 'chromium' && isMobile) {
    const client = await context.newCDPSession(page)
    const rect = await viewport.boundingBox()
    if (!rect) throw Error('Grille absente')
    const gesture = async (dx: number, dy: number, cancel = false) => {
      const x = rect.x + rect.width * 0.65
      const y = rect.y + 150
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, id: 1 }],
      })
      for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8, id: 1 }],
        })
      }
      await client.send('Input.dispatchTouchEvent', {
        type: cancel ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      })
    }
    await gesture(-150, 5)
    await expect(heading).toContainText('1 oct.')
    await gesture(150, 5)
    await expect(heading).toContainText('30 sept.')
    await gesture(-150, 0, true)
    await expect(heading).toContainText('30 sept.')
    const before = await hourOffset('2026-09-30')
    await gesture(5, -100)
    await expect.poll(() => hourOffset('2026-09-30')).toBeGreaterThan(before + 20)
    await expect(heading).toContainText('30 sept.')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await client.detach()
  }
})
