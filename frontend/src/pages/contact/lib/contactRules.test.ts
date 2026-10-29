import { describe, expect, it } from 'vitest'
import { MESSAGE_MAX_LENGTH, MESSAGE_MIN_LENGTH, NAME_MAX_LENGTH, validateContact } from './contactRules'

const valid = { name: 'Ada', email: 'ada@example.com', message: 'm'.repeat(MESSAGE_MIN_LENGTH) }

describe('validateContact', () => {
  it('accepts a complete message', () => {
    expect(validateContact(valid)).toEqual({})
  })

  it('requires every field', () => {
    expect(Object.keys(validateContact({ name: ' ', email: '', message: '\n' })).sort()).toEqual(['email', 'message', 'name'])
  })

  it('limits the name length', () => {
    expect(validateContact({ ...valid, name: 'n'.repeat(NAME_MAX_LENGTH) }).name).toBeUndefined()
    expect(validateContact({ ...valid, name: 'n'.repeat(NAME_MAX_LENGTH + 1) }).name).toMatch(/at most 100/)
  })

  it.each([
    ['ada@example.com', true],
    ['ada.lovelace+site@mail.example.co.uk', true],
    ['ada', false],
    ['ada@', false],
    ['@example.com', false],
    ['ada@localhost', false],
    ['ada@example.', false],
    ['Ada <ada@example.com>', false],
    ['ada@example.com, bob@example.com', false],
  ])('email %s is valid: %s', (email, isValid) => {
    expect(validateContact({ ...valid, email }).email === undefined).toBe(isValid)
  })

  it.each([
    [MESSAGE_MIN_LENGTH - 1, /at least 100 characters \(1 more\)/],
    [MESSAGE_MIN_LENGTH, undefined],
    [MESSAGE_MAX_LENGTH, undefined],
    [MESSAGE_MAX_LENGTH + 1, /at most 1000/],
  ])('a message of %i characters gives %s', (length, error) => {
    const result = validateContact({ ...valid, message: 'm'.repeat(length) }).message
    if (error) expect(result).toMatch(error)
    else expect(result).toBeUndefined()
  })

  it('counts the message without surrounding whitespace', () => {
    expect(validateContact({ ...valid, message: `   ${'m'.repeat(MESSAGE_MIN_LENGTH - 1)}\n\n` }).message).toBeDefined()
  })
})
