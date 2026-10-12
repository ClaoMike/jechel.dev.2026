import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeSwitch } from './ThemeSwitch'

describe('ThemeSwitch', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('starts on Vice mode for first-time visitors', () => {
    render(<ThemeSwitch />)

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Vice mode' })).toBeChecked()
  })

  it('switches the theme and remembers it', async () => {
    render(<ThemeSwitch />)

    await userEvent.click(screen.getByRole('radio', { name: 'Light mode' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')

    await userEvent.click(screen.getByRole('radio', { name: 'Vice mode' }))
    expect(document.documentElement.dataset.theme).toBe('vice')
  })

  it('opens on the theme chosen last time', () => {
    localStorage.setItem('theme', 'light')
    render(<ThemeSwitch />)

    expect(screen.getByRole('radio', { name: 'Light mode' })).toBeChecked()
  })

  it('opens on Vice for visitors who chose it under its old name', () => {
    localStorage.setItem('theme', 'rstar')
    render(<ThemeSwitch />)

    expect(screen.getByRole('radio', { name: 'Vice mode' })).toBeChecked()
  })

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem('theme', 'neon')
    render(<ThemeSwitch />)

    expect(screen.getByRole('radio', { name: 'Vice mode' })).toBeChecked()
  })
})
