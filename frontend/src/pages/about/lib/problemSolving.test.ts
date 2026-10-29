import { describe, expect, it } from 'vitest'
import { leetCodeProfileUrl, leetCodeUsernameFrom, toggleList } from './problemSolving'

describe('problem solving', () => {
  it('links to a LeetCode profile, encoding the name', () => {
    expect(leetCodeProfileUrl('neetcode')).toBe('https://leetcode.com/u/neetcode/')
    expect(leetCodeProfileUrl('a b')).toBe('https://leetcode.com/u/a%20b/')
  })

  it('turns a pasted profile link into the username; anything else stays as typed', () => {
    expect(leetCodeUsernameFrom('https://leetcode.com/u/neetcode/')).toBe('neetcode')
    expect(leetCodeUsernameFrom('leetcode.com/neetcode')).toBe('neetcode')
    expect(leetCodeUsernameFrom('  https://www.leetcode.com/u/Jechel_1  ')).toBe('Jechel_1')
    expect(leetCodeUsernameFrom('jechel')).toBe('jechel')
    expect(leetCodeUsernameFrom('https://example.com/u/x')).toBe('https://example.com/u/x')
  })

  it('ticks and unticks a list, keeping the lists in their order', () => {
    expect(toggleList(['neetcode150'], 'blind75')).toEqual(['blind75', 'neetcode150'])
    expect(toggleList(['blind75', 'neetcode150'], 'blind75')).toEqual(['neetcode150'])
    expect(toggleList([], 'neetcode250')).toEqual(['neetcode250'])
  })
})
