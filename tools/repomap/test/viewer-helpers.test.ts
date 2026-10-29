/**
 * Pure helpers of the viewer: the code panel's language detection.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { languageOf } from '../viewer/src/ui/code/languages.ts'

describe('code panel languages', () => {
  it('knows the stack and common files', () => {
    const cases: Record<string, string> = {
      'web/src/App.tsx': 'tsx',
      'web/src/api.ts': 'ts',
      'types/global.d.ts': 'ts',
      'scripts/build.mjs': 'js',
      'api/Program.cs': 'csharp',
      'api/Api.csproj': 'xml',
      'Portfolio.slnx': 'xml',
      'appsettings.Development.json': 'json',
      '.github/workflows/ci.yml': 'yaml',
      'README.md': 'markdown',
      'scripts/dev_launcher.py': 'python',
      'Dockerfile': 'dockerfile',
      'api/Dockerfile.dev': 'dockerfile',
      '.env': 'shell',
      '.gitignore': 'shell',
      'Makefile': 'shell',
      'requests.http': 'http',
      'schema.sql': 'sql',
      'styles.scss': 'css',
      'LICENSE': 'text',
      'data.unknown': 'text',
    }
    for (const [path, language] of Object.entries(cases)) assert.equal(languageOf(path), language, path)
  })
})
