import { describe, expect, it } from 'vitest'
import { leetCodeProfileUrl, leetCodeUsernameFrom, toggleList } from './problemSolving'

describe('leetCodeUsernameFrom', () => {
  it.each([
    ['https://leetcode.com/u/neetcode/', 'neetcode'],
    ['leetcode.com/neetcode', 'neetcode'],
    ['  https://www.leetcode.com/u/Claudiu_J-92  ', 'Claudiu_J-92'],
    ['neetcode', 'neetcode'],
    ['https://leetcode.com/problems/two-sum/description/', 'https://leetcode.com/problems/two-sum/description/'],
  ])('%s → %s', (input, username) => {
    expect(leetCodeUsernameFrom(input)).toBe(username)
  })
})

describe('toggleList', () => {
  it('keeps the lists in their usual order', () => {
    expect(toggleList(['neetcode250'], 'blind75')).toEqual(['blind75', 'neetcode250'])
    expect(toggleList(['blind75', 'neetcode250'], 'blind75')).toEqual(['neetcode250'])
  })
})

it('links to the LeetCode profile', () => {
  expect(leetCodeProfileUrl('neetcode')).toBe('https://leetcode.com/u/neetcode/')
})
