import { describe, expect, it } from 'vitest'
import { move, removeAt, replaceAt, sortByEndDate, sortByYear } from './list'

describe('list helpers', () => {
  const list = ['a', 'b', 'c', 'd']

  it('moves, replaces and removes without changing the original', () => {
    expect(move(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(move(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(replaceAt(list, 1, 'B')).toEqual(['a', 'B', 'c', 'd'])
    expect(removeAt(list, 0)).toEqual(['b', 'c', 'd'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sorts by end date: ongoing first, then the latest end, ties by the latest start', () => {
    const items = [
      { id: 'old', start: '2015-01-01', end: '2016-01-01' },
      { id: 'ongoing', start: '2020-01-01', end: null },
      { id: 'recent', start: '2018-01-01', end: '2021-01-01' },
      { id: 'recent-later-start', start: '2019-01-01', end: '2021-01-01' },
    ]
    expect(sortByEndDate(items).map((i) => i.id)).toEqual(['ongoing', 'recent-later-start', 'recent', 'old'])
  })

  it('sorts by year, newest first, keeping the order within a year', () => {
    const items = [{ id: 'a', year: 2020 }, { id: 'b', year: 2023 }, { id: 'c', year: 2020 }]
    expect(sortByYear(items).map((i) => i.id)).toEqual(['b', 'a', 'c'])
  })
})
