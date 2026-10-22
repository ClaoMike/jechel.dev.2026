import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderView } from '../../test/render'
import { RichText } from './RichText'

const TEXT = 'Write through [Contact](/contact), read [the paper](/api/files/1/paper.pdf), or see [GitHub](https://github.com).'

describe('links in text (RichText)', () => {
  it('moves to a page of this site within the site, without reloading', async () => {
    const view = await renderView(<RichText text={TEXT} />, { path: '/terms' })
    const contact = page.getByRole('link', { name: 'Contact' })
    expect(contact.element().getAttribute('target')).toBeNull()

    await contact.click()

    await expect.poll(() => view.location()).toBe('/contact')
  })

  it('opens a file of this site as it is, and another site in a new tab', async () => {
    await renderView(<RichText text={TEXT} />)

    const paper = page.getByRole('link', { name: 'the paper' }).element()
    const github = page.getByRole('link', { name: 'GitHub' }).element()
    expect([paper.getAttribute('href'), paper.getAttribute('target')]).toEqual(['/api/files/1/paper.pdf', null])
    expect([github.getAttribute('href'), github.getAttribute('target'), github.getAttribute('rel')]).toEqual(['https://github.com', '_blank', 'noopener noreferrer'])
  })
})
