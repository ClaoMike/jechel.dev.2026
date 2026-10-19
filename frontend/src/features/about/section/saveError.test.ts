import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../services/api'
import { describeErrorKey, describeSaveError, owns } from './saveError'

describe("a section's save errors", () => {
  it('knows which keys a section owns', () => {
    expect(owns(['skills'], 'skills')).toBe(true)
    expect(owns(['skills'], 'skills[2].name')).toBe(true)
    expect(owns(['colors.skills'], 'colors.skills.work')).toBe(true)
    expect(owns(['skills'], 'skillsets')).toBe(false)
    expect(owns(['skills'], 'papers[0].title')).toBe(false)
  })

  it('names the section and item an error is about', () => {
    expect(describeErrorKey('skills[2].periods[0].uses')).toBe('Skills, item 3')
    expect(describeErrorKey('colors.places.worked')).toBe("Where I've been")
    expect(describeErrorKey('photoUrl')).toBe('Photo and links')
    expect(describeErrorKey('contact.phone')).toBe('Photo and links')
    expect(describeErrorKey('mystery')).toBe('mystery')
  })

  it("puts its own field errors in place, with a short message", () => {
    const error = new ApiError('/api/about', 400, { 'skills[0].name': ['Required.', 'Too short.'] })
    expect(describeSaveError(error, ['skills'])).toEqual({ errors: { 'skills[0].name': 'Required.' }, message: 'Some fields need fixing; see the messages above.' })
  })

  it('spells out errors from other sections (up to three, then how many more)', () => {
    const error = new ApiError('/api/about', 400, {
      'papers[0].title': ['Required.'],
      'languages[1].name': ['Required.'],
      photoUrl: ['Bad link.'],
      'hackathons[0].year': ['Too early.'],
    })
    const { message } = describeSaveError(error, ['skills'])
    expect(message).toBe("Couldn't save, because another section needs fixing first. Academic papers, item 1: Required. Languages, item 2: Required. Photo and links: Bad link. (and 1 more)")
  })

  it('says the session ended on a 401, and to try again otherwise', () => {
    expect(describeSaveError(new ApiError('/api/about', 401), ['skills'])).toEqual({ errors: {}, message: 'Your session has ended. Sign in again, then save.' })
    expect(describeSaveError(new ApiError('/api/about', 500), ['skills']).message).toBe("Couldn't save. Please try again.")
    expect(describeSaveError(new Error('network'), ['skills']).message).toBe("Couldn't save. Please try again.")
  })
})
