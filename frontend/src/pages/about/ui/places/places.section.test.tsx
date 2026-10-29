import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { api, ApiError, type City, type Place } from '@/shared/api'
import { ABOUT } from '@/test/fixtures/about'
import { renderView, textOf } from '@/test/render'
import { PlacesSection, type PlacesValue } from './PlacesSection/PlacesSection'

const VALUE: PlacesValue = { places: ABOUT.places, colors: ABOUT.colors.places }
const LEEDS: City = { id: 2644688, name: 'Leeds', region: 'England', country: 'United Kingdom', latitude: 53.8, longitude: -1.55, population: 455123 }

function renderPlaces({
  value = VALUE,
  canEdit = false,
  onSave = vi.fn(async () => {}),
}: { value?: PlacesValue; canEdit?: boolean; onSave?: (v: PlacesValue) => Promise<void> } = {}) {
  return renderView(<PlacesSection value={value} canEdit={canEdit} onSave={onSave} />)
}

const map = () => page.getByRole('group', { name: 'World map' })
const pin = (name: string | RegExp) => map().getByRole('button', { name })
const card = () => document.querySelector('.world-map-card')
const form = () => page.getByRole('form', { name: "Edit Where I've been" })
const popup = (name: string) => page.getByRole('dialog', { name })
const openEditor = () => page.getByRole('button', { name: "Edit Where I've been" }).click()

describe("Where I've been, for a visitor", () => {
  it('has a legend of what each colour means, and how to zoom', async () => {
    await renderPlaces()
    await expect.poll(() => textOf(page.getByRole('list', { name: 'Colours' }))).toBe('WorkedStudiedVisitedPinch or Ctrl + scroll to zoom')
  })

  it('puts a pin on the map for every place, read out with what happened there', async () => {
    await renderPlaces()
    await expect.element(pin('Manchester, England, United Kingdom. Studied: BSc at Manchester. Worked.')).toBeVisible()
    await expect.element(pin('Bucureşti, Romania. Visited: Home town.')).not.toBeInTheDocument()
    await expect.element(pin('Bucharest, Bucureşti, Romania. Visited: Home town.')).toBeVisible()
    // Two things happened in Manchester: its pin is split in two slices; Bucharest's is one colour.
    expect(
      pin(/^Manchester/)
        .element()
        .querySelectorAll('path'),
    ).toHaveLength(2)
    expect(
      pin(/^Bucharest/)
        .element()
        .querySelectorAll('path'),
    ).toHaveLength(0)
  })

  it("shows a place's card on hover or focus, and hides it on Escape", async () => {
    await renderPlaces()
    await pin(/^Manchester/).hover()
    await expect.poll(() => card()?.textContent).toBe('Manchester, England, United KingdomBSc at ManchesterWorked')
    expect(card()!.querySelector('a')?.getAttribute('href')).toBe('https://www.manchester.ac.uk')
    ;(pin(/^Bucharest/).element() as SVGElement).focus()
    await expect.poll(() => card()?.textContent).toContain('Home town')
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => card()).toBeNull()
  })

  it('pins a card with a click (or Enter), and a second click puts it away', async () => {
    await renderPlaces()
    await pin(/^Bucharest/).click()
    await expect.poll(() => card()?.textContent).toContain('Home town')
    await pin(/^Bucharest/).click()
    await expect.poll(() => card()).toBeNull()
    ;(pin(/^Manchester/).element() as SVGElement).focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => card()?.textContent).toContain('BSc at Manchester')
  })

  it('zooms in and out with the buttons, never past the whole world', async () => {
    await renderPlaces()
    const zoomOut = page.getByRole('button', { name: 'Zoom out' })
    const whole = page.getByRole('button', { name: 'Show the whole world' })
    const svg = map().element()
    const full = svg.getAttribute('viewBox')
    await expect.element(zoomOut).toBeDisabled()
    await expect.element(whole).toBeDisabled()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.element(zoomOut).toBeEnabled()
    expect(svg.getAttribute('viewBox')).not.toBe(full)
    expect(svg.classList.contains('world-map-zoomed')).toBe(true)
    await whole.click()
    expect(svg.getAttribute('viewBox')).toBe(full)
    await expect.element(zoomOut).toBeDisabled()
  })

  it('stops zooming in at 16 times', async () => {
    await renderPlaces()
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    for (let i = 0; i < 4; i++) await zoomIn.click()
    await expect.element(zoomIn).toBeDisabled()
  })

  it('says so when there are no places, and still shows the map', async () => {
    await renderPlaces({ value: { ...VALUE, places: [] } })
    await expect.element(page.getByText('No places yet.')).toBeVisible()
    await expect.element(map()).toBeVisible()
  })
})

describe("Where I've been, for the admin", () => {
  it('changes the colours', async () => {
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    await form().getByLabelText('Visited').fill('#000000')
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({ ...VALUE, colors: { ...VALUE.colors, visited: '#000000' } })
  })

  it('searches cities once typing pauses (2 letters or more), and adds one to the map', async () => {
    const search = vi.spyOn(api.places, 'searchCities').mockResolvedValue([LEEDS])
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    const box = form().getByRole('searchbox', { name: 'Add a city' })
    await box.fill('L')
    await new Promise((r) => setTimeout(r, 400))
    expect(search).not.toHaveBeenCalled()
    await box.fill('Leeds')
    const result = form().getByRole('list', { name: 'Matching places' }).getByRole('button', { name: 'Leeds, England, United Kingdom' })
    await expect.element(result).toBeVisible()
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toBe('Leeds')
    await result.click()
    await expect.element(box).toHaveValue('')
    const dialog = popup('Leeds, England, United Kingdom')
    await expect.element(dialog.getByRole('checkbox', { name: 'Visited' })).toBeChecked()
    await dialog.getByRole('checkbox', { name: 'Worked' }).click()
    await dialog.getByRole('textbox', { name: 'Worked: note (optional)' }).fill('Engineer at [Acme](https://acme.example)')
    await dialog.getByRole('button', { name: 'Add to map' }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.poll(() => textOf(form().getByRole('list', { name: 'Places on the map' }))).toContain('Leeds, England, United Kingdom · Worked, Visited')
    await form().getByRole('button', { name: 'Save' }).click()
    const { population: _, ...place } = LEEDS
    expect(onSave).toHaveBeenCalledWith({
      ...VALUE,
      places: [
        ...VALUE.places,
        {
          ...place,
          visits: [
            { kind: 'worked', note: 'Engineer at [Acme](https://acme.example)' },
            { kind: 'visited', note: '' },
          ],
        },
      ],
    })
  })

  it('says when nothing matches, and when the search fails', async () => {
    const search = vi.spyOn(api.places, 'searchCities').mockResolvedValueOnce([]).mockRejectedValueOnce(new ApiError('/api/places', 503))
    await renderPlaces({ canEdit: true })
    await openEditor()
    const box = form().getByRole('searchbox', { name: 'Add a city' })
    await box.fill('Zzz')
    await expect.element(form().getByText('No places found.')).toBeVisible()
    await box.fill('Qqq')
    await expect.element(form().getByText("The search isn't working right now. Please try again.")).toBeVisible()
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('says it is searching while it waits for the answer', async () => {
    vi.spyOn(api.places, 'searchCities').mockReturnValue(new Promise<City[]>(() => {}))
    await renderPlaces({ canEdit: true })
    await openEditor()
    await form().getByRole('searchbox', { name: 'Add a city' }).fill('Leeds')
    await expect.element(form().getByText('Searching…')).toBeVisible()
  })

  it('edits a city already on the map instead of adding it twice', async () => {
    vi.spyOn(api.places, 'searchCities').mockResolvedValue([{ ...ABOUT.places[1], population: 1_800_000 } as City])
    await renderPlaces({ canEdit: true })
    await openEditor()
    await form().getByRole('searchbox', { name: 'Add a city' }).fill('Bucharest')
    await form().getByRole('button', { name: 'Bucharest, Bucureşti, Romania' }).click()
    await expect.element(popup('Bucharest, Bucureşti, Romania').getByRole('button', { name: 'Update place' })).toBeVisible()
  })

  it('needs at least one tick, and closes with Escape or ×, changing nothing', async () => {
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    await form().getByRole('button', { name: 'Edit Bucharest' }).click()
    const dialog = popup('Bucharest, Bucureşti, Romania')
    await dialog.getByRole('checkbox', { name: 'Visited' }).click()
    await dialog.getByRole('button', { name: 'Update place' }).click()
    await expect.element(dialog.getByText('Tick at least one: worked, studied or visited.')).toBeVisible()
    await dialog.getByRole('checkbox', { name: 'Studied' }).click()
    await expect.element(dialog.getByText('Tick at least one: worked, studied or visited.')).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
    await form().getByRole('button', { name: 'Edit Bucharest' }).click()
    await popup('Bucharest, Bucureşti, Romania').getByRole('button', { name: 'Close' }).click()
    await expect.element(popup('Bucharest, Bucureşti, Romania')).not.toBeInTheDocument()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith(VALUE)
  })

  it('opens a place from its pin, updates it, and removes another from the list', async () => {
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    await form().getByRole('group', { name: 'World map' }).getByRole('button', { name: 'Edit Manchester, England, United Kingdom' }).click()
    const dialog = popup('Manchester, England, United Kingdom')
    await dialog.getByRole('checkbox', { name: 'Worked' }).click()
    await dialog.getByRole('button', { name: 'Update place' }).click()
    await form().getByRole('button', { name: 'Remove Bucharest' }).click()
    await page.getByRole('dialog', { name: 'Remove Bucharest?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    const manchester: Place = { ...VALUE.places[0], visits: [VALUE.places[0].visits[0]] }
    expect(onSave).toHaveBeenCalledWith({ ...VALUE, places: [manchester] })
  })

  it('removes the place in the popup, after asking', async () => {
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    await form().getByRole('button', { name: 'Edit Manchester' }).click()
    await popup('Manchester, England, United Kingdom').getByRole('button', { name: 'Remove from map' }).click()
    await page.getByRole('dialog', { name: 'Remove Manchester from the map?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({ ...VALUE, places: [VALUE.places[1]] })
  })

  it("shows a place's errors in the list and on its note", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('/api/about', 400, { 'places[0].visits[0].note': ['Too long.'] }))
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => textOf(form().getByRole('list', { name: 'Places on the map' }))).toContain('Too long.')
    await form().getByRole('button', { name: 'Edit Manchester' }).click()
    await expect.element(popup('Manchester, England, United Kingdom').getByRole('textbox', { name: 'Studied: note (optional)' })).toHaveAccessibleDescription('Too long.')
  })

  it('lists the places alphabetically, whatever their order on the map, and saves them in their order', async () => {
    const at = (id: number, name: string, region: string, country: string): Place => ({
      id,
      name,
      region,
      country,
      latitude: 50,
      longitude: 10,
      visits: [{ kind: 'visited', note: '' }],
    })
    const places = [
      at(1, 'Zürich', 'Zurich', 'Switzerland'),
      ...VALUE.places,
      at(2, 'bath', 'England', 'United Kingdom'),
      at(3, 'Århus', 'Central Jutland', 'Denmark'),
      at(4, 'Aachen', 'North Rhine-Westphalia', 'Germany'),
    ]
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave, value: { ...VALUE, places } })
    await openEditor()
    const rows = () => [...form().getByRole('list', { name: 'Places on the map' }).element().querySelectorAll('.places-list-name')].map((row) => row.firstChild!.textContent)
    expect(rows()).toEqual([
      'Aachen, North Rhine-Westphalia, Germany',
      'Århus, Central Jutland, Denmark',
      'bath, England, United Kingdom',
      'Bucharest, Bucureşti, Romania',
      'Manchester, England, United Kingdom',
      'Zürich, Switzerland',
    ])
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({ ...VALUE, places })
  })

  it('puts a newly added city in its alphabetical place in the list, and at the end of the saved list', async () => {
    vi.spyOn(api.places, 'searchCities').mockResolvedValue([LEEDS])
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    await form().getByRole('searchbox', { name: 'Add a city' }).fill('Leeds')
    await form().getByRole('button', { name: 'Leeds, England, United Kingdom' }).click()
    await popup('Leeds, England, United Kingdom').getByRole('button', { name: 'Add to map' }).click()
    await expect
      .poll(() =>
        form()
          .getByRole('list', { name: 'Places on the map' })
          .getByRole('button', { name: /^Edit / })
          .elements()
          .map((b) => b.getAttribute('aria-label')),
      )
      .toEqual(['Edit Bucharest', 'Edit Leeds', 'Edit Manchester'])
    await form().getByRole('button', { name: 'Save' }).click()
    expect((onSave.mock.calls[0] as unknown as [PlacesValue])[0].places.map((p) => p.name)).toEqual(['Manchester', 'Bucharest', 'Leeds'])
  })

  it('edits and removes the right place from the sorted list, with its own errors', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('/api/about', 400, { 'places[1].name': ['Bad name.'] }))
      .mockResolvedValue(undefined)
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    await form().getByRole('button', { name: 'Save' }).click()
    // Bucharest is second on the map (places[1]) but first in the list: the error goes with it.
    const list = form().getByRole('list', { name: 'Places on the map' })
    await expect.poll(() => textOf(list.getByRole('listitem').first())).toContain('Bad name.')
    expect(textOf(list.getByRole('listitem').last())).not.toContain('Bad name.')
    await form().getByRole('button', { name: 'Edit Bucharest' }).click()
    await expect.element(popup('Bucharest, Bucureşti, Romania')).toBeVisible()
    await popup('Bucharest, Bucureşti, Romania').getByRole('button', { name: 'Close' }).click()
    await form().getByRole('button', { name: 'Remove Manchester' }).click()
    await page.getByRole('dialog', { name: 'Remove Manchester?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenLastCalledWith({ ...VALUE, places: [VALUE.places[1]] })
  })

  it('keeps the open popup on its place when another place is removed from the list', async () => {
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    // Bucharest is places[1]; removing Manchester (places[0]) moves it to places[0].
    await form().getByRole('button', { name: 'Edit Bucharest' }).click()
    const dialog = popup('Bucharest, Bucureşti, Romania')
    await dialog.getByRole('checkbox', { name: 'Worked' }).click()
    await form().getByRole('button', { name: 'Remove Manchester' }).click()
    await page.getByRole('dialog', { name: 'Remove Manchester?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await expect.element(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Update place' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({ ...VALUE, places: [{ ...VALUE.places[1], visits: [{ kind: 'worked', note: '' }, ...VALUE.places[1].visits] }] })
  })

  it('closes the popup when its own place is removed from the list', async () => {
    const onSave = vi.fn(async () => {})
    await renderPlaces({ canEdit: true, onSave })
    await openEditor()
    await form().getByRole('button', { name: 'Edit Manchester' }).click()
    const dialog = popup('Manchester, England, United Kingdom')
    await expect.element(dialog).toBeVisible()
    await form().getByRole('button', { name: 'Remove Manchester' }).click()
    await page.getByRole('dialog', { name: 'Remove Manchester?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({ ...VALUE, places: [VALUE.places[1]] })
  })

  it('zooms to a picked city every time it is picked', async () => {
    vi.spyOn(api.places, 'searchCities').mockResolvedValue([LEEDS])
    await renderPlaces({ canEdit: true })
    await openEditor()
    const svg = form().getByRole('group', { name: 'World map' }).element()
    const full = svg.getAttribute('viewBox')
    const pickLeeds = async () => {
      await form().getByRole('searchbox', { name: 'Add a city' }).fill('Leeds')
      await form().getByRole('button', { name: 'Leeds, England, United Kingdom' }).click()
    }
    await pickLeeds()
    await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(full)
    await popup('Leeds, England, United Kingdom').getByRole('button', { name: 'Close' }).click()
    await form().getByRole('button', { name: 'Show the whole world' }).click()
    expect(svg.getAttribute('viewBox')).toBe(full)
    await pickLeeds()
    await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(full)
  })
})
