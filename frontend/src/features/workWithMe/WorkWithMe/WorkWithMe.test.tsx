import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../../layout/theme'
import { api } from '../../../services/api'
import { a11yViolations } from '../../../test/a11y'
import { renderView, shootWhole, textOf } from '../../../test/render'
import { WorkWithMe } from './WorkWithMe'

// Work with me (in Feature Testing for now): what I offer, how a project goes, the price, and a form to start one.

const LONG = 'We have a spreadsheet of orders that someone copies into our shop system by hand every morning. Could you automate it for us?'

describe('Work with me', () => {
  it('says what I do: websites end to end, APIs, and automations for companies', async () => {
    await renderView(<WorkWithMe />)
    const services = page.getByRole('region', { name: 'What I do' }).getByRole('listitem')
    await expect.poll(() => services.elements().map((li) => li.querySelector('strong')!.textContent)).toEqual(['Websites, end to end', 'APIs', 'Automations for your company'])
    expect(services.elements().every((li) => li.querySelector('svg'))).toBe(true)
  })

  it('says how a project goes, in order', async () => {
    await renderView(<WorkWithMe />)
    const steps = page.getByRole('region', { name: 'How it works' }).getByRole('listitem')
    await expect
      .poll(() => steps.elements().map((li) => li.querySelector('strong')!.textContent))
      .toEqual(['A free call or meeting', 'A plan', 'The plan, presented', 'Price, then building'])
    expect(page.getByRole('region', { name: 'How it works' }).getByRole('list').element().tagName).toBe('OL')
  })

  it('gives the hourly price, agreed once the plan is seen', async () => {
    await renderView(<WorkWithMe />)
    const price = page.getByRole('region', { name: 'Price' })
    await expect.poll(() => textOf(price)).toContain('€25 an hour')
    expect(textOf(price)).toContain("The final price is agreed together, once you've seen the plan.")
  })

  it('sends a project enquiry from its own form', async () => {
    const send = vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<WorkWithMe />)
    await expect.element(page.getByRole('heading', { name: 'Tell me about your project' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Name' }).fill('Ada')
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
    await page.getByRole('textbox', { name: 'Message' }).fill(LONG)
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect.element(page.getByRole('status')).toHaveTextContent("Your message was sent. I'll get back to you at ada@example.com.")
    expect(send).toHaveBeenCalledWith({ name: 'Ada', email: 'ada@example.com', message: LONG, topic: 'project' })
  })
})

describe('Work with me, screenshots and accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      await renderView(
        <section className="card">
          <WorkWithMe />
        </section>,
        { theme },
      )
      await expect.element(page.getByRole('heading', { name: 'Tell me about your project' })).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), theme)
    })
  }
})
