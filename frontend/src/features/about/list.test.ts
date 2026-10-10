import { describe, expect, it } from 'vitest'
import { move, sortByEndDate } from './list'

describe('sortByEndDate', () => {
  it('puts ongoing entries first, then the latest end, then the latest start', () => {
    const items = [
      { name: 'old', start: '2010-01-01', end: '2012-01-01' },
      { name: 'ended', start: '2018-01-01', end: '2022-06-01' },
      { name: 'current', start: '2020-01-01', end: null },
      { name: 'later start, same end', start: '2021-01-01', end: '2022-06-01' },
      { name: 'newer current', start: '2024-01-01', end: null },
    ]

    expect(sortByEndDate(items).map((i) => i.name)).toEqual(['newer current', 'current', 'later start, same end', 'ended', 'old'])
  })

  it('returns a new array', () => {
    const items = [{ start: '2020-01-01', end: null }]
    expect(sortByEndDate(items)).not.toBe(items)
  })
})

describe('move', () => {
  it('moves an item to a new position', () => {
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
})
