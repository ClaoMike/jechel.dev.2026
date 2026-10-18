import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMonth } from '../features/about/format'
import { renderApp } from '../test/render'
import { ApiError, api } from '../services/api'
import { aboutApi, aboutContent, API, LEETCODE_STATS, server, signedIn } from '../test/server'

const section = (name: string) => screen.getByRole('region', { name })

// Skill durations count up to "now": fix it at October 2026. Only Date is faked, so timers still run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 10))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function renderAbout() {
  const user = userEvent.setup()
  renderApp('/about')
  await screen.findByRole('region', { name: 'Skills' })
  return user
}

/** Clicks a remove button, then confirms in the popup it opens. */
async function removeConfirmed(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name }))
  const confirm = screen.getByRole('dialog', { name: /^Remove .*\?$/ })
  await user.click(within(confirm).getByRole('button', { name: 'Remove' }))
}

async function renderAsAdmin(initial = aboutContent()) {
  const api = aboutApi(initial)
  server.use(signedIn(), ...api.handlers)
  const user = await renderAbout()
  await screen.findAllByRole('button', { name: /^Edit/ })
  return { user, saved: api.saved, contacts: api.contacts }
}

describe('AboutPage for visitors', () => {
  it('shows a photo placeholder and the links that are set', async () => {
    await renderAbout()

    expect(screen.getByRole('img', { name: 'Photo placeholder' })).toBeInTheDocument()
    const links = within(screen.getByRole('list', { name: 'Links' }))
    expect(links.getByRole('link', { name: 'Download résumé' })).toHaveAttribute('href', '/resume.pdf')
    expect(links.getByRole('link', { name: 'Download résumé' })).toHaveAttribute('download')
    expect(links.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/claudiu')
    expect(links.getByRole('link', { name: 'GitHub' })).toHaveAttribute('target', '_blank')
    expect(links.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(links.queryByRole('link', { name: 'Instagram' })).not.toBeInTheDocument() // empty → hidden
  })

  it('shows the full name under the photo', async () => {
    await renderAbout()

    expect(screen.getByText('Claudiu Mihai Jechel')).toBeInTheDocument()
  })

  it('shows the photo when one is set', async () => {
    server.use(http.get(`${API}/api/about`, () => HttpResponse.json({ ...aboutContent(), photoUrl: '/me.jpg' })))
    await renderAbout()

    expect(screen.getByRole('img', { name: 'Claudiu Jechel' })).toHaveAttribute('src', '/me.jpg')
  })

  it('never renders an unsafe link', async () => {
    const content = aboutContent()
    content.links.gitHubUrl = 'javascript:alert(1)'
    server.use(http.get(`${API}/api/about`, () => HttpResponse.json(content)))
    await renderAbout()

    expect(screen.queryByRole('link', { name: 'GitHub' })).not.toBeInTheDocument()
  })

  it('charts when and what each skill was used for, with the years of experience', async () => {
    await renderAbout()

    const chart = section('Skills')
    expect(within(within(chart).getByRole('list', { name: 'Colours' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Work', 'Academic', 'Personal'])
    const skills = within(within(chart).getByRole('list', { name: /^Skills/ })).getAllByRole('listitem')
    expect(skills.map((li) => li.querySelector('.skill-name')!.textContent)).toEqual(['C#', 'Python'])
    // Oct 2016 to Oct 2026, the overlapping June 2019 counted once
    expect(skills[0]).toHaveTextContent('10 years')
    expect(skills[0]).toHaveTextContent(`Academic, ${formatMonth('2016-10-01')} – ${formatMonth('2019-06-01')}`)
    expect(skills[0]).toHaveTextContent(`Work, Personal, ${formatMonth('2019-06-01')} – Present`)
    expect(skills[0].querySelectorAll('.skill-bar')).toHaveLength(2)
    expect(skills[1]).toHaveTextContent('5 years')
    expect(chart).not.toHaveTextContent(/out of 100|%/)
  })

  it('lists a skill without dates, with no bar', async () => {
    server.use(http.get(`${API}/api/about`, () => HttpResponse.json({ ...aboutContent(), skills: [{ name: 'Docker', periods: [] }] })))
    await renderAbout()

    const row = within(section('Skills')).getByText('Docker').closest('li')!
    expect(row.querySelector('.skill-bar')).toBeNull()
    expect(row.querySelector('.skill-value')).toHaveTextContent('')
  })

  it('pins the places on the map, with their details on hover', async () => {
    const user = await renderAbout()

    const map = section("Where I've been")
    const pin = within(map).getByRole('button', { name: /^Manchester, England, United Kingdom\. Studied: BSc at The University of Manchester\. Visited\.$/ })
    // studied + visited: a dot split in two
    expect(pin.querySelectorAll('path')).toHaveLength(2)
    await user.hover(pin)

    expect(within(map).getByRole('link', { name: 'The University of Manchester' })).toHaveAttribute('href', 'https://www.manchester.ac.uk')
    expect(within(map).getByText('Visited', { selector: '.world-map-card span' })).toBeInTheDocument()
  })

  it('zooms the map with its buttons', async () => {
    const user = await renderAbout()

    const map = section("Where I've been")
    const svg = within(map).getByRole('group', { name: 'World map' })
    const fullView = svg.getAttribute('viewBox')
    expect(within(map).getByRole('button', { name: 'Zoom out' })).toBeDisabled()
    await user.click(within(map).getByRole('button', { name: 'Zoom in' }))

    expect(svg.getAttribute('viewBox')).not.toBe(fullView)
    await user.click(within(map).getByRole('button', { name: 'Show the whole world' }))
    expect(svg.getAttribute('viewBox')).toBe(fullView)
  })

  it('turns [text](url) in any text into links', async () => {
    const content = aboutContent()
    content.experience[0].bullets = ['Built [the platform](https://platform.example)']
    server.use(http.get(`${API}/api/about`, () => HttpResponse.json(content)))
    await renderAbout()

    const work = section('Work experience')
    expect(within(work).getByRole('link', { name: 'the platform' })).toHaveAttribute('href', 'https://platform.example')
    expect(within(work).getByRole('link', { name: 'Acme' })).toHaveAttribute('href', 'https://acme.example')
    expect(within(work).queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument()
  })

  it('lists work experience with company, location, period and bullet points', async () => {
    await renderAbout()

    const roles = within(section('Work experience')).getAllByRole('listitem').filter((li) => li.classList.contains('timeline-item'))
    expect(roles).toHaveLength(2)
    expect(within(roles[0]).getByRole('heading', { name: 'Senior Engineer' })).toBeInTheDocument()
    expect(roles[0]).toHaveTextContent('Acme')
    expect(roles[0]).not.toHaveTextContent('https://acme.example')
    expect(roles[0]).toHaveTextContent('Remote')
    expect(roles[0]).toHaveTextContent(`${formatMonth('2023-01-01')} – Present`)
    expect(within(roles[0]).getByText('Led the team')).toBeInTheDocument()
    expect(roles[1]).toHaveTextContent(`${formatMonth('2019-06-01')} – ${formatMonth('2022-12-01')}`)
  })

  it('marks roles that have not started yet', async () => {
    const content = aboutContent()
    content.experience[0] = { ...content.experience[0], start: '2099-01-01' }
    server.use(http.get(`${API}/api/about`, () => HttpResponse.json(content)))
    await renderAbout()

    expect(within(section('Work experience')).getByText('Upcoming')).toBeInTheDocument()
    expect(within(section('Work experience')).getByText(`Starting ${formatMonth('2099-01-01')}`)).toBeInTheDocument()
  })

  it('shows education, papers and qualifications', async () => {
    await renderAbout()

    expect(within(section('Education')).getByRole('heading', { name: 'BSc Computer Science' })).toBeInTheDocument()
    expect(section('Education').querySelector('.bullets')).toBeNull()
    expect(within(section('Academic papers')).getByText('A paper about things (2020)')).toBeInTheDocument()
    const qualification = within(section('Qualifications')).getByRole('listitem')
    expect(qualification).toHaveTextContent('Azure Developer Associate')
    expect(qualification).toHaveTextContent('Microsoft')
    expect(qualification).toHaveTextContent(formatMonth('2024-03-01'))
    expect(qualification).not.toHaveTextContent('Grade')
  })

  it('shows papers as downloads, languages, licences and hackathons', async () => {
    await renderAbout()

    const papers = section('Academic papers')
    expect(within(papers).getByRole('link', { name: 'Scene reconstruction (PDF)' })).toHaveAttribute('download')
    expect(within(papers).getByText('A paper about things (2020)').closest('a')).toBeNull()
    expect(within(section('Languages')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['RomanianNative', 'DanishBeginner'])
    expect(within(section('Licences')).getByRole('list', { name: 'Driving licences' })).toHaveTextContent('BCar')
    expect(within(section('Licences')).getByRole('list', { name: 'Other licences' })).toHaveTextContent('Forklift')
    expect(within(section('Hackathons')).getByRole('heading', { name: 'HackMCR' })).toBeInTheDocument()
    expect(within(section('Hackathons')).getByText('Built a game')).toBeInTheDocument()
  })

  it('shows the LeetCode stats and the NeetCode lists completed', async () => {
    const content = { ...aboutContent(), problemSolving: { leetCodeUsername: 'neetcode', neetCodeLists: ['blind75', 'neetcode150'] as const } }
    server.use(http.get(`${API}/api/about`, () => HttpResponse.json(content)))
    await renderAbout()

    const problems = section('Problem solving')
    expect(await within(problems).findByText('205')).toBeInTheDocument()
    expect(within(problems).getByRole('link', { name: /LeetCode/ })).toHaveAttribute('href', 'https://leetcode.com/u/neetcode/')
    expect(within(within(problems).getByRole('list', { name: 'Solved by difficulty' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Easy103 / 969',
      'Medium98 / 2,124',
      'Hard4 / 980',
    ])
    expect(within(problems).getByRole('list', { name: 'NeetCode lists completed' })).toHaveTextContent('Blind 75NeetCode 150')
    expect(within(problems).queryByText(/^As of/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Links' })).getByRole('link', { name: 'LeetCode' })).toHaveAttribute('href', 'https://leetcode.com/u/neetcode/')
  })

  it('dates LeetCode stats the API could not refresh, and says when there are none', async () => {
    const content = { ...aboutContent(), problemSolving: { leetCodeUsername: 'neetcode', neetCodeLists: [] } }
    server.use(
      http.get(`${API}/api/about`, () => HttpResponse.json(content)),
      http.get(`${API}/api/leetcode`, () => HttpResponse.json({ ...LEETCODE_STATS, fetchedAt: '2026-10-01T09:00:00Z' })),
    )
    await renderAbout()
    expect(await within(section('Problem solving')).findByText('As of 1 Oct 2026.')).toBeInTheDocument()

    cleanup()
    server.use(http.get(`${API}/api/leetcode`, () => HttpResponse.json({ title: 'LeetCode can\'t be reached right now.' }, { status: 503 })))
    await renderAbout()
    expect(await within(section('Problem solving')).findByText("LeetCode stats can't be loaded right now.")).toBeInTheDocument()
  })

  it('hides a LeetCode user that does not exist from visitors, and has no LeetCode link without a username', async () => {
    const content = { ...aboutContent(), problemSolving: { leetCodeUsername: 'nobody', neetCodeLists: ['neetcode250'] as const } }
    server.use(
      http.get(`${API}/api/about`, () => HttpResponse.json(content)),
      http.get(`${API}/api/leetcode`, () => new HttpResponse(null, { status: 404 })),
    )
    await renderAbout()

    await vi.waitFor(() => expect(within(section('Problem solving')).queryByText(/Loading/)).not.toBeInTheDocument())
    expect(within(section('Problem solving')).queryByText(/LeetCode/)).not.toBeInTheDocument()
    expect(within(section('Problem solving')).getByText('NeetCode 250')).toBeInTheDocument()

    cleanup()
    server.resetHandlers()
    await renderAbout()
    expect(within(section('Problem solving')).getByText('Nothing here yet.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Links' })).queryByRole('link', { name: 'LeetCode' })).not.toBeInTheDocument()
  })

  it('collapses and expands a section, and remembers it', async () => {
    const user = await renderAbout()

    const skills = section('Skills')
    await user.click(within(skills).getByRole('button', { name: 'Collapse Skills' }))

    expect(within(skills).queryByRole('list', { name: /^Skills/ })).not.toBeInTheDocument()
    expect(within(skills).getByRole('button', { name: 'Expand Skills' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(section('Languages')).getByRole('list')).toBeVisible() // the others stay open

    cleanup()
    renderApp('/about')
    const again = await screen.findByRole('region', { name: 'Skills' })
    await user.click(within(again).getByRole('button', { name: 'Expand Skills' }))
    expect(within(again).getByRole('list', { name: /^Skills/ })).toBeVisible()
  })

  it('shows the photo card heading when it is collapsed', async () => {
    const user = await renderAbout()

    expect(screen.getByRole('heading', { name: 'Photo and links' })).toHaveClass('visually-hidden')
    await user.click(screen.getByRole('button', { name: 'Collapse Photo and links' }))

    expect(screen.getByRole('heading', { name: 'Photo and links' })).not.toHaveClass('visually-hidden')
    expect(screen.queryByRole('list', { name: 'Links' })).not.toBeInTheDocument()
  })

  it("doesn't show visitors an empty row of labels", async () => {
    server.use(http.get(`${API}/api/about`, () => HttpResponse.json({ ...aboutContent(), statuses: [] })))
    await renderAbout()

    expect(screen.queryByRole('list', { name: 'Citizenship and residence' })).not.toBeInTheDocument()
    expect(screen.queryByText(/No citizenship or residence labels/)).not.toBeInTheDocument()
  })

  it('has no edit buttons', async () => {
    await renderAbout()

    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
  })

  it('says so when the page cannot be loaded', async () => {
    server.use(http.get(`${API}/api/about`, () => new HttpResponse(null, { status: 500 })))
    renderApp('/about')

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't be loaded/)
  })
})

describe('AboutPage for the admin', () => {
  it('has an Edit button for every section', async () => {
    await renderAsAdmin()

    expect(screen.getAllByRole('button', { name: /^Edit/ }).map((b) => b.textContent)).toEqual([
      'Edit Photo and links',
      "Edit Where I've been",
      'Edit Problem solving',
      'Edit Skills',
      'Edit Work experience',
      'Edit Education',
      'Edit Academic papers',
      'Edit Qualifications',
      'Edit Languages',
      'Edit Licences',
      'Edit Hackathons',
    ])
  })

  it('uploads a photo and edits the links', async () => {
    const { user, saved } = await renderAsAdmin()
    const uploadPhoto = vi.spyOn(api.files, 'uploadPhoto').mockResolvedValue({ url: '/api/files/11111111-1111-1111-1111-111111111111/photo.webp', fileName: 'photo.webp' })

    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    expect(screen.queryByLabelText('Résumé file')).not.toBeInTheDocument()
    await user.upload(screen.getByLabelText('Photo file'), new File(['img'], 'me.png', { type: 'image/png' }))
    expect(uploadPhoto).toHaveBeenCalledWith(expect.objectContaining({ name: 'me.png' }), expect.any(Function))
    await user.type(screen.getByLabelText('Instagram URL'), 'https://instagram.com/claudiu')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/claudiu')
    expect(screen.getByRole('img', { name: 'Claudiu Jechel' })).toHaveAttribute('src', '/api/files/11111111-1111-1111-1111-111111111111/photo.webp')
    expect(saved[0]).toMatchObject({ photoUrl: '/api/files/11111111-1111-1111-1111-111111111111/photo.webp', links: { instagramUrl: 'https://instagram.com/claudiu', gitHubUrl: 'https://github.com/claudiu' } })
    // the rest of the page is sent unchanged, and the résumé's private details never go in it
    expect(saved[0].experience).toEqual(aboutContent().experience)
    expect(saved[0]).not.toHaveProperty('contact')
  })

  it("keeps the résumé's phone, email and headline private, and saves them on their own", async () => {
    const { user, saved, contacts } = await renderAsAdmin()

    expect(screen.getByText(/Only you see this/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    const resume = within(screen.getByRole('group', { name: 'For the résumé (only you see these)' }))
    await user.type(resume.getByLabelText('Headline'), 'Full-stack engineer')
    await user.type(resume.getByLabelText('Phone'), '+44 7700 900123')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Full-stack engineer · \+44 7700 900123/)).toBeInTheDocument()
    expect(contacts).toEqual([{ phone: '+44 7700 900123', email: '', headline: 'Full-stack engineer' }])
    expect(JSON.stringify(saved)).not.toContain('7700')
  })

  it("shows the résumé details' errors on their fields", async () => {
    const { user } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    await user.type(screen.getByLabelText('Phone'), 'call me')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Use digits.')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true')
  })

  it('removes the photo', async () => {
    const { user, saved } = await renderAsAdmin({ ...aboutContent(), photoUrl: '/api/files/x/photo.webp' })

    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    await removeConfirmed(user, 'Remove photo')
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('img', { name: 'Photo placeholder' })).toBeInTheDocument()
    expect(saved[0]).toMatchObject({ photoUrl: '' })
  })

  it("refuses a file over the limit without sending it", async () => {
    const { user } = await renderAsAdmin()
    const upload = vi.spyOn(api.files, 'uploadPhoto')

    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    const big = new File(['img'], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 })
    await user.upload(screen.getByLabelText('Photo file'), big)

    expect(await screen.findByRole('alert')).toHaveTextContent('That file is 20 MB. The limit is 15 MB.')
    expect(upload).not.toHaveBeenCalled()
  })

  it('shows how far an upload has got', async () => {
    const { user } = await renderAsAdmin()
    let finish: (file: { url: string; fileName: string }) => void = () => {}
    vi.spyOn(api.files, 'uploadPaper').mockImplementation((_file, onProgress) => {
      onProgress?.(0.42)
      return new Promise((resolve) => (finish = resolve))
    })

    await user.click(screen.getByRole('button', { name: 'Edit Academic papers' }))
    await user.upload(screen.getByLabelText('PDF file for paper 1'), new File(['%PDF-'], 'p.pdf', { type: 'application/pdf' }))

    expect(await screen.findByRole('button', { name: 'Uploading… 42% for paper 1' })).toBeDisabled()
    finish({ url: '/api/files/x/p.pdf', fileName: 'p.pdf' })
    expect(await screen.findByRole('button', { name: 'Replace PDF for paper 1' })).toBeEnabled()
  })

  it('says why an upload was refused', async () => {
    const { user } = await renderAsAdmin()
    vi.spyOn(api.files, 'uploadPhoto').mockRejectedValue(new ApiError('/api/files/photo', 400, { file: ["That file isn't an image we can read."] }))

    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    await user.upload(screen.getByLabelText('Photo file'), new File(['<html>'], 'me.png', { type: 'image/png' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("That file isn't an image we can read.")
  })

  it('folds each skill to a row, opened by a click, and keeps it open as it moves', async () => {
    const { user } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Skills' }))
    const python = screen.getByRole('button', { name: /^Python/ })
    expect(python).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByRole('group', { name: 'Skill 2' })).queryByLabelText('Skill')).not.toBeVisible()
    await user.click(python)
    expect(within(screen.getByRole('group', { name: 'Skill 2' })).getByLabelText('Skill')).toHaveValue('Python')

    await user.click(screen.getByRole('button', { name: 'Move skill 2 up' }))

    expect(screen.getByRole('button', { name: /^Python/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /^C#/ })).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByRole('group', { name: 'Skill 1' })).getByLabelText('Skill')).toHaveValue('Python')
  })

  it('adds, reorders and removes skills, with periods, uses and colours', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Skills' }))
    await user.click(screen.getByRole('button', { name: 'Add skill' }))
    const third = within(screen.getByRole('group', { name: 'Skill 3' }))
    await user.type(third.getByLabelText('Skill'), 'TypeScript')
    const period = within(third.getByRole('group', { name: 'Period 1' }))
    await user.clear(period.getByLabelText('From year'))
    await user.type(period.getByLabelText('From year'), '2020')
    await user.click(period.getByRole('checkbox', { name: 'Personal' }))
    await user.click(third.getByRole('button', { name: 'Add period to skill 3' }))
    const second = within(third.getByRole('group', { name: 'Period 2' }))
    await user.click(second.getByRole('checkbox', { name: 'Work' })) // untick the default
    await user.click(second.getByRole('checkbox', { name: 'Academic' }))
    await user.click(screen.getByRole('button', { name: 'Move skill 3 up' }))
    await removeConfirmed(user, 'Remove skill 1')
    fireEvent.input(screen.getByLabelText('Personal', { selector: 'input[type=color]' }), { target: { value: '#aa00ff' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Skills')).findByText('TypeScript', { selector: '.skill-name' })).toBeInTheDocument()
    expect(saved[0].skills.map((s) => s.name)).toEqual(['TypeScript', 'Python'])
    expect(saved[0].skills[0].periods).toEqual([
      { start: '2020-10-01', end: null, uses: ['work', 'personal'] },
      { start: '2026-10-01', end: null, uses: ['academic'] },
    ])
    expect(saved[0].colors.skills.personal).toBe('#aa00ff')
    expect(saved[0].colors.places).toEqual(aboutContent().colors.places)
  })

  it('adds a role with dates, ongoing, and bullet points', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Work experience' }))
    await user.click(screen.getByRole('button', { name: 'Add role' }))
    const role = within(screen.getByRole('group', { name: 'Role 1' })) // new roles go on top
    await user.type(role.getByLabelText('Job title'), 'Founder')
    await user.type(role.getByLabelText('Company'), 'Next Thing')
    await user.selectOptions(role.getByLabelText('Start month'), '3')
    await user.clear(role.getByLabelText('Start year'))
    await user.type(role.getByLabelText('Start year'), '2099')
    expect(role.getByLabelText('Ongoing (no end date)')).toBeChecked()
    expect(role.queryByLabelText('End year')).not.toBeInTheDocument()
    await user.type(role.getByLabelText('Bullet point 1'), 'Starting something new')
    await user.click(role.getByRole('button', { name: 'Add bullet point' }))
    await user.type(role.getByLabelText('Bullet point 2'), 'Hiring')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Work experience')).findByRole('heading', { name: 'Founder' })).toBeInTheDocument()
    expect(saved[0].experience[0]).toEqual({
      title: 'Founder',
      company: 'Next Thing',
      location: '',
      start: '2099-03-01',
      end: null,
      bullets: ['Starting something new', 'Hiring'],
    })
    expect(saved[0].experience).toHaveLength(3)
  })

  it('sets an end date by unticking ongoing', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Work experience' }))
    const role = within(screen.getByRole('group', { name: 'Role 1' }))
    await user.click(role.getByLabelText('Ongoing (no end date)'))
    await user.selectOptions(role.getByLabelText('End month'), '6')
    await user.clear(role.getByLabelText('End year'))
    await user.type(role.getByLabelText('End year'), '2025')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await within(section('Work experience')).findByText(`${formatMonth('2023-01-01')} – ${formatMonth('2025-06-01')}`)
    expect(saved[0].experience[0]).toMatchObject({ start: '2023-01-01', end: '2025-06-01' })
  })

  it('edits education, which has no bullet points', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Education' }))
    const entry = within(screen.getByRole('group', { name: 'Education 1' }))
    expect(entry.queryByRole('button', { name: /add bullet point/i })).not.toBeInTheDocument()
    await user.clear(entry.getByLabelText('Degree or course'))
    await user.type(entry.getByLabelText('Degree or course'), 'MSc Software Engineering')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Education')).findByRole('heading', { name: 'MSc Software Engineering' })).toBeInTheDocument()
    expect(saved[0].education[0]).toEqual({ title: 'MSc Software Engineering', institution: 'Uni', location: 'Bucharest', start: '2015-10-01', end: '2019-06-01' })
  })

  it('adds a paper with its PDF, and removes another', async () => {
    const { user, saved } = await renderAsAdmin()
    const upload = vi.spyOn(api.files, 'uploadPaper').mockResolvedValue({ url: '/api/files/44444444-4444-4444-4444-444444444444/new.pdf', fileName: 'new.pdf' })

    await user.click(screen.getByRole('button', { name: 'Edit Academic papers' }))
    await user.click(screen.getByRole('button', { name: 'Add paper' }))
    const added = within(screen.getByRole('group', { name: 'Paper 3' }))
    await user.type(added.getByLabelText('Title'), 'Something new')
    await user.upload(added.getByLabelText('PDF file for paper 3'), new File(['%PDF-'], 'new.pdf', { type: 'application/pdf' }))
    expect(await added.findByRole('link', { name: 'new.pdf' })).toBeInTheDocument()
    await removeConfirmed(user, 'Remove PDF for paper 2')
    await removeConfirmed(user, 'Remove paper 1')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const papers = section('Academic papers')
    expect(await within(papers).findByRole('link', { name: 'Something new (PDF)' })).toHaveAttribute('href', '/api/files/44444444-4444-4444-4444-444444444444/new.pdf')
    expect(within(papers).queryByRole('link', { name: /Scene reconstruction/ })).not.toBeInTheDocument()
    expect(upload).toHaveBeenCalledOnce()
    expect(saved[0].papers).toEqual([
      { title: 'Scene reconstruction', fileUrl: '' },
      { title: 'Something new', fileUrl: '/api/files/44444444-4444-4444-4444-444444444444/new.pdf' },
    ])
  })

  it('sorts skills by experience only when saved', async () => {
    const { user, saved } = await renderAsAdmin({
      ...aboutContent(),
      skills: [
        { name: 'Short', periods: [{ start: '2025-01-01', end: null, uses: ['work'] }] },
        { name: 'Undated', periods: [] },
        { name: 'Long', periods: [{ start: '2010-01-01', end: null, uses: ['work'] }] },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Edit Skills' }))
    await user.click(screen.getByRole('button', { name: 'Sort by experience' }))
    expect(screen.getByRole('status')).toHaveTextContent(/Save to keep this order/)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await within(section('Skills')).findByText('Long', { selector: '.skill-name' })
    expect(saved[0].skills.map((s) => s.name)).toEqual(['Long', 'Short', 'Undated'])
  })

  it('tells the admin where the citizenship labels go when there are none', async () => {
    const { user, saved } = await renderAsAdmin({ ...aboutContent(), statuses: [] })

    expect(screen.getByText('No citizenship or residence labels yet. Use Edit to add them.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    await user.click(screen.getByRole('button', { name: 'Add label' }))
    await user.type(within(screen.getByRole('group', { name: 'Label 1' })).getByLabelText('Label'), 'EU citizenship')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('list', { name: 'Citizenship and residence' })).toHaveTextContent('EU citizenship')
    expect(saved[0].statuses).toEqual([{ text: 'EU citizenship', flag: 'EU' }])
  })

  it('opens a collapsed section to edit it', async () => {
    const { user } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Collapse Languages' }))
    await user.click(screen.getByRole('button', { name: 'Edit Languages' }))

    expect(screen.getByRole('form', { name: 'Edit Languages' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Expand Languages' })).toBeInTheDocument()
  })

  it('edits the citizenship and residence labels under the photo', async () => {
    const { user, saved } = await renderAsAdmin()

    const labels = within(screen.getByRole('list', { name: 'Citizenship and residence' })).getAllByRole('listitem')
    expect(labels.map((li) => li.textContent)).toEqual(['Romanian citizenship', 'UK Settled Status'])
    expect(labels.map((li) => li.querySelector('img')?.getAttribute('title'))).toEqual(['Romania', 'United Kingdom'])
    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    await user.click(screen.getByRole('button', { name: 'Add label' }))
    const added = within(screen.getByRole('group', { name: 'Label 3' }))
    await user.type(added.getByLabelText('Label'), 'EU citizenship')
    expect(added.getByLabelText('Flag')).toHaveValue('EU') // guessed from the words
    await user.selectOptions(within(screen.getByRole('group', { name: 'Label 2' })).getByLabelText('Flag'), 'Denmark')
    await user.click(screen.getByRole('button', { name: 'Move label 3 up' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await within(screen.getByRole('list', { name: 'Citizenship and residence' })).findByText('EU citizenship')
    expect(saved[0].statuses).toEqual([
      { text: 'Romanian citizenship', flag: 'RO' },
      { text: 'EU citizenship', flag: 'EU' },
      { text: 'UK Settled Status', flag: 'DK' },
    ])
  })

  it('adds languages with a level', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Languages' }))
    await user.click(screen.getByRole('button', { name: 'Add language' }))
    const added = within(screen.getByRole('group', { name: 'Language 3' }))
    await user.type(added.getByLabelText('Language'), 'English')
    await user.selectOptions(added.getByLabelText('Level'), 'Fluent')
    await removeConfirmed(user, 'Remove language 2')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Languages')).findByText('English')).toBeInTheDocument()
    expect(within(section('Languages')).getByText('Fluent')).toBeInTheDocument()
    expect(saved[0].languages).toEqual([
      { name: 'Romanian', level: 'native' },
      { name: 'English', level: 'fluent' },
    ])
  })

  it('switches licences on and off, and adds one of its own', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Licences' }))
    expect(screen.getByRole('button', { name: 'B Car' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'B Car' }))
    await user.click(screen.getByRole('button', { name: 'PPL(A) Private pilot, aeroplanes' }))
    await user.click(screen.getByRole('button', { name: 'ICC International Certificate of Competence' }))
    await user.selectOptions(screen.getByLabelText('Kind'), 'Boating')
    await user.click(screen.getByRole('button', { name: 'Add licence' }))
    expect(screen.getByText('Enter what the licence is for.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('For'), 'Speedboat (DK)')
    await user.click(screen.getByRole('button', { name: 'Add licence' }))
    await removeConfirmed(user, 'Remove Forklift')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const licences = section('Licences')
    expect(await within(licences).findByRole('list', { name: 'Flying licences' })).toHaveTextContent('PPL(A)Private pilot, aeroplanes')
    expect(within(within(licences).getByRole('list', { name: 'Boating licences' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'ICCInternational Certificate of Competence',
      'Speedboat (DK)',
    ])
    expect(within(licences).queryByRole('list', { name: 'Driving licences' })).not.toBeInTheDocument()
    expect(saved[0].licences).toEqual([
      { category: 'flying', code: 'PPL(A)', name: 'Private pilot, aeroplanes' },
      { category: 'boating', code: 'ICC', name: 'International Certificate of Competence' },
      { category: 'boating', code: '', name: 'Speedboat (DK)' },
    ])
  })

  it('sets the LeetCode username from a pasted link and ticks NeetCode lists', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Problem solving' }))
    fireEvent.change(screen.getByLabelText('LeetCode username'), { target: { value: 'https://leetcode.com/u/neetcode/' } })
    expect(screen.getByLabelText('LeetCode username')).toHaveValue('neetcode')
    await user.click(screen.getByRole('button', { name: 'NeetCode 250' }))
    await user.click(screen.getByRole('button', { name: 'Blind 75' }))
    expect(screen.getByRole('button', { name: 'Blind 75' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Problem solving')).findByText('205')).toBeInTheDocument()
    expect(saved[0].problemSolving).toEqual({ leetCodeUsername: 'neetcode', neetCodeLists: ['blind75', 'neetcode250'] })
  })

  it('tells the admin when LeetCode has no such user', async () => {
    server.use(http.get(`${API}/api/leetcode`, () => new HttpResponse(null, { status: 404 })))
    await renderAsAdmin({ ...aboutContent(), problemSolving: { leetCodeUsername: 'nobody', neetCodeLists: [] } })

    expect(await within(section('Problem solving')).findByText('LeetCode has no user called nobody. Check the username with Edit.')).toBeInTheDocument()
  })

  it('adds a hackathon with a year and bullet points, and sorts by year', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Hackathons' }))
    await user.click(screen.getByRole('button', { name: 'Add hackathon' }))
    const added = within(screen.getByRole('group', { name: 'Hackathon 1' }))
    await user.type(added.getByLabelText('Name'), 'Junction')
    await user.clear(added.getByLabelText('Year'))
    await user.type(added.getByLabelText('Year'), '2019')
    await user.type(added.getByLabelText('Bullet point 1'), 'Made a robot')
    await user.click(screen.getByRole('button', { name: 'Sort by year' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const hackathons = section('Hackathons')
    await within(hackathons).findByRole('heading', { name: 'Junction' })
    expect(within(hackathons).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['HackMCR', 'Junction'])
    expect(within(hackathons).getByText('2019')).toBeInTheDocument()
    expect(saved[0].hackathons).toEqual([
      { name: 'HackMCR', year: 2022, bullets: ['Built a game'] },
      { name: 'Junction', year: 2019, bullets: ['Made a robot'] },
    ])
  })

  it('adds a qualification with the month obtained and a grade', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Qualifications' }))
    await user.click(screen.getByRole('button', { name: 'Add qualification' }))
    const added = within(screen.getByRole('group', { name: 'Qualification 2' }))
    await user.type(added.getByLabelText('Qualification'), 'CKA')
    await user.selectOptions(added.getByLabelText('Obtained month'), '5')
    await user.clear(added.getByLabelText('Obtained year'))
    await user.type(added.getByLabelText('Obtained year'), '2025')
    await user.type(added.getByLabelText('Grade (optional)'), '92%')
    await user.click(screen.getByRole('button', { name: 'Move qualification 2 up' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Qualifications')).findByText('Grade: 92%')).toBeInTheDocument()
    expect(saved[0].qualifications).toEqual([{ title: 'CKA', issuer: '', obtained: '2025-05-01', grade: '92%' }, aboutContent().qualifications[0]])
  })

  it('inserts a link into the text', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Hackathons' }))
    await user.click(screen.getByRole('button', { name: 'Add link to Bullet point 1' }))
    await user.type(screen.getByLabelText('Link text'), 'Read it')
    await user.clear(screen.getByLabelText('Link URL'))
    await user.type(screen.getByLabelText('Link URL'), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: 'Insert link' }))
    expect(screen.getByText(/Enter a full link/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Link URL'))
    await user.type(screen.getByLabelText('Link URL'), 'https://doi.org/10.1000/1{Enter}')

    expect(screen.getByLabelText('Bullet point 1')).toHaveValue('Built a game[Read it](https://doi.org/10.1000/1)')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await within(section('Hackathons')).findByRole('link', { name: 'Read it' })).toHaveAttribute('href', 'https://doi.org/10.1000/1')
    expect(saved).toHaveLength(1)
  })

  it('reorders roles, and sorts them by end date only when saved', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Work experience' }))
    await user.click(screen.getByRole('button', { name: 'Move role 1 down' }))
    expect(within(screen.getByRole('group', { name: 'Role 1' })).getByLabelText('Job title')).toHaveValue('Engineer')
    await user.click(screen.getByRole('button', { name: 'Sort by end date' }))
    expect(screen.getByRole('status')).toHaveTextContent(/Save to keep this order/)
    expect(within(screen.getByRole('group', { name: 'Role 1' })).getByLabelText('Job title')).toHaveValue('Senior Engineer')
    await user.click(screen.getByRole('button', { name: 'Move role 1 down' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await within(section('Work experience')).findByRole('heading', { name: 'Engineer' })
    expect(saved[0].experience.map((e) => e.title)).toEqual(['Engineer', 'Senior Engineer'])
  })

  it('cancelling a sort keeps the old order', async () => {
    const { user, saved } = await renderAsAdmin({ ...aboutContent(), experience: [...aboutContent().experience].reverse() })

    await user.click(screen.getByRole('button', { name: 'Edit Work experience' }))
    await user.click(screen.getByRole('button', { name: 'Sort by end date' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const titles = within(section('Work experience')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['Engineer', 'Senior Engineer'])
    expect(saved).toEqual([])
  })

  it('adds a city from the search, with what happened there', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: "Edit Where I've been" }))
    await user.type(screen.getByLabelText('Add a city'), 'lon')
    const results = await screen.findByRole('list', { name: 'Matching places' })
    await user.click(within(results).getByRole('button', { name: 'London, England, United Kingdom' }))
    const popup = within(screen.getByRole('dialog', { name: 'London, England, United Kingdom' }))
    expect(popup.getByRole('checkbox', { name: 'Visited' })).toBeChecked()
    await user.click(popup.getByRole('checkbox', { name: 'Visited' }))
    await user.click(popup.getByRole('button', { name: 'Add to map' }))
    expect(popup.getByText(/Tick at least one/)).toBeInTheDocument()
    await user.click(popup.getByRole('checkbox', { name: 'Worked' }))
    await user.type(popup.getByLabelText('Worked: note (optional)'), 'Engineer at Acme')
    await user.click(popup.getByRole('button', { name: 'Add to map' }))
    expect(within(screen.getByRole('list', { name: 'Places on the map' })).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section("Where I've been")).findByRole('button', { name: /^London, England, United Kingdom\. Worked: Engineer at Acme\.$/ })).toBeInTheDocument()
    expect(saved[0].places[1]).toEqual({
      id: 2643743,
      name: 'London',
      region: 'England',
      country: 'United Kingdom',
      latitude: 51.509,
      longitude: -0.126,
      visits: [{ kind: 'worked', note: 'Engineer at Acme' }],
    })
  })

  it('edits and removes places, and recolours the map', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: "Edit Where I've been" }))
    // Picking a city that's already on the map edits it.
    await user.type(screen.getByLabelText('Add a city'), 'manch')
    await user.click(await screen.findByRole('button', { name: 'Manchester, England, United Kingdom' }))
    const popup = within(screen.getByRole('dialog', { name: 'Manchester, England, United Kingdom' }))
    expect(popup.getByRole('checkbox', { name: 'Studied' })).toBeChecked()
    await user.click(popup.getByRole('checkbox', { name: 'Worked' }))
    await user.click(popup.getByRole('button', { name: 'Update place' }))
    fireEvent.input(screen.getByLabelText('Worked', { selector: 'input[type=color]' }), { target: { value: '#00aa00' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await within(section("Where I've been")).findByRole('button', { name: /^Manchester/ })
    expect(saved[0].places[0].visits.map((v) => v.kind)).toEqual(['worked', 'studied', 'visited'])
    expect(saved[0].colors.places.worked).toBe('#00aa00')

    await user.click(screen.getByRole('button', { name: "Edit Where I've been" }))
    await removeConfirmed(user, 'Remove Manchester')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await within(section("Where I've been")).findByText('No places yet.')).toBeInTheDocument()
    expect(saved[1].places).toEqual([])
  })

  it('shows the API errors for a place in the list', async () => {
    const { user } = await renderAsAdmin()
    server.use(http.put(`${API}/api/about`, () => HttpResponse.json({ status: 400, errors: { 'places[0].visits[0].note': ['Links must be http(s) links.'] } }, { status: 400 })))

    await user.click(screen.getByRole('button', { name: "Edit Where I've been" }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(screen.getByRole('list', { name: 'Places on the map' })).findByText(/Links must be/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Manchester' }))
    expect(screen.getByLabelText('Studied: note (optional)')).toHaveAccessibleDescription('Links must be http(s) links.')
  })

  it('asks before removing anything, and Cancel in the question keeps it', async () => {
    const { user } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Languages' }))
    await user.click(screen.getByRole('button', { name: 'Remove language 2' }))
    const confirm = screen.getByRole('dialog', { name: 'Remove language 2?' })
    expect(confirm).toHaveTextContent('It goes when you save this section; Cancel brings it back.')
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove language 2' })).toBeInTheDocument()
  })

  it('Escape in the question keeps the city popup open', async () => {
    const { user } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: "Edit Where I've been" }))
    await user.click(screen.getByRole('button', { name: 'Edit Manchester' }))
    await user.click(screen.getByRole('button', { name: 'Remove from map' }))
    expect(screen.getByRole('dialog', { name: 'Remove Manchester from the map?' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Remove Manchester from the map?' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove from map' })).toBeInTheDocument()
  })

  it('cancel throws away the changes', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Skills' }))
    await removeConfirmed(user, 'Remove skill 1')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(within(section('Skills')).getByText('C#', { selector: '.skill-name' })).toBeInTheDocument()
    expect(saved).toEqual([])
  })

  it('shows the API errors next to the fields, and keeps the form open', async () => {
    const { user } = await renderAsAdmin()
    server.use(
      http.put(`${API}/api/about`, () =>
        HttpResponse.json({ status: 400, errors: { 'experience[1].company': ['Required.'], 'experience[0].bullets[1]': ['Must be at most 500 characters.'] } }, { status: 400 }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Edit Work experience' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/fields need fixing/)
    const second = within(screen.getByRole('group', { name: 'Role 2' }))
    expect(second.getByLabelText('Company')).toHaveAccessibleDescription('Required.')
    const first = within(screen.getByRole('group', { name: 'Role 1' }))
    expect(first.getByLabelText('Bullet point 2')).toHaveAccessibleDescription('Must be at most 500 characters.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('names the other section when that is what stops the save', async () => {
    const { user } = await renderAsAdmin()
    server.use(
      http.put(`${API}/api/about`, () =>
        HttpResponse.json({ status: 400, errors: { 'skills[2].periods[0].uses': ['Tick at least one: work, academic or personal.'] } }, { status: 400 }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Edit Academic papers' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save, because another section needs fixing first. Skills, item 3: Tick at least one: work, academic or personal.",
    )
  })

  it('says when the session has ended', async () => {
    const { user } = await renderAsAdmin()
    server.use(http.put(`${API}/api/about`, () => new HttpResponse(null, { status: 401 })))

    await user.click(screen.getByRole('button', { name: 'Edit Qualifications' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/session has ended/)
  })

  it('shows the page as the API stored it (trimmed)', async () => {
    const { user } = await renderAsAdmin()
    const stored = { ...aboutContent(), papers: [{ title: 'Stored by the API', fileUrl: '' }] }
    server.use(http.put(`${API}/api/about`, () => HttpResponse.json(stored)))

    await user.click(screen.getByRole('button', { name: 'Edit Academic papers' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Academic papers')).findByText('Stored by the API')).toBeInTheDocument()
  })
})
