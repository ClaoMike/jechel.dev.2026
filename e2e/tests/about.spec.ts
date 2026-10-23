import { expect, test } from './fixtures.ts'

// About Me: its sections, folding them away (remembered), the map's zoom, the skills.

const SECTIONS = ['Photo and links', "Where I've been", 'Problem solving', 'Skills', 'Work experience']

test('shows every section, each with its heading', async ({ page }) => {
  await page.goto('/about')
  for (const name of SECTIONS) await expect(page.getByRole('region', { name })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Links' }).getByRole('link', { name: 'GitHub' })).toBeVisible()
})

test('a section folds away and opens again, and stays folded after a reload', async ({ page }) => {
  await page.goto('/about')
  const skills = page.getByRole('region', { name: 'Skills' })
  await skills.getByRole('button', { name: 'Collapse Skills' }).click()
  await expect(skills.getByRole('button', { name: 'Expand Skills' })).toHaveAttribute('aria-expanded', 'false')
  await expect(skills.getByRole('list', { name: 'Skills, with when and how each was used' })).toBeHidden()
  await page.reload()
  await expect(skills.getByRole('button', { name: 'Expand Skills' })).toBeVisible()
  await skills.getByRole('button', { name: 'Expand Skills' }).click()
  await expect(skills.getByRole('list', { name: 'Skills, with when and how each was used' })).toBeVisible()
})

test('the map zooms in and back out to the whole world', async ({ page }) => {
  await page.goto('/about')
  const map = page.getByRole('region', { name: "Where I've been" })
  await expect(map.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
  await map.getByRole('button', { name: 'Zoom in' }).click()
  await expect(map.getByRole('button', { name: 'Zoom out' })).toBeEnabled()
  await expect(map.getByRole('button', { name: 'Show the whole world' })).toBeEnabled()
  await map.getByRole('button', { name: 'Show the whole world' }).click()
  await expect(map.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
})

test('a place on the map says what happened there', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('group', { name: 'World map' }).getByRole('button', { name: /^London, England, United Kingdom\. Visited\./ })).toBeVisible()
})
