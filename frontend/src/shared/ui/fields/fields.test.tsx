import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { a11yViolations } from '@/test/a11y'
import { AddButton } from './AddButton/AddButton'
import { CheckboxGroup } from './CheckboxGroup/CheckboxGroup'
import { ColorField } from './ColorField/ColorField'
import { ItemControls } from './ItemControls/ItemControls'
import { MonthField } from './MonthField/MonthField'
import { TextField } from './TextField/TextField'

/** A text field that keeps its value, like an editor's draft. */
function StatefulText({ initial = '', onValue, ...props }: { initial?: string; onValue?: (v: string) => void } & Omit<Parameters<typeof TextField>[0], 'value' | 'onChange'>) {
  const [value, setValue] = useState(initial)
  return (
    <form onSubmit={(e) => (e.preventDefault(), onValue?.('submitted'))}>
      <TextField
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v)
          onValue?.(v)
        }}
      />
      <output data-testid="value">{value}</output>
    </form>
  )
}

const value = () => page.getByTestId('value').element().textContent

describe('TextField', () => {
  it('is a labelled box that reports what is typed', async () => {
    const onValue = vi.fn()
    await render(<StatefulText label="Title" onValue={onValue} required placeholder="e.g. Lighthouse" />)
    const box = page.getByRole('textbox', { name: 'Title' })
    await expect.element(box).toHaveAttribute('required')
    await expect.element(box).toHaveAttribute('placeholder', 'e.g. Lighthouse')
    await box.fill('Pocket')
    expect(value()).toBe('Pocket')
    expect(onValue).toHaveBeenLastCalledWith('Pocket')
  })

  it('describes the box with its hint and error, and marks it invalid', async () => {
    await render(<StatefulText label="GitHub URL" type="url" hint="Leave empty to hide it." error="That isn't a link." />)
    const box = page.getByRole('textbox', { name: 'GitHub URL' })
    await expect.element(box).toHaveAttribute('type', 'url')
    await expect.element(box).toHaveAttribute('aria-invalid', 'true')
    await expect.element(box).toHaveAccessibleDescription("Leave empty to hide it. That isn't a link.")
  })

  it('has no description or invalid mark without a hint or error', async () => {
    await render(<StatefulText label="Plain" />)
    const box = page.getByRole('textbox', { name: 'Plain' })
    await expect.element(box).not.toHaveAttribute('aria-invalid')
    await expect.element(box).not.toHaveAttribute('aria-describedby')
  })

  it('can be a text area', async () => {
    await render(<StatefulText label="Description" multiline initial={'line one\nline two'} />)
    const area = page.getByRole('textbox', { name: 'Description' })
    expect(area.element().tagName).toBe('TEXTAREA')
    await expect.element(area).toHaveValue('line one\nline two')
  })

  it('offers suggestions while typing', async () => {
    await render(<StatefulText label="Store" suggestions={['App Store', 'Steam']} />)
    const box = page.getByRole('combobox', { name: 'Store' }).element() as HTMLInputElement
    expect(box.list?.querySelectorAll('option')).toHaveLength(2)
    expect([...box.list!.querySelectorAll('option')].map((o) => o.value)).toEqual(['App Store', 'Steam'])
  })
})

describe('Add link', () => {
  const field = () => page.getByRole('textbox', { name: 'Note' })
  const group = () => page.getByRole('group', { name: 'Add a link to Note' })

  it('wraps the selected words in a link', async () => {
    await render(<StatefulText label="Note" allowLinks initial="BSc at Uni, 2022" />)
    // Select "Uni" with the keyboard, as a person would.
    await field().click()
    await userEvent.keyboard('{Home}')
    for (let i = 0; i < 7; i++) await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}')
    await page.getByRole('button', { name: 'Add link to Note' }).click()
    await expect.element(group().getByRole('textbox', { name: 'Link text' })).toHaveValue('Uni')
    await group().getByRole('textbox', { name: 'Link URL' }).fill('https://uni.ac.uk')
    await group().getByRole('button', { name: 'Insert link' }).click()
    expect(value()).toBe('BSc at [Uni](https://uni.ac.uk), 2022')
    await expect.element(group()).not.toBeInTheDocument()
    await expect.element(field()).toHaveFocus()
  })

  it('adds the link at the end when the field was never clicked', async () => {
    await render(<StatefulText label="Note" allowLinks initial="See " />)
    await page.getByRole('button', { name: 'Add link to Note' }).click()
    await group().getByRole('textbox', { name: 'Link text' }).fill('my site')
    await group().getByRole('textbox', { name: 'Link URL' }).fill('/about')
    await group().getByRole('button', { name: 'Insert link' }).click()
    expect(value()).toBe('See [my site](/about)')
  })

  it('refuses a link that is not one (or just "https://"), and says why', async () => {
    await render(<StatefulText label="Note" allowLinks />)
    await page.getByRole('button', { name: 'Add link to Note' }).click()
    const url = group().getByRole('textbox', { name: 'Link URL' })
    await expect.element(url).toHaveValue('https://')
    await group().getByRole('button', { name: 'Insert link' }).click()
    await expect.element(url).toHaveAttribute('aria-invalid', 'true')
    await expect.element(url).toHaveAccessibleDescription('Enter a full link (https://…) or a path on this site (/…).')
    await url.fill('javascript:alert(1)')
    await expect.element(url).not.toHaveAttribute('aria-invalid')
    await group().getByRole('button', { name: 'Insert link' }).click()
    await expect.element(url).toHaveAttribute('aria-invalid', 'true')
    expect(value()).toBe('')
  })

  it('inserts with Enter without submitting the form, and closes with Escape or Cancel', async () => {
    const onValue = vi.fn()
    await render(<StatefulText label="Note" allowLinks onValue={onValue} />)
    await page.getByRole('button', { name: 'Add link to Note' }).click()
    await group().getByRole('textbox', { name: 'Link URL' }).fill('https://x.dev')
    await userEvent.keyboard('{Enter}')
    expect(value()).toBe('[https://x.dev](https://x.dev)')
    expect(onValue).not.toHaveBeenCalledWith('submitted')

    await page.getByRole('button', { name: 'Add link to Note' }).click()
    await group().getByRole('textbox', { name: 'Link URL' }).click()
    await userEvent.keyboard('{Escape}')
    await expect.element(group()).not.toBeInTheDocument()

    await page.getByRole('button', { name: 'Add link to Note' }).click()
    await group().getByRole('button', { name: 'Cancel' }).click()
    await expect.element(group()).not.toBeInTheDocument()
    expect(value()).toBe('[https://x.dev](https://x.dev)')
  })

  it('drops brackets from the link text', async () => {
    await render(<StatefulText label="Note" allowLinks />)
    await page.getByRole('button', { name: 'Add link to Note' }).click()
    await group().getByRole('textbox', { name: 'Link text' }).fill('[odd] text')
    await group().getByRole('textbox', { name: 'Link URL' }).fill('https://x.dev')
    await group().getByRole('button', { name: 'Insert link' }).click()
    expect(value()).toBe('[odd text](https://x.dev)')
  })
})

describe('MonthField', () => {
  function Month({ initial, error, onValue }: { initial: string; error?: string; onValue?: (v: string) => void }) {
    const [month, setMonth] = useState(initial)
    return (
      <>
        <MonthField
          label="Start"
          value={month}
          error={error}
          onChange={(v) => {
            setMonth(v)
            onValue?.(v)
          }}
        />
        <button type="button" onClick={() => setMonth('2019-02-01')}>
          Elsewhere
        </button>
        <output data-testid="value">{month}</output>
      </>
    )
  }

  it('shows the month and year, and changes either', async () => {
    await render(<Month initial="2023-05-01" />)
    await expect.element(page.getByRole('combobox', { name: 'Start month' })).toHaveDisplayValue('May')
    await expect.element(page.getByRole('textbox', { name: 'Start year' })).toHaveValue('2023')
    await page.getByRole('combobox', { name: 'Start month' }).selectOptions('November')
    expect(value()).toBe('2023-11-01')
    await page.getByRole('textbox', { name: 'Start year' }).fill('2024')
    expect(value()).toBe('2024-11-01')
  })

  it('keeps a half-typed year without changing the value, and marks it', async () => {
    const onValue = vi.fn()
    await render(<Month initial="2023-05-01" onValue={onValue} />)
    const year = page.getByRole('textbox', { name: 'Start year' })
    await year.fill('20')
    await expect.element(year).toHaveValue('20')
    await expect.element(year).toHaveAttribute('aria-invalid', 'true')
    expect(onValue).not.toHaveBeenCalled()
    expect(value()).toBe('2023-05-01')
  })

  it('shows a new value given from outside', async () => {
    await render(<Month initial="2023-05-01" />)
    await page.getByRole('textbox', { name: 'Start year' }).fill('20')
    await page.getByRole('button', { name: 'Elsewhere' }).click()
    await expect.element(page.getByRole('textbox', { name: 'Start year' })).toHaveValue('2019')
    await expect.element(page.getByRole('combobox', { name: 'Start month' })).toHaveDisplayValue('February')
  })

  it('is a named group, described by its error', async () => {
    await render(<Month initial="2023-05-01" error="Must be after the start." />)
    await expect.element(page.getByRole('group', { name: 'Start' })).toHaveAccessibleDescription('Must be after the start.')
    await expect.element(page.getByRole('textbox', { name: 'Start year' })).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('CheckboxGroup', () => {
  function Uses({ error }: { error?: string }) {
    const [value, setValue] = useState<('work' | 'academic' | 'personal')[]>(['personal'])
    return (
      <>
        <CheckboxGroup
          label="Used for"
          options={['work', 'academic', 'personal'] as const}
          value={value}
          onChange={setValue}
          labelFor={(o) => o.toUpperCase()}
          colorFor={() => '#ff0000'}
          error={error}
        />
        <output data-testid="value">{value.join(',')}</output>
      </>
    )
  }

  it("keeps the options' own order, whatever order they're ticked in", async () => {
    await render(<Uses />)
    await page.getByRole('checkbox', { name: 'WORK' }).click()
    expect(value()).toBe('work,personal')
    await page.getByRole('checkbox', { name: 'ACADEMIC' }).click()
    expect(value()).toBe('work,academic,personal')
    await page.getByRole('checkbox', { name: 'PERSONAL' }).click()
    expect(value()).toBe('work,academic')
  })

  it('is a named group with a colour swatch per option, described by its error', async () => {
    await render(<Uses error="Tick at least one." />)
    await expect.element(page.getByRole('group', { name: 'Used for' })).toHaveAccessibleDescription('Tick at least one.')
    expect(document.querySelectorAll('.legend-swatch')).toHaveLength(3)
  })
})

describe('ColorField', () => {
  it('shows the colour and reports a new one', async () => {
    const onChange = vi.fn()
    await render(<ColorField label="Work" value="#3b82f6" onChange={onChange} error="Use #rrggbb." />)
    const input = page.getByLabelText('Work')
    await expect.element(input).toHaveValue('#3b82f6')
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    await expect.element(input).toHaveAccessibleDescription('Use #rrggbb.')
    await input.fill('#ff0000')
    expect(onChange).toHaveBeenCalledWith('#ff0000')
  })
})

describe('ItemControls', () => {
  it('moves an item, but not past either end', async () => {
    const onMove = vi.fn()
    await render(
      <>
        <ItemControls name="role 1" index={0} count={3} onMove={onMove} onRemove={() => {}} />
        <ItemControls name="role 3" index={2} count={3} onMove={onMove} onRemove={() => {}} />
      </>,
    )
    await expect.element(page.getByRole('button', { name: 'Move role 1 up' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'Move role 3 down' })).toBeDisabled()
    await page.getByRole('button', { name: 'Move role 1 down' }).click()
    expect(onMove).toHaveBeenLastCalledWith(0, 1)
    await page.getByRole('button', { name: 'Move role 3 up' }).click()
    expect(onMove).toHaveBeenLastCalledWith(2, 1)
  })

  it('asks before removing, saying nothing is lost until the section is saved', async () => {
    const onRemove = vi.fn()
    await render(<ItemControls name="role 2" index={1} count={3} onRemove={onRemove} />)
    expect(page.getByRole('button', { name: /^Move/ }).elements()).toHaveLength(0)
    await page.getByRole('button', { name: 'Remove role 2' }).click()
    const confirm = page.getByRole('dialog', { name: 'Remove role 2?' })
    await expect.element(confirm).toBeVisible()
    expect(confirm.element().textContent).toContain('It goes when you save this section; Cancel brings it back.')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    expect(onRemove).not.toHaveBeenCalled()
    await page.getByRole('button', { name: 'Remove role 2' }).click()
    await page.getByRole('dialog', { name: 'Remove role 2?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    expect(onRemove).toHaveBeenCalledOnce()
  })
})

describe('AddButton', () => {
  it('adds', async () => {
    const onClick = vi.fn()
    await render(<AddButton onClick={onClick}>Add skill</AddButton>)
    await page.getByRole('button', { name: 'Add skill' }).click()
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('fields, accessibility', () => {
  it('has no WCAG problems: every field with a hint, an error, and links', async () => {
    document.documentElement.dataset.theme = 'light'
    await render(
      <main>
        <StatefulText label="Title" hint="A hint." error="An error." allowLinks />
        <ColorField label="Work" value="#3b82f6" onChange={() => {}} />
        <CheckboxGroup label="Used for" options={['a', 'b'] as const} value={['a']} onChange={() => {}} labelFor={(o) => o} error="Pick one." />
        <ItemControls name="row 1" index={0} count={2} onMove={() => {}} onRemove={() => {}} />
        <AddButton onClick={() => {}}>Add row</AddButton>
      </main>,
    )
    expect(await a11yViolations()).toEqual([])
  })
})
