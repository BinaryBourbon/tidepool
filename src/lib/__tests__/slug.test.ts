import { slugify } from '../slug'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
  it('removes special characters', () => {
    expect(slugify('Fix: auth bug!')).toBe('fix-auth-bug')
  })
  it('trims leading/trailing whitespace and hyphens', () => {
    expect(slugify('  test  ')).toBe('test')
  })
  it('collapses consecutive special chars into one hyphen', () => {
    expect(slugify('foo -- bar')).toBe('foo-bar')
  })
  it('truncates to 80 characters', () => {
    expect(slugify('a'.repeat(100))).toHaveLength(80)
  })
})
