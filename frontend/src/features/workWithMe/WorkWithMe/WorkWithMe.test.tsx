import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../../layout/theme'
import { ApiError } from '../../../services/api'
import { a11yViolations } from '../../../test/a11y'
import { stubApi } from '../../../test/api'
import { ADMIN, renderView, shootWhole, textOf } from '../../../test/render'
import { WorkWithMe } from './WorkWithMe'

// Work with me (in Feature Testing for now): what I offer, how a project goes, and the price, which only the admin can change.

const price = () => page.getByRole('region', { name: 'Price' })
const editButton = () => page.getByRole('button', { name: 'Edit the price' })
const currency = () => page.getByRole('combobox', { name: 'Currency' })
const amount = () => page.getByRole('textbox', { name: 'Amount, an hour' })

describe('Work with me', () => {
  it('says what I do (websites end to end, APIs, and automations for companies) and nothing before it', async () => {
    stubApi()
    await renderView(<WorkWithMe />)
    const services = page.getByRole('region', { name: 'What I do' }).getByRole('listitem')
    await expect.poll(() => services.elements().map((li) => li.querySelector('strong')!.textContent)).toEqual(['Websites, end to end', 'APIs', 'Automations for your company'])
    expect(services.elements().every((li) => li.querySelector('svg'))).toBe(true)
    expect(document.querySelector('.work-with-me')!.firstElementChild!.getAttribute('aria-labelledby')).toBe('work-services-title')
  })

  it('says how a project goes, in order', async () => {
    stubApi()
    await renderView(<WorkWithMe />)
    const steps = page.getByRole('region', { name: 'How it works' }).getByRole('listitem')
    await expect
      .poll(() => steps.elements().map((li) => li.querySelector('strong')!.textContent))
      .toEqual(['A free call or meeting', 'A plan', 'The plan, presented', 'Price, then building'])
    expect(page.getByRole('region', { name: 'How it works' }).getByRole('list').element().tagName).toBe('OL')
  })

  it('has no form of its own any more', async () => {
    stubApi()
    await renderView(<WorkWithMe />)
    await expect.element(price()).toBeVisible()
    expect(page.getByRole('form').query()).toBeNull()
    expect(page.getByRole('textbox').query()).toBeNull()
  })
})

describe('the price', () => {
  it("is the API's, agreed once the plan is seen", async () => {
    const api = stubApi()
    api.workWithMe.getPrice.mockResolvedValue({ currency: 'RON', amount: 120 })
    await renderView(<WorkWithMe />)
    await expect.poll(() => textOf(price())).toContain('120 lei an hour')
    expect(textOf(price())).toContain("The final price is agreed together, once you've seen the plan.")
  })

  it('shows a placeholder while it loads, and says so if it can’t be loaded', async () => {
    const api = stubApi()
    api.workWithMe.getPrice.mockReturnValue(new Promise(() => {}))
    const loading = await renderView(<WorkWithMe />)
    await expect.element(price().getByRole('status')).toHaveTextContent('Loading the price…')
    await loading.unmount()

    api.workWithMe.getPrice.mockRejectedValue(new ApiError('/api/work-with-me/price', 500))
    await renderView(<WorkWithMe />)
    await expect.element(price().getByText("The price couldn't be loaded.")).toBeVisible()
    expect(editButton().query()).toBeNull()
  })

  it("can't be changed by visitors: no Edit", async () => {
    stubApi()
    await renderView(<WorkWithMe />)
    await expect.poll(() => textOf(price())).toContain('€25 an hour')
    expect(editButton().query()).toBeNull()
  })

  it('is changed by the admin: a currency from the list and an amount, then everyone sees it', async () => {
    const api = stubApi({ user: ADMIN })
    await renderView(<WorkWithMe />, { user: ADMIN })
    await editButton().click()
    await expect.element(currency()).toHaveTextContent('EUREuro')
    await expect.element(amount()).toHaveValue('25')

    await currency().click()
    await page.getByRole('option', { name: /GBP/ }).click()
    await expect.element(currency()).toHaveTextContent('GBPBritish pound')
    await amount().fill('30,50')
    await page.getByRole('button', { name: 'Save' }).click()

    expect(api.workWithMe.savePrice).toHaveBeenCalledWith({ currency: 'GBP', amount: 30.5 })
    await expect.poll(() => textOf(price())).toContain('£30.50 an hour')
    expect(page.getByRole('form', { name: 'Edit the price' }).query()).toBeNull()
  })

  it('says what is wrong with the amount before sending it', async () => {
    const api = stubApi({ user: ADMIN })
    await renderView(<WorkWithMe />, { user: ADMIN })
    await editButton().click()
    for (const [typed, message] of [
      ['', 'Give an amount like 25 or 30.50 (at most two decimals).'],
      ['25.005', 'Give an amount like 25 or 30.50 (at most two decimals).'],
      ['abc', 'Give an amount like 25 or 30.50 (at most two decimals).'],
      ['0', 'Give an amount more than 0 and at most 100,000.'],
      ['100000.01', 'Give an amount more than 0 and at most 100,000.'],
    ]) {
      await amount().fill(typed)
      await page.getByRole('button', { name: 'Save' }).click()
      await expect.element(page.getByText(message)).toBeVisible()
      await expect.element(amount()).toHaveAttribute('aria-invalid', 'true')
    }
    expect(api.workWithMe.savePrice).not.toHaveBeenCalled()
  })

  it("says why the API didn't save it, keeping the draft, and Cancel leaves the price as it was", async () => {
    const api = stubApi({ user: ADMIN })
    api.workWithMe.savePrice
      .mockRejectedValueOnce(new ApiError('/api/work-with-me/price', 400, { currency: ['Pick one of: EUR, RON.'] }))
      .mockRejectedValueOnce(new ApiError('/api/work-with-me/price', 401))
    await renderView(<WorkWithMe />, { user: ADMIN })
    await editButton().click()
    await amount().fill('40')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.element(page.getByRole('alert')).toHaveTextContent('Pick one of: EUR, RON.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.element(page.getByRole('alert')).toHaveTextContent('Your session has ended. Sign in again, then save.')
    await expect.element(amount()).toHaveValue('40')

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(() => textOf(price())).toContain('€25 an hour')
  })
})

describe('Work with me, screenshots and accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: as visitors see it, and the admin choosing a currency, with no WCAG problems`, async () => {
      stubApi({ user: ADMIN })
      await renderView(
        <section className="card">
          <WorkWithMe />
        </section>,
        { theme, user: ADMIN },
      )
      await expect.poll(() => textOf(price())).toContain('€25 an hour')
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), theme)

      await editButton().click()
      await currency().click()
      await expect.element(page.getByRole('listbox')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-editing`)
    })
  }
})
