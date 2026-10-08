import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findBestRoute, joinRoute, normalizeUrl } from '../src/shared/routes.ts'

describe('normalizeUrl', () => {
  it('strips base-url placeholders, origins, queries and globs', () => {
    assert.equal(normalizeUrl('${API_BASE_URL}/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}'), '/api/auth/login')
    assert.equal(normalizeUrl('{{Portfolio.Api_HostAddress}}/api/firstname'), '/api/firstname')
    assert.equal(normalizeUrl('http://localhost:5105/api/health'), '/api/health')
    assert.equal(normalizeUrl('**/api/auth/me'), '/api/auth/me')
    assert.equal(normalizeUrl('/admin?error=not_authorized'), '/admin')
    assert.equal(normalizeUrl('/api/books/'), '/api/books')
    assert.equal(normalizeUrl('/'), '/')
  })

  it('rejects things that are not paths', () => {
    assert.equal(normalizeUrl('hello'), null)
    assert.equal(normalizeUrl('${path}'), null)
    assert.equal(normalizeUrl(''), null)
  })
})

describe('findBestRoute', () => {
  const routes = [
    { method: 'GET', path: '/api/books', value: 'list' },
    { method: 'GET', path: '/api/books/{id:int}', value: 'get' },
    { method: 'POST', path: '/api/books', value: 'create' },
    { method: 'GET', path: '/api/books/featured', value: 'featured' },
    { method: 'ANY', path: '/api/health', value: 'health' },
    { method: 'GET', path: '/files/{*path}', value: 'files' },
  ]

  it('matches literal paths exactly and respects the method', () => {
    assert.deepEqual(findBestRoute('GET', '/api/books', routes), { value: 'list', score: 1 })
    assert.equal(findBestRoute('POST', '/api/books', routes)?.value, 'create')
    assert.equal(findBestRoute('DELETE', '/api/books', routes), null)
  })

  it('matches parameters, preferring literal segments', () => {
    assert.equal(findBestRoute('GET', '/api/books/42', routes)?.value, 'get')
    assert.equal(findBestRoute('GET', '/api/books/featured', routes)?.value, 'featured')
    assert.equal(findBestRoute('GET', '`${base}/api/books/${id}`'.slice(1, -1), routes)?.value, 'get')
  })

  it('handles ANY methods and catch-alls', () => {
    assert.equal(findBestRoute('GET', '/api/health', routes)?.value, 'health')
    assert.equal(findBestRoute('GET', '/files/a/b/c.txt', routes)?.value, 'files')
    assert.equal(findBestRoute(undefined, '/api/books', routes)?.value, 'list')
  })

  it('reports no match for unknown routes', () => {
    assert.equal(findBestRoute('GET', '/api/nope', routes), null)
  })

  it('joins prefixes like MapGroup does', () => {
    assert.equal(joinRoute('/api', '/auth', '/me'), '/api/auth/me')
    assert.equal(joinRoute('', '/health'), '/health')
    assert.equal(joinRoute('/api/', 'books/'), '/api/books')
    assert.equal(joinRoute('', ''), '/')
  })
})
