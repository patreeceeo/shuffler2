import { expect, test } from '@playwright/test'

/**
 * PLAN §8: "One Playwright smoke test: load, paste names, generate, shuffle, copy URL,
 * open it in a fresh context, assert the schedule matches."
 */
test('build a rotation, share the link, and reopen it in a fresh context', async ({
  page,
  browser,
}) => {
  await page.goto('/')

  // Land on the demo.
  await expect(page.getByLabel('Name 1')).toHaveValue('Ada')

  await page.getByLabel('Rotation title').fill('Dish duty')

  // Paste a whole list at once — the v1 habit that has to keep working.
  await page.getByLabel('Name 1').click()
  await page.getByLabel('Name 1').selectText()
  await page.evaluate(async () => {
    await navigator.clipboard.writeText('Ada\nGrace\nLinus\nBarbara')
  })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.getByLabel('Name 4')).toHaveValue('Barbara')

  // Generate twelve weekly slots.
  await page.getByLabel('Start date').fill('2026-03-02')
  await page.getByRole('button', { name: 'Generate' }).click()
  const rows = page.locator('table.schedule tbody tr')
  await expect(rows).toHaveCount(12)

  // Every generated slot keeps its 9:00 time across the DST boundary in that window.
  const whenColumn = await page
    .locator('table.schedule tbody tr td:first-child')
    .allInnerTexts()
  expect(whenColumn.every((text) => /9:00|09:00/.test(text))).toBe(true)

  // Shuffle changes the order and pushes a history entry.
  const before = await page
    .locator('table.schedule tbody tr td:last-child')
    .allInnerTexts()
  await page.getByRole('button', { name: /Shuffle/ }).click()
  await expect
    .poll(async () =>
      (await page.locator('table.schedule tbody tr td:last-child').allInnerTexts()).join(
        '|',
      ),
    )
    .not.toBe(before.join('|'))

  const afterShuffle = await page
    .locator('table.schedule tbody tr td:last-child')
    .allInnerTexts()

  // Back is undo.
  await page.goBack()
  await expect
    .poll(async () =>
      (await page.locator('table.schedule tbody tr td:last-child').allInnerTexts()).join(
        '|',
      ),
    )
    .toBe(before.join('|'))
  await page.goForward()
  await expect
    .poll(async () =>
      (await page.locator('table.schedule tbody tr td:last-child').allInnerTexts()).join(
        '|',
      ),
    )
    .toBe(afterShuffle.join('|'))

  // The share link reproduces the rotation exactly in a fresh context.
  const shareUrl = await page
    .getByRole('textbox', { name: 'Shareable link' })
    .inputValue()
  expect(shareUrl).toContain('#s=')

  const fresh = await browser.newContext()
  const freshPage = await fresh.newPage()
  await freshPage.goto(shareUrl)
  await expect(freshPage.locator('table.schedule tbody tr')).toHaveCount(12)
  const reopened = await freshPage
    .locator('table.schedule tbody tr td:last-child')
    .allInnerTexts()
  expect(reopened).toEqual(afterShuffle)
  await expect(freshPage).toHaveTitle(/Dish duty/)
  await fresh.close()
})

test('a v1 link still opens, and is rewritten into the new form', async ({ page }) => {
  await page.goto(
    '/?items=Ada&items=Grace&items=Linus&randomizer=3&rotationStart=2026-09-17',
  )
  await expect(page.getByLabel('Name 1')).toHaveValue('Ada')
  await expect(page).toHaveURL(/#s=/)
  expect(new URL(page.url()).search).toBe('')
  // v1's hardcoded group size of two, finally visible.
  await expect(page.getByLabel(/People per slot/)).toHaveValue('2')
})

test('a corrupted link recovers with a dismissible notice instead of a blank page', async ({
  page,
}) => {
  await page.goto('/#s=thisisnotavalidblob')
  await expect(page.getByText(/looked corrupted/i)).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText(/looked corrupted/i)).toHaveCount(0)
})
