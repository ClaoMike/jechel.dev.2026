import { expect, test as setup } from '@playwright/test'
import { TERMS_ACCEPTED } from './termsState.ts'

setup('accept the terms', async ({ page }) => {
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: 'Welcome to jechel.dev' })
  await expect(dialog.getByRole('checkbox')).toHaveCount(3)
  for (const box of await dialog.getByRole('checkbox').all()) await box.check()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toBeHidden()

  await page.context().storageState({ path: TERMS_ACCEPTED })
})
