import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { formatMonth } from '../features/about/format'
import { renderApp } from '../test/render'
import { aboutApi, aboutContent, API, server, signedIn } from '../test/server'

const section = (name: string) => screen.getByRole('region', { name })

async function renderAbout() {
  const user = userEvent.setup()
  renderApp('/about')
  await screen.findByRole('region', { name: 'Skills' })
  return user
}

async function renderAsAdmin(initial = aboutContent()) {
  const api = aboutApi(initial)
  server.use(signedIn(), ...api.handlers)
  const user = await renderAbout()
  await screen.findAllByRole('button', { name: /^Edit/ })
  return { user, saved: api.saved }
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

  it('charts the skills with their levels', async () => {
    await renderAbout()

    const skills = within(section('Skills')).getAllByRole('listitem')
    expect(skills.map((li) => li.querySelector('.skill-name')!.textContent)).toEqual(['C#', 'Python'])
    expect(skills[0]).toHaveTextContent('90 out of 100')
    expect(skills[0].querySelector<HTMLElement>('.skill-bar')!.style.width).toBe('90%')
    expect(skills[0]).toHaveTextContent('Expert') // the tooltip
  })

  it('lists work experience with company, location, period and bullet points', async () => {
    await renderAbout()

    const roles = within(section('Work experience')).getAllByRole('listitem').filter((li) => li.classList.contains('timeline-item'))
    expect(roles).toHaveLength(2)
    expect(within(roles[0]).getByRole('heading', { name: 'Senior Engineer' })).toBeInTheDocument()
    expect(roles[0]).toHaveTextContent('Acme')
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
    expect(within(section('Qualifications')).getByText('Azure Developer Associate')).toBeInTheDocument()
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
      'Edit Skills',
      'Edit Work experience',
      'Edit Education',
      'Edit Academic papers',
      'Edit Qualifications',
    ])
  })

  it('edits the photo and links', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Photo and links' }))
    await user.type(screen.getByLabelText('Photo URL'), '/me.jpg')
    await user.type(screen.getByLabelText('Instagram URL'), 'https://instagram.com/claudiu')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/claudiu')
    expect(screen.getByRole('img', { name: 'Claudiu Jechel' })).toHaveAttribute('src', '/me.jpg')
    expect(saved[0]).toMatchObject({ photoUrl: '/me.jpg', links: { instagramUrl: 'https://instagram.com/claudiu', gitHubUrl: 'https://github.com/claudiu' } })
    // the rest of the page is sent unchanged
    expect(saved[0].experience).toEqual(aboutContent().experience)
  })

  it('adds, reorders and removes skills', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Skills' }))
    await user.click(screen.getByRole('button', { name: 'Add skill' }))
    const third = within(screen.getByRole('group', { name: 'Skill 3' }))
    await user.type(third.getByLabelText('Skill'), 'TypeScript')
    await user.clear(third.getByLabelText('Level (0–100)'))
    await user.type(third.getByLabelText('Level (0–100)'), '80')
    await user.click(screen.getByRole('button', { name: 'Move skill 3 up' }))
    await user.click(screen.getByRole('button', { name: 'Remove skill 1' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Skills')).findByText('TypeScript', { selector: '.skill-name' })).toBeInTheDocument()
    expect(saved[0].skills).toEqual([
      { name: 'TypeScript', level: 80 },
      { name: 'Python', level: 70 },
    ])
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

  it.each([
    ['Academic papers', 'paper', 'papers'],
    ['Qualifications', 'qualification', 'qualifications'],
  ] as const)('adds and removes %s', async (title, item, key) => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: `Edit ${title}` }))
    await user.click(screen.getByRole('button', { name: `Add ${item}` }))
    await user.type(screen.getByLabelText(`${item[0].toUpperCase()}${item.slice(1)} 2`), 'Something new')
    await user.click(screen.getByRole('button', { name: `Remove ${item} 1` }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section(title)).findByText('Something new')).toBeInTheDocument()
    expect(saved[0][key]).toEqual(['Something new'])
  })

  it('cancel throws away the changes', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit Skills' }))
    await user.click(screen.getByRole('button', { name: 'Remove skill 1' }))
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

  it('says when the session has ended', async () => {
    const { user } = await renderAsAdmin()
    server.use(http.put(`${API}/api/about`, () => new HttpResponse(null, { status: 401 })))

    await user.click(screen.getByRole('button', { name: 'Edit Qualifications' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/session has ended/)
  })

  it('shows the page as the API stored it (sorted, trimmed)', async () => {
    const { user } = await renderAsAdmin()
    const stored = { ...aboutContent(), papers: ['Stored by the API'] }
    server.use(http.put(`${API}/api/about`, () => HttpResponse.json(stored)))

    await user.click(screen.getByRole('button', { name: 'Edit Academic papers' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await within(section('Academic papers')).findByText('Stored by the API')).toBeInTheDocument()
  })
})
