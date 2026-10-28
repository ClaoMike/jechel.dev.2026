/**
 * What new files start with (so the map shows them as what they are), where the real config puts a
 * new path, and the explorer's folder tree.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { loadConfig, TOOL_ROOT } from '../src/core/config.ts'
import { classifyPath } from '../src/core/serve.ts'
import { csharpNamespace, templateFor } from '../viewer/src/model/templates.ts'
import { buildTree } from '../viewer/src/model/tree.ts'

describe('new file templates', () => {
  it('writes a React component, hook, module or test by name', () => {
    assert.deepEqual(templateFor('web/src/BookList.tsx'), { label: 'React component BookList', content: 'export function BookList() {\n  return <div>BookList</div>\n}\n' })
    assert.equal(templateFor('web/src/book-list.tsx')?.label, 'React component BookList', 'kebab-case becomes PascalCase')
    assert.equal(templateFor('web/src/hooks/useBooks.ts')?.label, 'React hook useBooks')
    assert.match(templateFor('web/src/hooks/useBooks.ts')!.content, /export function useBooks\(\)/)
    assert.deepEqual(templateFor('web/src/format-date.ts'), { label: 'Module with a function formatDate', content: 'export function formatDate(): void {\n}\n' })
    assert.match(templateFor('web/src/BookList.test.tsx')!.content, /describe\('BookList'/)
    assert.equal(templateFor('web/src/2fa.tsx')?.label, 'React component _2fa', 'identifiers never start with a digit')
    assert.equal(templateFor('web/src/types.d.ts'), null)
  })

  it('puts C# classes in the namespace of their project and folder', () => {
    const files = ['api/src/Shop.Api/Shop.Api.csproj', 'api/tests/Shop.Tests/Shop.Tests.csproj', 'Other.csproj']
    assert.equal(csharpNamespace('api/src/Shop.Api/Services/order-flow', files), 'Shop.Api.Services.OrderFlow')
    assert.equal(csharpNamespace('api/src/Shop.Api', files), 'Shop.Api')
    assert.equal(csharpNamespace('docs', files), 'Other.Docs', 'a project at the root holds every folder')
    assert.equal(csharpNamespace('docs', []), '')
    assert.equal(templateFor('api/src/Shop.Api/Services/OrderService.cs', files)?.content, 'namespace Shop.Api.Services;\n\npublic class OrderService\n{\n}\n')
    assert.equal(templateFor('api/src/Shop.Api/IClock.cs', files)?.label, 'C# interface IClock')
  })

  it('has simple starts for other files, and none for unknown ones', () => {
    assert.equal(templateFor('docs/getting-started.md')?.content, '# getting started\n')
    assert.equal(templateFor('config/app.json')?.content, '{}\n')
    assert.equal(templateFor('Makefile'), null)
    assert.equal(templateFor('notes.txt'), null)
  })
})

describe('where a new file lands', () => {
  const config = loadConfig(join(TOOL_ROOT, 'repomap.config.json'))

  it("follows this repository's config", () => {
    assert.equal(classifyPath(config, 'frontend/src/pages/NewPage/NewPage.tsx')?.layer, 'frontend-views')
    assert.equal(classifyPath(config, 'frontend/src/pages/NewPage/useNewThing.ts')?.layer, 'frontend')
    assert.equal(classifyPath(config, 'frontend/src/store/newSlice.ts')?.layer, 'frontend')
    assert.equal(classifyPath(config, 'frontend/src/pages/NewPage.test.tsx')?.role.startsWith('test'), true)
    assert.equal(classifyPath(config, 'README-new.md')?.layer, config.defaultLayer)
    assert.equal(classifyPath(config, 'tools/repomap/src/x.ts'), undefined, 'excluded: not in the map')
  })
})

describe('explorer tree', () => {
  it('nests folders and counts their files', () => {
    const tree = buildTree(['a/b/c.ts', 'a/d.ts', 'e.md'])
    assert.equal(tree.count, 3)
    assert.deepEqual(tree.files, ['e.md'])
    const a = tree.folders.get('a')!
    assert.equal(a.count, 2)
    assert.deepEqual(a.files, ['a/d.ts'])
    assert.equal(a.folders.get('b')!.path, 'a/b')
  })
})
