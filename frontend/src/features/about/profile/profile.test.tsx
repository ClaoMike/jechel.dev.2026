import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError, type ResumeContact } from '../../../services/api'
import { ABOUT } from '../../../test/fixtures/about'
import { renderView, textOf } from '../../../test/render'
import type { Profile } from './profile'
import { ProfileSection } from './ProfileSection/ProfileSection'

const PROFILE: Profile = { photoUrl: ABOUT.photoUrl, statuses: ABOUT.statuses, links: ABOUT.links }
const CONTACT: ResumeContact = { headline: 'Full-stack engineer', email: 'me@example.com', phone: '+44 7700 900123' }

function renderProfile({
  value = PROFILE,
  headline,
  canEdit = false,
  onSave = vi.fn(async () => {}),
  onRetryContact,
  leetCodeUsername = 'jechel',
}: { value?: Profile; headline?: string; canEdit?: boolean; onSave?: (p: Profile) => Promise<void>; onRetryContact?: () => void; leetCodeUsername?: string } = {}) {
  return renderView(<ProfileSection value={value} headline={headline} canEdit={canEdit} onSave={onSave} onRetryContact={onRetryContact} leetCodeUsername={leetCodeUsername} />)
}

const privateLine = () => page.getByText('Only you see this:').element().closest('.profile-private')!
const privateItems = () => [...privateLine().querySelectorAll('li')].map((li) => li.textContent)

const link = (name: string) => page.getByRole('list', { name: 'Links' }).getByRole('link', { name })
const form = () => page.getByRole('form', { name: 'Edit Photo and links' })

describe('Photo and links, for a visitor', () => {
  it('shows the photo, the name and the citizenship labels with their flags and links', async () => {
    await renderProfile()
    await expect.element(page.getByRole('img', { name: 'Claudiu Jechel' })).toHaveAttribute('src', ABOUT.photoUrl)
    await expect.element(page.getByText('Claudiu Mihai Jechel')).toBeVisible()
    const labels = page.getByRole('list', { name: 'Citizenship and residence' })
    await expect.poll(() => textOf(labels)).toBe('Romanian citizenshipUK Settled Status')
    expect(labels.element().querySelectorAll('img.flag')).toHaveLength(2)
    await expect.element(labels.getByRole('link', { name: 'Settled Status' })).toHaveAttribute('target', '_blank')
  })

  it('links to the résumé (a download) and the profiles (new tabs), leaving out the empty ones', async () => {
    await renderProfile()
    await expect.element(link('Download résumé')).toHaveAttribute('download', '')
    await expect.element(link('Download résumé')).not.toHaveAttribute('target')
    await expect.element(link('GitHub')).toHaveAttribute('href', 'https://github.com/jechel')
    await expect.element(link('GitHub')).toHaveAttribute('rel', 'noopener noreferrer')
    await expect.element(link('LeetCode')).toHaveAttribute('href', 'https://leetcode.com/u/jechel/')
    await expect.element(link('LinkedIn')).toBeVisible()
    await expect.element(link('Instagram')).not.toBeInTheDocument()
    expect(page.getByRole('list', { name: 'Links' }).getByRole('link').elements().map((a) => a.textContent)).toEqual(['Download résumé', 'GitHub', 'LeetCode', 'LinkedIn'])
  })

  it('never links somewhere unsafe, and has no LeetCode link without a username', async () => {
    await renderProfile({ value: { ...PROFILE, links: { ...PROFILE.links, gitHubUrl: 'javascript:alert(1)' } }, leetCodeUsername: '' })
    await expect.element(link('Download résumé')).toBeVisible()
    await expect.element(link('GitHub')).not.toBeInTheDocument()
    await expect.element(link('LeetCode')).not.toBeInTheDocument()
  })

  it('shows a placeholder without a photo, and nothing without labels', async () => {
    await renderProfile({ value: { ...PROFILE, photoUrl: '', statuses: [] } })
    await expect.element(page.getByRole('img', { name: 'Photo placeholder' })).toBeVisible()
    await expect.element(page.getByRole('list', { name: 'Citizenship and residence' })).not.toBeInTheDocument()
    await expect.element(page.getByText(/No citizenship or residence labels yet/)).not.toBeInTheDocument()
  })

  it('shows the headline under the name', async () => {
    await renderProfile({ headline: '  Full-stack engineer · .NET, React  ' })
    const name = page.getByText('Claudiu Mihai Jechel')
    const headline = page.getByText('Full-stack engineer · .NET, React')
    await expect.element(headline).toBeVisible()
    expect(headline.element().textContent).toBe('Full-stack engineer · .NET, React')
    expect(name.element().nextElementSibling).toBe(headline.element())
  })

  it('shows the name alone without a headline', async () => {
    await renderProfile({ headline: '   ' })
    await expect.element(page.getByText('Claudiu Mihai Jechel')).toBeVisible()
    expect(document.querySelector('.profile-headline')).toBeNull()
    await renderProfile()
    expect(document.querySelector('.profile-headline')).toBeNull()
  })

  it('has no Edit button and no private details', async () => {
    await renderProfile()
    await expect.element(page.getByRole('button', { name: 'Edit Photo and links' })).not.toBeInTheDocument()
    await expect.element(page.getByText('Only you see this:')).not.toBeInTheDocument()
  })
})

describe('Photo and links, for the admin', () => {
  it('shows where labels go, and only the email and phone as private, each with a copy button', async () => {
    await renderProfile({ canEdit: true, headline: CONTACT.headline, value: { ...PROFILE, statuses: [], contact: CONTACT } })
    await expect.element(page.getByText('No citizenship or residence labels yet. Use Edit to add them.')).toBeVisible()
    await expect.element(page.getByText('Only you see this:')).toBeVisible()
    expect(privateItems()).toEqual(['me@example.com', '+44 7700 900123'])
    // The headline is under the name, for everyone; not in the private part.
    expect(privateLine().textContent).not.toContain(CONTACT.headline)
    await expect.element(page.getByRole('button', { name: 'Copy email' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Copy phone number' })).toBeVisible()
    // Each button comes before what it copies.
    const [email, phone] = privateLine().querySelectorAll('li')
    expect(email.firstElementChild).toBe(page.getByRole('button', { name: 'Copy email' }).element())
    expect(phone.firstElementChild).toBe(page.getByRole('button', { name: 'Copy phone number' }).element())
  })

  it('copies the email and the phone number', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await renderProfile({ canEdit: true, value: { ...PROFILE, contact: CONTACT } })
    await page.getByRole('button', { name: 'Copy email' }).click()
    expect(writeText).toHaveBeenLastCalledWith('me@example.com')
    await expect.element(page.getByRole('button', { name: 'Copy email' })).toHaveAttribute('title', 'Copied!')
    await page.getByRole('button', { name: 'Copy phone number' }).click()
    expect(writeText).toHaveBeenLastCalledWith('+44 7700 900123')
    await expect.poll(() => textOf(page.getByRole('status').filter({ hasText: 'copied' }).last())).toBe('phone number copied')
  })

  it('says when copying fails', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await renderProfile({ canEdit: true, value: { ...PROFILE, contact: CONTACT } })
    await page.getByRole('button', { name: 'Copy email' }).click()
    await expect.element(page.getByRole('button', { name: 'Copy email' })).toHaveAttribute('title', "Couldn't copy")
  })

  it('leaves out an empty email or phone', async () => {
    await renderProfile({ canEdit: true, value: { ...PROFILE, contact: { ...CONTACT, email: ' ' } } })
    expect(privateItems()).toEqual(['+44 7700 900123'])
    await expect.element(page.getByRole('button', { name: 'Copy email' })).not.toBeInTheDocument()
  })

  it('says how to fill in an empty private line', async () => {
    await renderProfile({ canEdit: true, value: { ...PROFILE, contact: { headline: 'Engineer', email: '', phone: '' } } })
    expect(privateLine().textContent).toBe('Only you see this: no email or phone for the résumé yet. Use Edit to add them.')
    await expect.element(page.getByRole('button', { name: /^Copy/ })).not.toBeInTheDocument()
  })

  it("says when the résumé's private details couldn't be loaded, with a retry", async () => {
    const onRetryContact = vi.fn()
    await renderProfile({ canEdit: true, onRetryContact })
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("Your résumé's phone, email and headline couldn't be loaded.")
    await page.getByRole('button', { name: 'Try again' }).click()
    expect(onRetryContact).toHaveBeenCalledOnce()
  })

  it('edits the private details and the links, then saves them all', async () => {
    const onSave = vi.fn(async () => {})
    await renderProfile({ canEdit: true, onSave, value: { ...PROFILE, contact: CONTACT } })
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    await form().getByRole('textbox', { name: 'Headline' }).fill('Engineer')
    await form().getByRole('textbox', { name: 'Phone' }).fill('')
    await form().getByRole('textbox', { name: 'Instagram URL' }).fill('https://instagram.com/jechel')
    await form().getByRole('textbox', { name: 'GitHub URL' }).fill('')
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({
      ...PROFILE,
      contact: { ...CONTACT, headline: 'Engineer', phone: '' },
      links: { ...PROFILE.links, gitHubUrl: '', instagramUrl: 'https://instagram.com/jechel' },
    })
  })

  it("colours the email and phone fields' labels like the admin's tabs (only the admin sees them); the headline keeps the theme's", async () => {
    await renderProfile({ canEdit: true, value: { ...PROFILE, contact: CONTACT } })
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    const label = (name: string) => form().getByText(name, { exact: true }).element()
    for (const name of ['Email', 'Phone']) expect(getComputedStyle(label(name)).backgroundImage).toBe('linear-gradient(90deg, rgb(217, 18, 137), rgb(153, 66, 240))')
    expect(getComputedStyle(label('Headline')).backgroundImage).toBe('none')
  })

  it('has no private details to edit when there are none (they failed to load)', async () => {
    await renderProfile({ canEdit: true })
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    await expect.element(form().getByRole('textbox', { name: 'Headline' })).not.toBeInTheDocument()
  })

  it('adds labels, guessing the flag from the words until one is picked; moves and removes them', async () => {
    const onSave = vi.fn(async () => {})
    await renderProfile({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    await form().getByRole('button', { name: 'Add label' }).click()
    const third = form().getByRole('group', { name: 'Label 3' })
    await third.getByRole('textbox', { name: 'Label' }).fill('Danish residence')
    await expect.element(third.getByRole('combobox', { name: 'Flag' })).toHaveValue('DK')
    await third.getByRole('combobox', { name: 'Flag' }).selectOptions('Romania')
    await third.getByRole('textbox', { name: 'Label' }).fill('Danish residence permit')
    await expect.element(third.getByRole('combobox', { name: 'Flag' })).toHaveValue('RO')
    await form().getByRole('button', { name: 'Move label 3 up' }).click()
    await form().getByRole('button', { name: 'Remove label 1' }).click()
    await page.getByRole('dialog', { name: 'Remove label 1?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({ ...PROFILE, statuses: [{ text: 'Danish residence permit', flag: 'RO' }, PROFILE.statuses[1]] })
  })

  it('keeps a flag that is no longer in the list, under its code', async () => {
    await renderProfile({ canEdit: true, value: { ...PROFILE, statuses: [{ text: 'Old label', flag: 'XK' }] } })
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    await expect.element(form().getByRole('combobox', { name: 'Flag' })).toHaveValue('XK')
  })

  it('uploads a new photo into the draft, and removes the photo after asking', async () => {
    vi.spyOn(api.files, 'uploadPhoto').mockResolvedValue({ url: '/api/files/photos/new.webp', fileName: 'new.webp' })
    const onSave = vi.fn(async () => {})
    await renderProfile({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    await expect.element(form().getByRole('button', { name: 'Replace photo' })).toBeVisible()
    await form().getByLabelText('Photo file').upload(new File([new Uint8Array(10)], 'me.png', { type: 'image/png' }))
    await expect.element(form().getByRole('img', { name: 'Claudiu Jechel' })).toHaveAttribute('src', '/api/files/photos/new.webp')
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenLastCalledWith({ ...PROFILE, photoUrl: '/api/files/photos/new.webp' })

    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    await form().getByRole('button', { name: 'Remove photo' }).click()
    await page.getByRole('dialog', { name: 'Remove the photo?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await expect.element(form().getByRole('img', { name: 'Photo placeholder' })).toBeVisible()
    await expect.element(form().getByRole('button', { name: 'Upload photo' })).toBeVisible()
  })

  it("shows the API's errors under the profile's fields", async () => {
    const onSave = vi.fn().mockRejectedValue(
      new ApiError('/api/about', 400, { 'statuses[0].text': ['Too long.'], 'links.gitHubUrl': ['Not a link.'], 'contact.email': ['Not an email.'], photoUrl: ['Bad photo.'] }),
    )
    await renderProfile({ canEdit: true, onSave, value: { ...PROFILE, contact: CONTACT } })
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(form().getByRole('group', { name: 'Label 1' }).getByRole('textbox', { name: 'Label' })).toHaveAccessibleDescription('Too long.')
    await expect.element(form().getByRole('textbox', { name: 'GitHub URL' })).toHaveAccessibleDescription('Leave empty to hide it. Not a link.')
    await expect.element(form().getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription('Not an email.')
    await expect.poll(() => textOf(form().getByRole('group', { name: 'Photo' }))).toContain('Bad photo.')
  })
})
