/**
 * The AI assistant in the browser, against a real repository and a fake Anthropic API (scripted
 * replies, no network): settings and the key, the dock on every view, context chips, streamed answers,
 * approving and declining changes (the code panel shows them), stopping, chats, and accessibility.
 */
import type { Page } from '@playwright/test'
import { mapLoaded, violations, watchErrors } from './helpers.ts'
import { BOOK_CARD_FILE, expect, test, type Repo } from './repo-fixture.ts'

const dock = (page: Page) => page.getByTestId('assistant')
const settings = (page: Page) => page.getByTestId('settings')

/** The text of the user message in a recorded request. */
const sentText = (repo: Repo, n = -1) => {
  const messages = repo.ai.messages.at(n)!.body.messages as { role: string; content: { type: string; text?: string }[] }[]
  return messages.filter((m) => m.role === 'user').at(-1)!.content[0].text!
}

async function addKey(page: Page): Promise<void> {
  await page.getByTestId('settings-button').click()
  await settings(page).getByTestId('api-key').fill('sk-ant-api03-e2e-test-key-1234')
  await settings(page).getByRole('button', { name: 'Save key' }).click()
  await expect(settings(page).getByTestId('key-status')).toContainText('sk-ant-…1234')
  await page.keyboard.press('Escape')
}

async function openApp(page: Page, repo: Repo, withKey = true): Promise<void> {
  await page.goto(`${repo.url}/`)
  await mapLoaded(page)
  await expect(page.getByTestId('assistant-toggle')).toBeVisible()
  if (withKey) await addKey(page)
}

async function ask(page: Page, text: string): Promise<void> {
  await dock(page).getByTestId('chat-input').fill(text)
  await dock(page).getByTestId('chat-input').press('Enter')
}

test.describe('assistant', () => {
  test.use({ withAI: true })

  test('settings keep the key on the server and offer its models', async ({ page, repo }) => {
    const errors = watchErrors(page)
    await openApp(page, repo, false)
    await page.getByTestId('assistant-toggle').click()
    await expect(dock(page)).toContainText('Connect Claude')
    await dock(page).getByRole('button', { name: 'Add an API key' }).click()
    await expect(settings(page)).toBeVisible()
    await expect(settings(page).getByTestId('provider-select').locator('option', { hasText: 'OpenAI' })).toHaveAttribute('disabled', '')
    await settings(page).getByTestId('api-key').fill('sk-ant-api03-very-secret-value-9876')
    await settings(page).getByRole('button', { name: 'Save key' }).click()
    await expect(settings(page).getByTestId('key-status')).toContainText('sk-ant-…9876')
    await expect(settings(page).getByTestId('api-key')).toHaveValue('')
    expect(await page.content()).not.toContain('very-secret-value')
    // Models come from the API.
    await expect(settings(page).getByTestId('settings-model').locator('option')).toHaveText(['Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 4.5'])
    await settings(page).getByTestId('settings-model').selectOption('claude-sonnet-5-5')
    await settings(page).getByRole('button', { name: 'xhigh' }).click()
    await settings(page).getByRole('radio', { name: /Accept edits/ }).check()
    await page.keyboard.press('Escape')
    await expect(dock(page).getByTestId('model-select')).toHaveValue('claude-sonnet-5-5')
    await expect(dock(page).getByTestId('mode-select')).toHaveValue('edits')

    repo.ai.reply({ content: [{ type: 'text', text: 'Hello.' }] })
    await ask(page, 'hi')
    await expect(dock(page).getByTestId('chat-assistant')).toContainText('Hello.')
    const body = repo.ai.messages.at(-1)!.body
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.output_config).toEqual({ effort: 'xhigh' })
    expect(repo.ai.messages.at(-1)!.headers['x-api-key']).toBe('sk-ant-api03-very-secret-value-9876')
    expect(errors).toEqual([])
  })

  test('answers about the selected node, with it attached as context', async ({ page, repo }) => {
    const errors = watchErrors(page)
    await openApp(page, repo)
    await page.getByTestId('search').fill('BookCard')
    await page.getByTestId('search').press('Enter')
    await expect(page.getByTestId('details').getByRole('heading', { name: 'BookCard' })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+j')
    await expect(dock(page)).toBeVisible()
    await expect(dock(page).getByTestId('chat-input')).toBeFocused()
    const chips = dock(page).getByTestId('context-chips')
    await expect(chips).toContainText('BookCard · Component')

    repo.ai.reply({ content: [{ type: 'thinking', thinking: 'It is a card.' }, { type: 'text', text: '**BookCard** renders a title.\n\n- in `web/src`\n- no calls' }] })
    await ask(page, 'What is this?')
    const answer = dock(page).getByTestId('chat-assistant')
    await expect(answer.locator('strong')).toHaveText('BookCard')
    await expect(answer.locator('li')).toHaveCount(2)
    await expect(answer.locator('code')).toHaveText('web/src')
    await expect(answer.locator('summary')).toHaveText('Thinking')
    await expect(dock(page).getByTestId('chat-user')).toContainText('BookCard · Component')
    expect(sentText(repo)).toMatch(/^<context>\n<node label="BookCard · Component">\nBookCard - Component on the Frontend layer/)
    expect(sentText(repo)).toMatch(/What is this\?$/)
    expect(errors).toEqual([])
  })

  test('edits the open file after approval, and the editor shows the change', async ({ page, repo }) => {
    await openApp(page, repo)
    await page.getByTestId('search').fill('BookCard')
    await page.getByTestId('search').press('Enter')
    await page.getByTestId('view-code').click()
    const code = page.getByTestId('code-viewer')
    await expect(code.locator('.cm-content')).toContainText('export function BookCard', { timeout: 15_000 })
    // Select the return line, then ask about it.
    await code.locator('.cm-line', { hasText: 'return <article' }).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await code.getByTestId('ask-claude').click()
    const chips = dock(page).getByTestId('context-chips')
    await expect(chips).toContainText('BookCard.tsx:6')
    await expect(dock(page).getByTestId('chat-input')).toBeFocused()

    repo.ai.reply(
      {
        content: [
          { type: 'text', text: 'I will wrap the title in a heading.' },
          { type: 'tool_use', id: 'edit1', name: 'str_replace_based_edit_tool', input: { command: 'str_replace', path: BOOK_CARD_FILE, old_str: '{title}</article>', new_str: '<h3>{title}</h3></article>' } },
        ],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'Done: the title is now an `h3`.' }] },
    )
    await ask(page, 'Make the title a heading')
    expect(sentText(repo)).toContain('<selection label="BookCard.tsx:6">')
    const step = dock(page).getByTestId('chat-tool')
    await expect(step).toHaveAttribute('data-status', 'waiting')
    await expect(step).toContainText(`Edit ${BOOK_CARD_FILE}`)
    await expect(step.locator('.chat-diff .add')).toContainText('<h3>{title}</h3>')
    expect(repo.read(BOOK_CARD_FILE)).not.toContain('<h3>')
    await step.getByTestId('approve-allow').click()
    await expect(dock(page).getByTestId('chat-assistant').last()).toContainText('the title is now an h3')
    await expect(step).toHaveAttribute('data-status', 'done')
    expect(repo.read(BOOK_CARD_FILE)).toContain('<h3>{title}</h3>')
    // The open editor reloads the file Claude changed.
    await expect(code.locator('.cm-content')).toContainText('<h3>{title}</h3>')
    // The tool result went back to Claude.
    const results = (repo.ai.messages.at(-1)!.body.messages as { content: { type: string; content?: string }[] }[]).at(-1)!.content
    expect(results[0]).toMatchObject({ type: 'tool_result', content: `Edited ${BOOK_CARD_FILE}` })
  })

  test('a declined change is not made, and chips can be taken off', async ({ page, repo }) => {
    await openApp(page, repo)
    await page.getByTestId('search').fill('BookCard')
    await page.getByTestId('search').press('Enter')
    await page.getByTestId('assistant-toggle').click()
    const chip = dock(page).getByTestId('context-chips').getByRole('button', { name: /BookCard · Component/ })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    repo.ai.reply(
      { content: [{ type: 'tool_use', id: 'sh', name: 'bash', input: { command: 'rm -rf web' } }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'OK, left it.' }] },
    )
    await ask(page, 'clean up')
    expect(sentText(repo)).toBe('clean up')
    const step = dock(page).getByTestId('chat-tool')
    await expect(step).toContainText('Run rm -rf web')
    await expect(step.locator('.chat-tool-command')).toHaveText('$ rm -rf web')
    await step.getByTestId('approve-deny').click()
    await expect(dock(page).getByText('OK, left it.')).toBeVisible()
    await expect(step).toHaveAttribute('data-status', 'denied')
    expect(repo.read(BOOK_CARD_FILE)).toContain('BookCard')
  })

  test('stops a running answer', async ({ page, repo }) => {
    await openApp(page, repo)
    await page.getByTestId('assistant-toggle').click()
    repo.ai.reply({ content: [{ type: 'text', text: 'never shown' }], delayMs: 5000 })
    await ask(page, 'take your time')
    await expect(dock(page).getByRole('status').filter({ hasText: 'Claude is working' })).toBeVisible()
    await dock(page).getByTestId('chat-stop').click()
    await expect(dock(page).locator('.chat-notice')).toHaveText('Stopped.')
    await expect(dock(page).getByTestId('chat-send')).toBeVisible()
    await expect(dock(page)).not.toContainText('never shown')
  })

  test('stays with you across tabs, attaches the selected commit, and keeps its chats', async ({ page, repo }) => {
    await openApp(page, repo)
    await page.getByTestId('assistant-toggle').click()
    repo.ai.reply({ content: [{ type: 'text', text: 'First answer.' }] })
    await ask(page, 'first question')
    await expect(dock(page).getByText('First answer.')).toBeVisible()

    await page.getByTestId('tab-git').click()
    await expect(dock(page)).toBeVisible()
    const head = repo.git('rev-parse', 'HEAD')
    await page.locator(`[data-hash^="${head.slice(0, 7)}"]`).click()
    await expect(dock(page).getByTestId('context-chips')).toContainText(`${head.slice(0, 7)} Describe the project`)

    // A new chat, then back to the first one.
    await dock(page).getByRole('button', { name: 'New chat' }).click()
    await expect(dock(page).getByText('First answer.')).toHaveCount(0)
    await dock(page).getByTestId('chat-menu').click()
    await page.getByTestId('chat-menu-menu').getByRole('menuitem', { name: /first question/ }).click()
    await expect(dock(page).getByText('First answer.')).toBeVisible()

    // ⌘J hides it; the page gets its room back.
    await page.keyboard.press('ControlOrMeta+j')
    await expect(dock(page)).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('assistant-toggle')).toHaveAttribute('aria-pressed', 'false')
  })
})

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility of the assistant, ${theme} theme`, () => {
    test.use({ withAI: true, colorScheme: theme, reducedMotion: 'reduce' })

    test('the dock with an approval, and the settings', async ({ page, repo }) => {
      await openApp(page, repo)
      await page.getByTestId('assistant-toggle').click()
      repo.ai.reply({ content: [{ type: 'text', text: 'Making a file.' }, { type: 'tool_use', id: 't', name: 'str_replace_based_edit_tool', input: { command: 'create', path: 'notes.md', file_text: '# Notes\n' } }], stop_reason: 'tool_use' })
      await ask(page, 'add notes')
      await expect(dock(page).getByTestId('approve-allow')).toBeVisible()
      expect(await violations(page), 'dock').toEqual([])
      await dock(page).getByTestId('approve-deny').click()
      await page.getByTestId('settings-button').click()
      await expect(settings(page)).toBeVisible()
      expect(await violations(page), 'settings').toEqual([])
    })
  })
}

test('is not offered when the server is read-only', async ({ page }) => {
  await page.goto('/')
  await mapLoaded(page)
  await expect(page.getByTestId('assistant-toggle')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+j')
  await expect(page.getByTestId('assistant')).toHaveCount(0)
})
