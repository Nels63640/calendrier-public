import { test, expect } from '@playwright/test'

test('défilement continu des années, mois et jours, an zéro et futur lointain', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'))
  await page.goto('/calendrier')
  const heading = page.getByRole('heading', { level: 1 })
  const scroll = page.locator('.native-scroll')
  const reveal = async (selector: string) => {
    await page.locator(selector).evaluate((element) => {
      const viewport = element.closest('.native-scroll')!
      viewport.scrollTop +=
        element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + 30
    })
  }
  await expect(heading).toHaveText('2026')
  await reveal('[data-year="2027"]')
  await expect(heading).toHaveText('2027')
  await page.getByRole('button', { name: 'septembre 2027', exact: true }).click()
  await expect(heading).toHaveText('septembre')
  await expect(page.locator('[data-zooming]')).toHaveCount(0)
  await reveal('[data-month="2027-10-01"]')
  await expect(heading).toHaveText('octobre')
  await page.getByRole('button', { name: 'Voir le 2027-10-04', exact: true }).click()
  await expect(heading).toContainText('4 oct.')
  await reveal('[data-day="2027-10-05"]')
  await expect(heading).toContainText('5 oct.')
  await reveal('[data-day="2027-10-04"]')
  await expect(heading).toContainText('4 oct.')
  for (let i = 0; i < 8; i++) {
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.waitForTimeout(80)
  }
  await expect.poll(() => page.locator('[data-day]').count()).toBeLessThanOrEqual(16)
  await page.getByRole('button', { name: 'Aujourd’hui', exact: true }).click()
  await expect(heading).toContainText('25 sept. 2026')
  for (const year of ['0', '10000', '275759']) {
    await page.getByRole('button', { name: 'Choisir une vue' }).last().click()
    await page.getByLabel('Aller à l’année', { exact: true }).fill(year)
    await page.getByRole('button', { name: 'Afficher l’année', exact: true }).click()
    await expect(heading).toHaveText(year)
    if (year === '0') {
      await scroll.evaluate((element) => {
        element.scrollTop = 0
      })
      await expect(page.locator('[data-year="-1"]')).toHaveCount(0)
      await page.getByRole('button', { name: 'janvier 0', exact: true }).click()
      await expect(heading).toHaveText('janvier')
      await page.getByRole('button', { name: 'Voir le 0000-01-01', exact: true }).click()
      await expect(page.locator('[data-day="0000-01-01"]')).toBeAttached()
    }
  }
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  expect(errors).toEqual([])
})

test('le zoom respecte la réduction des animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'))
  await page.goto('/calendrier')
  await page.getByRole('button', { name: 'septembre 2026', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('septembre')
  await expect(page.locator('[data-zooming]')).toHaveCount(0)
})

test('Aujourd’hui revient au vrai jour et le geste ne déclenche aucun repositionnement', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-25T22:21:00Z'))
  await page.goto('/calendrier')
  const heading = page.getByRole('heading', { level: 1 })
  const scroll = page.locator('.native-scroll')
  await page.locator('[data-year="2027"]').evaluate((element) => {
    const viewport = element.closest('.native-scroll')!
    viewport.scrollTop +=
      element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + 100
  })
  await expect(heading).toHaveText('2027')
  for (let n = 0; n < 3; n++) {
    await page.getByRole('button', { name: 'Aujourd’hui', exact: true }).click()
    await expect(heading).toHaveText('2026')
    const today = page.locator('[data-year="2026"] .today')
    await expect(today).toHaveText('26')
    await expect(today).toBeInViewport()
    await expect(today).toHaveCSS('background-color', 'rgb(255, 65, 75)')
  }
  await page.waitForTimeout(350)
  const moves = await scroll.evaluate(async (element) => {
    let calls = 0
    const originalTo = element.scrollTo.bind(element),
      originalBy = element.scrollBy.bind(element)
    element.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
      calls++
      if (typeof options === 'number') originalTo(options, y ?? 0)
      else originalTo(options)
    }
    element.scrollBy = (options?: ScrollToOptions | number, y?: number) => {
      calls++
      if (typeof options === 'number') originalBy(options, y ?? 0)
      else originalBy(options)
    }
    element.dispatchEvent(new Event('touchstart'))
    for (let i = 0; i < 30; i++) {
      element.scrollTop += 150
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const count = calls
    element.dispatchEvent(new Event('touchend'))
    element.scrollTo = originalTo
    element.scrollBy = originalBy
    return count
  })
  expect(moves).toBe(0)
  await page.getByRole('button', { name: 'Aujourd’hui', exact: true }).click()
  await expect(heading).toHaveText('2026')
  await expect(page.locator('[data-year="2026"] .today')).toBeInViewport()
})
