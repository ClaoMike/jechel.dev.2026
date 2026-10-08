/**
 * What a new file starts with, by its name and place: small, valid code the extractors recognise, so
 * the file shows up in the map as what it is (a React component, a hook, a C# class…). Pure.
 */

export interface Template {
  /** e.g. "React component BookList". */
  label: string
  content: string
}

const words = (name: string) => name.split(/[^A-Za-z0-9]+/).filter(Boolean)
const pascal = (name: string) => words(name).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'NewFile'
const camel = (name: string) => {
  const p = pascal(name)
  return p[0].toLowerCase() + p.slice(1)
}
/** Identifiers can't start with a digit. */
const identifier = (name: string) => (/^[0-9]/.test(name) ? `_${name}` : name)

/** `files`: the repository's files (to find the .NET project a C# file belongs to). */
export function templateFor(path: string, files: readonly string[] = []): Template | null {
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash) : ''
  const base = path.slice(slash + 1)
  const dot = base.indexOf('.')
  if (dot <= 0) return null
  const stem = base.slice(0, dot)
  const extension = base.slice(base.lastIndexOf('.') + 1).toLowerCase()
  const isTest = /\.(test|spec)\.[^.]+$/i.test(base)

  switch (extension) {
    case 'tsx':
    case 'jsx': {
      if (isTest) {
        const subject = pascal(stem)
        return {
          label: `Test of ${subject}`,
          content: `import { describe, expect, it } from 'vitest'\n\ndescribe('${subject}', () => {\n  it('works', () => {\n    expect(true).toBe(true)\n  })\n})\n`,
        }
      }
      if (/^use[A-Z0-9]/.test(stem)) return hook(stem)
      const name = identifier(pascal(stem))
      return { label: `React component ${name}`, content: `export function ${name}() {\n  return <div>${name}</div>\n}\n` }
    }
    case 'ts':
    case 'js':
    case 'mts':
    case 'mjs': {
      if (base.endsWith('.d.ts')) return null
      if (isTest) {
        return {
          label: `Test of ${stem}`,
          content: `import { describe, expect, it } from 'vitest'\n\ndescribe('${stem}', () => {\n  it('works', () => {\n    expect(true).toBe(true)\n  })\n})\n`,
        }
      }
      if (/^use[A-Z0-9]/.test(stem)) return hook(stem)
      const name = identifier(camel(stem))
      const typed = extension === 'ts' || extension === 'mts'
      return { label: `Module with a function ${name}`, content: `export function ${name}()${typed ? ': void' : ''} {\n}\n` }
    }
    case 'cs': {
      const name = identifier(pascal(stem))
      const namespace = csharpNamespace(dir, files)
      const kind = /^I[A-Z]/.test(name) ? 'interface' : 'class'
      return {
        label: `C# ${kind} ${name}`,
        content: `${namespace ? `namespace ${namespace};\n\n` : ''}public ${kind} ${name}\n{\n}\n`,
      }
    }
    case 'md':
      return { label: 'Markdown with a title', content: `# ${words(stem).join(' ') || stem}\n` }
    case 'json':
      return { label: 'An empty JSON object', content: '{}\n' }
    case 'html':
      return {
        label: 'An HTML page',
        content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>${stem}</title>\n  </head>\n  <body></body>\n</html>\n`,
      }
    case 'sql':
      return { label: 'A SQL script', content: `-- ${stem}\n` }
    default:
      return null
  }
}

function hook(stem: string): Template {
  const name = identifier(camel(stem))
  return { label: `React hook ${name}`, content: `import { useState } from 'react'\n\nexport function ${name}() {\n  const [value, setValue] = useState<unknown>(null)\n  return { value, setValue }\n}\n` }
}

/**
 * The namespace .NET gives a folder: the nearest project's name (its .csproj) plus the folders below it,
 * e.g. api/src/Shop.Api/Services/Orders → Shop.Api.Services.Orders. Empty outside a project.
 */
export function csharpNamespace(dir: string, files: readonly string[]): string {
  const projects = files.filter((f) => f.endsWith('.csproj'))
  let best: { dir: string; name: string } | null = null
  for (const project of projects) {
    const slash = project.lastIndexOf('/')
    const projectDir = slash >= 0 ? project.slice(0, slash) : ''
    const inside = projectDir === '' || dir === projectDir || dir.startsWith(`${projectDir}/`)
    if (inside && (!best || projectDir.length > best.dir.length)) best = { dir: projectDir, name: project.slice(slash + 1, -'.csproj'.length) }
  }
  if (!best) return ''
  const below = dir === best.dir ? [] : dir.slice(best.dir ? best.dir.length + 1 : 0).split('/')
  return [best.name, ...below.map((part) => identifier(pascal(part)))].join('.')
}
