/**
 * React + TypeScript analysis.
 *
 * Production files → symbol-level nodes:
 *   components / pages / providers (functions returning JSX), hooks (use*), contexts (createContext),
 *   API clients (objects whose members call HTTP wrappers) and their API calls, exported functions,
 *   classes and types, React Router routes, and the entry module (createRoot); Redux Toolkit: slices and
 *   their actions, async thunks, listener middleware, and RTK Query APIs with their generated hooks
 *   (each hook scans its endpoint's definition, so a view model's useGetXQuery reaches the API call).
 * Test files → one node per file (suite or helper) with `tests` edges to what they exercise, plus
 *   facts for MSW handlers, Playwright page.goto/request/route calls.
 *
 * HTTP calls are found without knowing the client library: any function that calls fetch (or axios/ky)
 * with one of its parameters as the URL is a "wrapper"; wrappers of wrappers are followed; every call
 * of a wrapper with a static URL becomes an `http` fact for the linker.
 */
import { relative } from 'node:path'
import { Node, SyntaxKind, type Project, type SourceFile, type ts } from 'ts-morph'
import { normalizeUrl } from '../../src/shared/routes.ts'
import { fileNodeId } from '../../src/shared/types.ts'
import type { Diagnostic, Fact, FileEntry, PluginEdge, PluginNode } from '../../src/shared/types.ts'

export interface ExtractOptions {
  apiPrefixes: string[]
}

export interface ExtractResult {
  nodes: PluginNode[]
  edges: PluginEdge[]
  facts: Fact[]
  claims: string[]
  diagnostics: Diagnostic[]
}

interface Decl {
  id: string
  name: string
  label: string
  kind: string | undefined
  /** The declaration node that symbols resolve to. */
  decl: Node
  /** Function-like node, if any (component body, hook body, wrapper…). */
  fn?: Node
  /** Subtree scanned for references (defaults to decl). */
  scan?: Node
  /** Scanned instead of `scan`/`fn`/`decl` when set (possibly nothing), e.g. an RTK Query hook's endpoint. */
  scanNodes?: Node[]
  file: FileEntry
  sourceFile: SourceFile
  exported: boolean
  parent?: string
  tags: Set<string>
  attrs: Record<string, unknown>
  description?: string
}

type MethodSpec = { fixed: string } | { initParam: number; fallback: string }

interface Wrapper {
  urlParam: number
  method: MethodSpec
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
const GENERIC_FOLDERS = new Set([
  'src', 'app', 'pages', 'page', 'views', 'view', 'components', 'component', 'hooks', 'services', 'service', 'api',
  'lib', 'libs', 'utils', 'util', 'helpers', 'shared', 'common', 'types', 'models', 'assets', 'styles', 'test', 'tests',
  '__tests__', 'e2e', 'routes', 'features', 'modules', 'layouts', 'layout', 'ui', 'store', 'state', 'context',
  'contexts', 'providers', 'frontend', 'client', 'web',
])

export function extractProject(project: Project, files: FileEntry[], repoRoot: string, options: ExtractOptions): ExtractResult {
  return new Extractor(project, files, repoRoot, options).run()
}

class Extractor {
  private readonly project: Project
  private readonly repoRoot: string
  private readonly options: ExtractOptions
  private readonly entries = new Map<string, FileEntry>()
  private readonly sourceFiles = new Map<string, SourceFile>()

  private readonly decls: Decl[] = []
  private readonly declByNode = new Map<ts.Node, Decl>()
  private readonly wrappers = new Map<ts.Node, Wrapper>()
  private readonly entryNodes = new Map<string, PluginNode>()
  private readonly testNodes = new Map<string, PluginNode>()
  private readonly routeNodes = new Map<string, PluginNode>()
  private readonly consumedJsx = new Set<ts.Node>()
  private readonly consumedStrings = new Set<ts.Node>()

  private readonly edges = new Map<string, PluginEdge>()
  private readonly facts: Fact[] = []
  private readonly diagnostics: Diagnostic[] = []

  constructor(project: Project, files: FileEntry[], repoRoot: string, options: ExtractOptions) {
    this.project = project
    this.repoRoot = repoRoot
    this.options = options
    for (const file of files) this.entries.set(file.path, { ...file })
  }

  run(): ExtractResult {
    for (const sourceFile of this.project.getSourceFiles()) {
      const path = this.rel(sourceFile)
      if (this.entries.has(path)) this.sourceFiles.set(path, sourceFile)
    }
    this.refineRolesByReachability()
    this.collectDeclarations()
    this.detectWrappers()
    this.detectApiClients()
    this.detectRedux()
    this.classifyDeclarations()
    this.detectEntries()
    this.extractRoutes()
    this.scanProduction()
    this.scanTests()
    return this.output()
  }

  // ---------------------------------------------------------------- helpers

  private rel(sourceFile: SourceFile): string {
    return relative(this.repoRoot, sourceFile.getFilePath()).split('\\').join('/')
  }

  private isSupportRole(role: string): boolean {
    return role === 'test/support'
  }

  private isProductionFile(entry: FileEntry): boolean {
    return !entry.role.startsWith('test')
  }

  private evidence(node: Node): { file: string; line: number }[] {
    return [{ file: this.rel(node.getSourceFile()), line: node.getStartLineNumber() }]
  }

  private addEdge(from: string, to: string, type: string, at: Node, confidence = 1, attrs?: Record<string, unknown>): void {
    if (from === to) return
    const key = `${from}|${type}|${to}`
    const existing = this.edges.get(key)
    if (existing) {
      if ((existing.evidence?.length ?? 0) < 3) existing.evidence = [...(existing.evidence ?? []), ...this.evidence(at)]
      existing.confidence = Math.max(existing.confidence ?? 1, confidence)
      return
    }
    this.edges.set(key, { from, to, type, confidence, evidence: this.evidence(at), ...(attrs ? { attrs } : {}) })
  }

  private idFor(entry: FileEntry, name: string): string {
    return `${entry.layer}:symbol:${entry.path}#${name}`
  }

  /** Resolves an expression/identifier to the Decl it refers to (following imports and re-exports). */
  private resolve(node: Node | undefined): Decl | undefined {
    const declaration = this.resolveDeclaration(node)
    return declaration ? this.declByNode.get(declaration.compilerNode) : undefined
  }

  private resolveDeclaration(node: Node | undefined): Node | undefined {
    if (!node) return undefined
    const target = Node.isPropertyAccessExpression(node) ? node.getNameNode() : node
    let symbol = target.getSymbol()
    if (!symbol) return undefined
    if (symbol.isAlias()) {
      try {
        symbol = symbol.getAliasedSymbol() ?? symbol
      } catch {
        // unresolvable alias
      }
    }
    return symbol.getDeclarations()[0]
  }

  /** a.b.c whose member isn't one of ours (a library API): the Decl `a` refers to, if it is one. */
  private resolveRoot(node: Node): Decl | undefined {
    if (!Node.isPropertyAccessExpression(node)) return undefined
    let root: Node = node
    while (Node.isPropertyAccessExpression(root)) root = root.getExpression()
    return Node.isIdentifier(root) ? this.resolve(root) : undefined
  }

  private featureOf(path: string): string | undefined {
    const parts = path.split('/')
    const lower = parts.map((p) => p.toLowerCase())
    for (const marker of ['features', 'modules', 'domains']) {
      const index = lower.indexOf(marker)
      if (index >= 0 && parts[index + 1] && index + 1 < parts.length - 1) return lower[index + 1]
    }
    const srcIndex = lower.indexOf('src')
    const folder = srcIndex >= 0 ? lower[srcIndex + 1] : undefined
    if (folder && srcIndex + 1 < parts.length - 1 && !GENERIC_FOLDERS.has(folder)) return folder
    return undefined
  }

  // ---------------------------------------------------------------- roles

  /** A production module imported only by tests is test support (e.g. a test-only fixture outside test/). */
  private refineRolesByReachability(): void {
    const importers = new Map<string, Set<string>>()
    const link = (from: string, target: SourceFile | undefined) => {
      if (!target) return
      const targetPath = this.rel(target)
      if (!importers.has(targetPath)) importers.set(targetPath, new Set())
      importers.get(targetPath)!.add(from)
    }
    for (const [path, sourceFile] of this.sourceFiles) {
      // import … from, export … from (barrels), and import('…') (lazy routes)
      for (const imp of sourceFile.getImportDeclarations()) link(path, imp.getModuleSpecifierSourceFile())
      for (const exp of sourceFile.getExportDeclarations()) link(path, exp.getModuleSpecifierSourceFile())
      sourceFile.forEachDescendant((node) => {
        if (Node.isCallExpression(node) && node.getExpression().getKind() === SyntaxKind.ImportKeyword) {
          const specifier = node.getArguments()[0]
          if (specifier && Node.isStringLiteral(specifier)) {
            const resolved = this.resolveDeclaration(specifier)
            link(path, resolved && Node.isSourceFile(resolved) ? resolved : undefined)
          }
        }
      })
    }
    for (const [path, entry] of this.entries) {
      if (!this.isProductionFile(entry)) continue
      const from = [...(importers.get(path) ?? [])]
      if (from.length > 0 && from.every((p) => !this.isProductionFile(this.entries.get(p)!))) {
        entry.role = 'test/support'
        entry.roleReason = 'only imported by tests'
      }
    }
  }

  // ---------------------------------------------------------------- declarations

  private collectDeclarations(): void {
    for (const [path, sourceFile] of this.sourceFiles) {
      const entry = this.entries.get(path)!
      if (!this.isProductionFile(entry)) continue
      const defaultExported = new Set<string>()
      for (const assignment of sourceFile.getExportAssignments()) {
        const expression = assignment.getExpression()
        if (Node.isIdentifier(expression)) defaultExported.add(expression.getText())
      }
      // `export { Foo }` (local re-export without a module specifier)
      const exportedNames = new Set(
        sourceFile
          .getExportDeclarations()
          .filter((d) => !d.getModuleSpecifier())
          .flatMap((d) => d.getNamedExports().map((e) => e.getName())),
      )
      const isExported = (name: string, flag: boolean) => flag || defaultExported.has(name) || exportedNames.has(name)

      for (const statement of sourceFile.getStatements()) {
        if (Node.isFunctionDeclaration(statement)) {
          const name = statement.getName() ?? (statement.isDefaultExport() ? defaultName(path) : undefined)
          if (!name) continue
          this.addDecl({ name, decl: statement, fn: statement, entry, sourceFile, exported: isExported(name, statement.isExported()) })
        } else if (Node.isVariableStatement(statement)) {
          for (const declaration of statement.getDeclarations()) {
            const nameNode = declaration.getNameNode()
            // export const { useGetXQuery, useSaveXMutation } = xApi / { opened, closed } = slice.actions
            if (Node.isObjectBindingPattern(nameNode)) {
              for (const element of nameNode.getElements()) {
                const elementName = element.getNameNode()
                if (!Node.isIdentifier(elementName)) continue
                const name = elementName.getText()
                this.addDecl({ name, decl: element, entry, sourceFile, exported: isExported(name, statement.isExported()), docNode: statement })
              }
              continue
            }
            if (!Node.isIdentifier(nameNode)) continue
            const name = nameNode.getText()
            const initializer = declaration.getInitializer()
            this.addDecl({
              name,
              decl: declaration,
              fn: functionOf(initializer),
              entry,
              sourceFile,
              exported: isExported(name, statement.isExported()),
              docNode: statement,
            })
          }
        } else if (Node.isClassDeclaration(statement)) {
          const name = statement.getName() ?? (statement.isDefaultExport() ? defaultName(path) : undefined)
          if (!name) continue
          this.addDecl({ name, decl: statement, entry, sourceFile, exported: isExported(name, statement.isExported()) })
        } else if (Node.isInterfaceDeclaration(statement) || Node.isTypeAliasDeclaration(statement)) {
          const name = statement.getName()
          this.addDecl({ name, decl: statement, entry, sourceFile, exported: isExported(name, statement.isExported()) })
        }
      }
    }
  }

  private addDecl(input: {
    name: string
    decl: Node
    fn?: Node
    entry: FileEntry
    sourceFile: SourceFile
    exported: boolean
    docNode?: Node
  }): Decl {
    const decl: Decl = {
      id: this.idFor(input.entry, input.name),
      name: input.name,
      label: input.name,
      kind: undefined,
      decl: input.decl,
      fn: input.fn,
      file: input.entry,
      sourceFile: input.sourceFile,
      exported: input.exported,
      tags: new Set(),
      attrs: {},
      description: docComment(input.docNode ?? input.decl),
    }
    const feature = this.featureOf(input.entry.path)
    if (feature) decl.tags.add(`feature:${feature}`)
    this.decls.push(decl)
    this.declByNode.set(input.decl.compilerNode, decl)
    return decl
  }

  // ---------------------------------------------------------------- HTTP wrappers

  private detectWrappers(): void {
    const candidates = this.decls.filter((d) => d.fn)
    // 1. Functions that call fetch/axios/ky with a parameter as URL.
    for (const decl of candidates) {
      const fn = decl.fn!
      const params = parameterNames(fn)
      fn.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return
        const client = this.httpClientCall(node)
        if (!client) return
        const urlArg = node.getArguments()[client.urlIndex]
        const urlParam = paramReferenced(urlArg, params)
        if (urlParam < 0) return
        let method: MethodSpec = client.method ? { fixed: client.method } : { fixed: 'GET' }
        if (!client.method) {
          const init = node.getArguments()[client.urlIndex + 1]
          method = methodFromInit(init, params, 'GET')
        }
        this.wrappers.set(decl.decl.compilerNode, { urlParam, method })
      })
    }
    // 2. Wrappers of wrappers (get(path) → request(path, {…}) → fetch), until nothing changes.
    for (let round = 0; round < 5; round++) {
      let changed = false
      for (const decl of candidates) {
        if (this.wrappers.has(decl.decl.compilerNode)) continue
        const fn = decl.fn!
        const params = parameterNames(fn)
        fn.forEachDescendant((node) => {
          if (!Node.isCallExpression(node) || this.wrappers.has(decl.decl.compilerNode)) return
          const target = this.resolveDeclaration(node.getExpression())
          const inner = target ? this.wrappers.get(target.compilerNode) : undefined
          if (!inner) return
          const urlParam = paramReferenced(node.getArguments()[inner.urlParam], params)
          if (urlParam < 0) return
          let method: MethodSpec
          if ('fixed' in inner.method) method = inner.method
          else method = methodFromInit(node.getArguments()[inner.method.initParam], params, inner.method.fallback)
          this.wrappers.set(decl.decl.compilerNode, { urlParam, method })
          changed = true
        })
      }
      if (!changed) break
    }
    for (const decl of candidates) {
      if (this.wrappers.has(decl.decl.compilerNode)) {
        decl.kind = 'function'
        decl.tags.add('http')
        decl.attrs.httpWrapper = true
      }
    }
  }

  /** fetch(url, init) / axios.get(url) / ky.post(url) → where the URL is and the method if fixed. */
  private httpClientCall(call: Node): { urlIndex: number; method?: string } | undefined {
    if (!Node.isCallExpression(call)) return undefined
    const callee = call.getExpression()
    if (Node.isIdentifier(callee) && callee.getText() === 'fetch' && !this.resolveDeclaration(callee)) return { urlIndex: 0 }
    if (Node.isPropertyAccessExpression(callee)) {
      const receiver = callee.getExpression().getText()
      const name = callee.getName()
      if ((receiver === 'window' || receiver === 'globalThis') && name === 'fetch') return { urlIndex: 0 }
      if ((receiver === 'axios' || receiver === 'ky' || this.isHttpInstance(callee.getExpression())) && HTTP_METHODS.has(name)) {
        return { urlIndex: 0, method: name.toUpperCase() }
      }
    }
    return undefined
  }

  /** const http = axios.create(…) / ky.create(…) / ky.extend(…) */
  private isHttpInstance(expression: Node): boolean {
    const declaration = this.resolveDeclaration(expression)
    if (!declaration || !Node.isVariableDeclaration(declaration)) return false
    const init = declaration.getInitializer()
    return !!init && Node.isCallExpression(init) && /^(axios|ky)\.(create|extend)$/.test(init.getExpression().getText())
  }

  // ---------------------------------------------------------------- API clients

  private detectApiClients(): void {
    for (const decl of [...this.decls]) {
      if (!Node.isVariableDeclaration(decl.decl)) continue
      const init = decl.decl.getInitializer()
      if (!init || !Node.isObjectLiteralExpression(init)) continue
      const members: { path: string[]; node: Node; fn: Node }[] = []
      collectMembers(init, [], members)
      if (members.length === 0) continue
      const isClient = members.some((m) => this.callsHttp(m.fn) || this.mentionsApiUrl(m.fn))
      if (!isClient) continue
      decl.kind = 'api-client'
      decl.scan = undefined
      for (const member of members) {
        const qualified = [decl.name, ...member.path].join('.')
        const call = this.addDecl({ name: qualified, decl: member.node, fn: member.fn, entry: decl.file, sourceFile: decl.sourceFile, exported: decl.exported })
        call.kind = 'api-call'
        call.parent = decl.id
        call.tags.delete([...call.tags].find((t) => t.startsWith('feature:')) ?? '')
        if (member.path.length > 1) call.tags.add(`feature:${member.path[0].toLowerCase()}`)
      }
      // HTTP plumbing in the same file hangs under the client.
      for (const other of this.decls) {
        if (other.sourceFile === decl.sourceFile && other.attrs.httpWrapper) other.parent = decl.id
      }
    }
    // Standalone functions that call a wrapper with a static URL are API calls too.
    for (const decl of this.decls) {
      if (decl.kind || !decl.fn || this.wrappers.has(decl.decl.compilerNode)) continue
      if (/^use[A-Z0-9]/.test(decl.name) || (/^[A-Z]/.test(decl.name) && containsJsx(decl.fn))) continue
      if (this.callsHttp(decl.fn)) decl.kind = 'api-call'
    }
  }

  private callsHttp(fn: Node): boolean {
    let found = false
    fn.forEachDescendant((node, traversal) => {
      if (found) return traversal.stop()
      if (!Node.isCallExpression(node)) return
      if (this.httpClientCall(node)) found = true
      else {
        const target = this.resolveDeclaration(node.getExpression())
        if (target && this.wrappers.has(target.compilerNode)) found = true
      }
    })
    return found
  }

  private mentionsApiUrl(fn: Node): boolean {
    let found = false
    fn.forEachDescendant((node, traversal) => {
      if (found) return traversal.stop()
      const text = staticUrl(node)
      if (text !== undefined && this.isApiUrl(text)) found = true
    })
    return found
  }

  private isApiUrl(text: string): boolean {
    const path = /^(\$\{[^}]*\})*\//.test(text) ? normalizeUrl(text) : null
    return !!path && this.options.apiPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  }

  // ---------------------------------------------------------------- Redux Toolkit

  private detectRedux(): void {
    const extended: [Decl, Node][] = []
    for (const decl of this.decls) {
      if (decl.kind || !Node.isVariableDeclaration(decl.decl)) continue
      const init = unwrap(decl.decl.getInitializer())
      if (!init || !Node.isCallExpression(init)) continue
      const callee = init.getExpression()
      const name = Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText()
      const args = init.getArguments()
      if (name === 'createSlice') {
        decl.kind = 'slice'
        decl.scan = init
      } else if (name === 'createAsyncThunk' && args[1]) {
        decl.kind = 'thunk'
        decl.fn = functionOf(args[1]) ?? args[1]
      } else if (name === 'createApi' || ((name === 'injectEndpoints' || name === 'enhanceEndpoints') && Node.isPropertyAccessExpression(callee))) {
        decl.kind = 'store-api'
        // The endpoints belong to the hooks; what it extends (baseApi.injectEndpoints) is linked below.
        decl.scanNodes = []
        if (Node.isPropertyAccessExpression(callee)) extended.push([decl, callee.getExpression()])
      } else if (name === 'createListenerMiddleware') {
        decl.kind = 'middleware'
        // listeners.startListening({ … }) anywhere in the file, also through an alias
        // (const startListening = listeners.startListening.withTypes<…>()).
        const callers = [`${decl.name}.`]
        for (const other of decl.sourceFile.getVariableDeclarations()) {
          if (other.getInitializer()?.getText().startsWith(`${decl.name}.`)) callers.push(`${other.getName()}(`)
        }
        decl.scanNodes = decl.sourceFile.getStatements().filter((s) => Node.isExpressionStatement(s) && callers.some((c) => s.getText().startsWith(c)))
      }
    }
    for (const [decl, receiver] of extended) {
      const base = this.resolve(receiver)
      if (base?.kind) this.addEdge(decl.id, base.id, 'uses', receiver)
    }
    for (const decl of this.decls) {
      if (decl.kind || !Node.isBindingElement(decl.decl)) continue
      const source = unwrap(decl.decl.getParent()?.getParent()?.asKind(SyntaxKind.VariableDeclaration)?.getInitializer())
      if (!source) continue
      const hook = /^use(?:Lazy)?(\w+?)(?:Infinite)?(?:Query|Mutation|QueryState|QuerySubscription)$/.exec(decl.name)
      const api = Node.isIdentifier(source) ? this.resolve(source) : undefined
      if (hook && api?.kind === 'store-api') {
        decl.kind = 'hook'
        decl.parent = api.id
        decl.attrs.endpoint = lowerFirst(hook[1])
        const endpoint = endpointDefinition(api.decl, lowerFirst(hook[1]))
        decl.scanNodes = endpoint ? [endpoint] : []
        continue
      }
      // { opened, closed } = slice.actions
      if (Node.isPropertyAccessExpression(source) && source.getName() === 'actions') {
        const slice = this.resolve(source.getExpression())
        if (slice?.kind !== 'slice') continue
        decl.kind = 'action'
        decl.parent = slice.id
        const reducer = sliceReducer(slice.decl, decl.name)
        decl.scanNodes = reducer ? [reducer] : []
      }
    }
  }

  // ---------------------------------------------------------------- classification

  private classifyDeclarations(): void {
    for (const decl of this.decls) {
      if (decl.kind) continue
      const node = decl.decl
      if (Node.isInterfaceDeclaration(node)) decl.kind = decl.exported ? 'interface' : undefined
      else if (Node.isTypeAliasDeclaration(node)) decl.kind = decl.exported ? 'type' : undefined
      else if (Node.isClassDeclaration(node)) {
        const base = node.getExtends()?.getExpression().getText() ?? ''
        if (/(^|\.)(Pure)?Component$/.test(base)) decl.kind = 'component'
        else if (decl.exported) decl.kind = 'class'
      } else if (decl.fn) {
        if (/^use[A-Z0-9]/.test(decl.name)) decl.kind = 'hook'
        else if (/^[A-Z]/.test(decl.name) && containsJsx(decl.fn)) decl.kind = 'component'
        else if (decl.exported) decl.kind = 'function'
      } else if (Node.isVariableDeclaration(node)) {
        const init = node.getInitializer()
        if (init && Node.isCallExpression(init) && /(^|\.)createContext$/.test(init.getExpression().getText())) decl.kind = 'context'
      }
    }
    // Providers: components that render <Ctx.Provider> or <Ctx value>.
    for (const decl of this.decls) {
      if (decl.kind !== 'component' || !decl.fn) continue
      decl.fn.forEachDescendant((node, traversal) => {
        const tag = jsxTag(node)
        if (!tag) return
        const target = Node.isPropertyAccessExpression(tag) && tag.getName() === 'Provider' ? this.resolve(tag.getExpression()) : this.resolve(tag)
        if (target?.kind === 'context') {
          decl.kind = 'provider'
          traversal.stop()
        }
      })
    }
  }

  // ---------------------------------------------------------------- entry points

  private detectEntries(): void {
    for (const [path, sourceFile] of this.sourceFiles) {
      const entry = this.entries.get(path)!
      if (!this.isProductionFile(entry)) continue
      let isEntry = false
      sourceFile.forEachDescendant((node, traversal) => {
        if (Node.isCallExpression(node) && /(^|\.)(createRoot|hydrateRoot|render)$/.test(node.getExpression().getText())) {
          const text = node.getExpression().getText()
          if (text.includes('createRoot') || text.includes('hydrateRoot') || text === 'ReactDOM.render') {
            isEntry = true
            traversal.stop()
          }
        }
      })
      if (!isEntry) continue
      this.entryNodes.set(path, {
        id: `${entry.layer}:module:${path}`,
        label: path.split('/').pop()!,
        kind: 'entrypoint',
        file: path,
        line: 1,
        description: 'App entry point: mounts the React tree',
      })
    }
  }

  // ---------------------------------------------------------------- routes (React Router)

  private extractRoutes(): void {
    for (const decl of this.decls) {
      const root = decl.fn ?? (Node.isVariableDeclaration(decl.decl) ? decl.decl.getInitializer() : undefined)
      if (!root) continue
      root.forEachDescendant((node) => {
        // <Route path element/Component> trees; only the outermost Route starts a walk.
        const tag = jsxTag(node)
        if (tag && tag.getText() === 'Route' && !hasRouteAncestor(node)) this.walkJsxRoute(node, '', decl)
        // Object routes: createBrowserRouter([...]), useRoutes([...])
        if (Node.isCallExpression(node) && /(^|\.)(create(Browser|Hash|Memory)Router|useRoutes)$/.test(node.getExpression().getText())) {
          const first = node.getArguments()[0]
          if (first && Node.isArrayLiteralExpression(first)) this.walkObjectRoutes(first, '', decl)
        }
      })
    }
  }

  private walkJsxRoute(node: Node, parentPath: string, owner: Decl): void {
    const opening = Node.isJsxElement(node) ? node.getOpeningElement() : node
    if (!Node.isJsxOpeningElement(opening) && !Node.isJsxSelfClosingElement(opening)) return
    const attrs = new Map<string, Node | undefined>()
    for (const attribute of opening.getAttributes()) {
      if (Node.isJsxAttribute(attribute)) attrs.set(attribute.getNameNode().getText(), attribute.getInitializer())
    }
    const pathAttr = attrs.get('path')
    const ownPath = pathAttr ? (staticUrl(Node.isJsxExpression(pathAttr) ? pathAttr.getExpression() : pathAttr) ?? '') : ''
    const fullPath = joinPaths(parentPath, attrs.has('index') ? '' : ownPath)
    let component: Decl | undefined
    const element = attrs.get('element')
    const expression = element && Node.isJsxExpression(element) ? element.getExpression() : undefined
    if (expression) {
      const tag = jsxTag(expression)
      if (tag) {
        component = this.resolve(tag)
        this.consumedJsx.add(expression.compilerNode)
      }
    }
    const componentAttr = attrs.get('Component')
    if (!component && componentAttr && Node.isJsxExpression(componentAttr)) component = this.resolve(componentAttr.getExpression())
    if (pathAttr || attrs.has('index')) this.addRoute(fullPath, component, owner, opening)
    if (Node.isJsxElement(node)) {
      for (const child of node.getJsxChildren()) {
        if (jsxTag(child)?.getText() === 'Route') this.walkJsxRoute(child, fullPath, owner)
      }
    }
  }

  private walkObjectRoutes(array: Node, parentPath: string, owner: Decl): void {
    if (!Node.isArrayLiteralExpression(array)) return
    for (const element of array.getElements()) {
      if (!Node.isObjectLiteralExpression(element)) continue
      const prop = (name: string) => {
        const p = element.getProperty(name)
        return p && Node.isPropertyAssignment(p) ? p.getInitializer() : p && Node.isShorthandPropertyAssignment(p) ? p.getNameNode() : undefined
      }
      const pathNode = prop('path')
      const isIndex = prop('index')?.getText() === 'true'
      const fullPath = joinPaths(parentPath, isIndex ? '' : pathNode ? (staticUrl(pathNode) ?? '') : '')
      let component: Decl | undefined
      const elementNode = prop('element')
      const tag = elementNode ? jsxTag(elementNode) : undefined
      if (tag) {
        component = this.resolve(tag)
        this.consumedJsx.add(elementNode!.compilerNode)
      }
      component ??= this.resolve(prop('Component'))
      if (pathNode || isIndex) this.addRoute(fullPath, component, owner, element)
      const children = prop('children')
      if (children) this.walkObjectRoutes(children, fullPath, owner)
    }
  }

  private addRoute(path: string, component: Decl | undefined, owner: Decl, at: Node): void {
    const id = `${owner.file.layer}:route:${path}`
    if (!this.routeNodes.has(id)) {
      this.routeNodes.set(id, {
        id,
        label: path,
        kind: 'route',
        parent: owner.id,
        file: owner.file.path,
        line: at.getStartLineNumber(),
        endLine: at.getEndLineNumber(),
        attrs: { path, component: component?.name },
      })
    }
    this.addEdge(owner.id, id, 'renders', at)
    if (component) {
      this.addEdge(id, component.id, 'renders', at)
      if (component.kind === 'component') component.kind = 'page'
      for (const tag of component.tags) if (tag.startsWith('feature:')) this.routeNodes.get(id)!.tags = [tag]
    }
  }

  // ---------------------------------------------------------------- production references

  private scanProduction(): void {
    for (const decl of this.decls) {
      if (!decl.kind) continue
      if (decl.scanNodes) {
        for (const node of decl.scanNodes) this.scanReferences(node, decl.id, 'production')
        continue
      }
      const root = decl.scan ?? decl.fn ?? (decl.kind === 'api-client' ? undefined : decl.decl)
      if (!root) continue
      this.scanReferences(root, decl.id, 'production')
    }
    for (const [path, node] of this.entryNodes) {
      const sourceFile = this.sourceFiles.get(path)!
      // Module-level code of the entry file (the createRoot(...).render(<App/>) call).
      for (const statement of sourceFile.getStatements()) {
        if (this.declByNode.has(statement.compilerNode)) continue
        if (Node.isImportDeclaration(statement)) {
          this.sideEffectImport(statement, node.id)
          continue
        }
        this.scanReferences(statement, node.id, 'production')
      }
    }
    // Side-effect imports (import './Button.css') in other production files → the file's main node.
    for (const [path, sourceFile] of this.sourceFiles) {
      if (this.entryNodes.has(path) || !this.isProductionFile(this.entries.get(path)!)) continue
      const main = this.mainDeclOf(sourceFile)
      if (!main) continue
      for (const imp of sourceFile.getImportDeclarations()) this.sideEffectImport(imp, main.id)
    }
  }

  private sideEffectImport(imp: Node, from: string): void {
    if (!Node.isImportDeclaration(imp) || imp.getImportClause()) return
    const specifier = imp.getModuleSpecifierValue()
    if (!specifier.startsWith('.')) return
    const dir = this.rel(imp.getSourceFile()).split('/').slice(0, -1)
    const parts = [...dir]
    for (const part of specifier.split('/')) {
      if (part === '..') parts.pop()
      else if (part !== '.') parts.push(part)
    }
    this.facts.push({ type: 'file-ref', from, edgeType: 'uses', path: parts.join('/'), evidence: this.evidence(imp) })
  }

  private mainDeclOf(sourceFile: SourceFile): Decl | undefined {
    const base = sourceFile.getBaseNameWithoutExtension()
    const inFile = this.decls.filter((d) => d.sourceFile === sourceFile && d.kind && !d.parent)
    return inFile.find((d) => d.name === base) ?? inFile.find((d) => d.exported) ?? inFile[0]
  }

  /**
   * Walks a subtree and records what the owner node renders, calls, uses; HTTP call sites and
   * navigation targets become facts. Nested declarations that are nodes themselves are skipped.
   */
  private scanReferences(root: Node, ownerId: string, mode: 'production' | 'test' | 'support'): void {
    const httpEdge = mode === 'production' ? 'http' : mode === 'test' ? 'tests' : 'uses'
    const navEdge = mode === 'production' ? 'navigates' : mode === 'test' ? 'tests' : 'uses'
    const refEdge = (_kind: string | undefined, fallback: string) => (mode === 'test' ? 'tests' : mode === 'support' ? 'uses' : fallback)

    const visit = (node: Node, traversal: { skip(): void }) => {
      if (node !== root && this.declByNode.has(node.compilerNode) && this.declByNode.get(node.compilerNode)!.kind) {
        traversal.skip()
        return
      }
      // JSX: renders / provides / navigation links
      if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
        const container = Node.isJsxOpeningElement(node) ? node.getParent() : node
        if (container && this.consumedJsx.has(container.compilerNode)) return
        const tag = node.getTagNameNode()
        const tagText = tag.getText()
        if (['Link', 'NavLink', 'Navigate'].includes(tagText) || tagText === 'a') {
          const to = attributeValue(node, tagText === 'a' ? 'href' : 'to')
          const url = to ? staticUrl(to) : undefined
          if (url !== undefined && url.startsWith('/')) {
            this.consumedStrings.add(to!.compilerNode)
            if (this.isApiUrl(url)) this.facts.push({ type: 'http', from: ownerId, edgeType: httpEdge, method: 'GET', url, evidence: this.evidence(node), attrs: { navigation: true } })
            else this.facts.push({ type: 'navigate', from: ownerId, edgeType: navEdge, url, evidence: this.evidence(node) })
          }
        }
        const target = Node.isPropertyAccessExpression(tag) && tag.getName() === 'Provider' ? this.resolve(tag.getExpression()) : this.resolve(tag)
        if (target?.kind) {
          const type = target.kind === 'context' ? 'provides' : 'renders'
          this.addEdge(ownerId, target.id, refEdge(target.kind, type), node)
        } else {
          this.referenceToSupport(tag, ownerId, node)
        }
        return
      }
      if (Node.isCallExpression(node)) {
        this.visitCall(node, ownerId, mode, httpEdge, navEdge, refEdge)
        return
      }
      if (Node.isNewExpression(node)) {
        const target = this.resolve(node.getExpression())
        if (target?.kind) this.addEdge(ownerId, target.id, refEdge(target.kind, 'uses'), node)
        return
      }
      if (Node.isTypeReference(node)) {
        const target = this.resolve(node.getTypeName())
        if (target?.kind && (target.kind === 'type' || target.kind === 'interface' || target.kind === 'class')) {
          this.addEdge(ownerId, target.id, mode === 'production' ? 'uses-type' : refEdge(target.kind, 'uses-type'), node)
        }
        return
      }
      if (Node.isPropertyAccessExpression(node) || Node.isIdentifier(node)) {
        const parent = node.getParent()
        // Only the outermost access of a chain, and not callees/JSX tags/declaration names (handled elsewhere).
        if (parent && Node.isPropertyAccessExpression(parent) && (parent.getExpression() === node || parent.getNameNode() === node)) return
        if (parent && Node.isCallExpression(parent) && parent.getExpression() === node) return
        if (parent && (Node.isJsxOpeningElement(parent) || Node.isJsxSelfClosingElement(parent) || Node.isJsxClosingElement(parent))) return
        if (Node.isIdentifier(node) && parent && isDeclarationName(node, parent)) return
        if (Node.isIdentifier(node) && parent && (Node.isImportSpecifier(parent) || Node.isImportClause(parent) || Node.isExportSpecifier(parent))) return
        const target = this.resolve(node) ?? this.resolveRoot(node)
        if (target?.kind && target.id !== ownerId) {
          this.addEdge(ownerId, target.id, refEdge(target.kind, target.kind === 'type' || target.kind === 'interface' ? 'uses-type' : 'uses'), node)
        } else if (!target) {
          this.referenceToSupport(node, ownerId, node)
        }
        return
      }
      if ((Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node) || Node.isTemplateExpression(node)) && !this.consumedStrings.has(node.compilerNode)) {
        const url = staticUrl(node)
        if (url !== undefined && this.isApiUrl(url)) {
          this.consumedStrings.add(node.compilerNode)
          this.facts.push({ type: 'http', from: ownerId, edgeType: httpEdge, method: 'GET', url, evidence: this.evidence(node), attrs: { navigation: true }, confidence: 0.9 })
        }
      }
    }
    // The root itself is visited too (e.g. a module-level statement).
    const rootTraversal = { skip() {} }
    visit(root, rootTraversal)
    root.forEachDescendant((node, traversal) => visit(node, traversal))
  }

  private visitCall(
    call: Node,
    ownerId: string,
    mode: 'production' | 'test' | 'support',
    httpEdge: string,
    navEdge: string,
    refEdge: (kind: string | undefined, fallback: string) => string,
  ): void {
    if (!Node.isCallExpression(call)) return
    const callee = call.getExpression()
    const args = call.getArguments()
    const calleeText = callee.getText()

    // Test doubles and browser automation.
    if (mode !== 'production' && Node.isPropertyAccessExpression(callee)) {
      const receiver = callee.getExpression().getText()
      const name = callee.getName()
      const urlArg = args[0]
      const url = urlArg ? staticUrl(urlArg) : undefined
      if (url !== undefined) {
        if ((receiver === 'http' || receiver === 'rest') && (HTTP_METHODS.has(name) || name === 'all') && this.importsFrom(call, 'msw')) {
          this.consumedStrings.add(urlArg.compilerNode)
          this.facts.push({ type: 'http', from: ownerId, edgeType: 'mocks', method: name === 'all' ? 'ANY' : name.toUpperCase(), url, evidence: this.evidence(call) })
          return
        }
        if (name === 'goto') {
          this.consumedStrings.add(urlArg.compilerNode)
          this.facts.push({ type: 'navigate', from: ownerId, edgeType: navEdge, url, evidence: this.evidence(call) })
          return
        }
        if (name === 'route' && (receiver.endsWith('page') || receiver === 'context')) {
          this.consumedStrings.add(urlArg.compilerNode)
          this.facts.push({ type: 'http', from: ownerId, edgeType: 'mocks', method: 'ANY', url, evidence: this.evidence(call) })
          return
        }
        if ((receiver === 'request' || receiver.endsWith('.request')) && (HTTP_METHODS.has(name) || name === 'fetch')) {
          this.consumedStrings.add(urlArg.compilerNode)
          this.facts.push({ type: 'http', from: ownerId, edgeType: httpEdge, method: name === 'fetch' ? 'ANY' : name.toUpperCase(), url, evidence: this.evidence(call) })
          return
        }
        if (name === 'toHaveURL') {
          this.consumedStrings.add(urlArg.compilerNode)
          this.facts.push({ type: 'navigate', from: ownerId, edgeType: navEdge, url, confidence: 0.8, evidence: this.evidence(call) })
          return
        }
      }
    }

    // Direct fetch/axios with a static URL.
    const client = this.httpClientCall(call)
    if (client) {
      const urlArg = args[client.urlIndex]
      const url = urlArg ? staticUrl(urlArg) : undefined
      const isPath = url !== undefined && (url.startsWith('/') || /^\$\{[^}]*\}\//.test(url))
      if (urlArg && url !== undefined && isPath) {
        this.consumedStrings.add(urlArg.compilerNode)
        const method = client.method ?? methodLiteral(args[client.urlIndex + 1]) ?? 'GET'
        this.facts.push({ type: 'http', from: ownerId, edgeType: httpEdge, method, url, evidence: this.evidence(call) })
      }
      return
    }

    const target = this.resolve(callee)
    if (target && this.wrappers.has(target.decl.compilerNode)) {
      const wrapper = this.wrappers.get(target.decl.compilerNode)!
      const urlArg = args[wrapper.urlParam]
      const url = urlArg ? staticUrl(urlArg) : undefined
      if (url !== undefined) {
        this.consumedStrings.add(urlArg!.compilerNode)
        const method = 'fixed' in wrapper.method ? wrapper.method.fixed : (methodLiteral(args[wrapper.method.initParam]) ?? wrapper.method.fallback)
        const responseType = this.responseTypeOf(call)
        this.facts.push({
          type: 'http',
          from: ownerId,
          edgeType: httpEdge,
          method,
          url,
          evidence: this.evidence(call),
          attrs: responseType ? { responseType } : undefined,
        })
        const owner = this.decls.find((d) => d.id === ownerId)
        if (owner && owner.kind === 'api-call') {
          owner.attrs.method = method
          owner.attrs.url = url
        }
      }
      return
    }
    if (target?.kind) {
      const type = target.kind === 'hook' || target.kind === 'context' ? 'uses' : 'calls'
      this.addEdge(ownerId, target.id, refEdge(target.kind, type), call)
    } else if (!target) {
      // slice.actions.opened(), baseApi.util.resetApiState(): a library member of one of ours.
      const root = this.resolveRoot(callee)
      if (root?.kind) this.addEdge(ownerId, root.id, refEdge(root.kind, 'uses'), call)
      else this.referenceToSupport(callee, ownerId, call)
    }
    // useContext(Ctx) / use(Ctx)
    if (/(^|\.)(useContext|use)$/.test(calleeText) && args[0]) {
      const context = this.resolve(args[0])
      if (context?.kind === 'context') this.addEdge(ownerId, context.id, refEdge(context.kind, 'uses'), call)
    }
    // navigate('/path') from useNavigate()
    if (/(^|\.)navigate$/.test(calleeText) && args[0]) {
      const url = staticUrl(args[0])
      if (url !== undefined && url.startsWith('/')) {
        this.consumedStrings.add(args[0].compilerNode)
        this.facts.push({ type: 'navigate', from: ownerId, edgeType: navEdge, url, evidence: this.evidence(call) })
      }
    }
  }

  /** get<CurrentUser>(…) → id of the CurrentUser type node (created if the type is not exported). */
  private responseTypeOf(call: Node): string | undefined {
    if (!Node.isCallExpression(call)) return undefined
    const typeArg = call.getTypeArguments()[0]
    if (!typeArg || !Node.isTypeReference(typeArg)) return undefined
    const declaration = this.resolveDeclaration(typeArg.getTypeName())
    if (!declaration) return undefined
    const decl = this.declByNode.get(declaration.compilerNode)
    if (!decl) return undefined
    if (!decl.kind) decl.kind = Node.isInterfaceDeclaration(declaration) ? 'interface' : 'type'
    return decl.id
  }

  private importsFrom(node: Node, moduleName: string): boolean {
    return node.getSourceFile().getImportDeclarations().some((imp) => imp.getModuleSpecifierValue() === moduleName)
  }

  /** A reference from a test file to a symbol declared in a test-support file → edge to that file's node. */
  private referenceToSupport(node: Node, ownerId: string, at: Node): void {
    const declaration = this.resolveDeclaration(node)
    if (!declaration) return
    const path = this.rel(declaration.getSourceFile())
    const entry = this.entries.get(path)
    if (!entry || !this.isSupportRole(entry.role)) return
    const target = this.testNodes.get(path)?.id ?? fileNodeId(entry.layer, path)
    this.addEdge(ownerId, target, 'uses', at)
  }

  // ---------------------------------------------------------------- tests

  private scanTests(): void {
    // Nodes first, so references between test files resolve.
    for (const [path, sourceFile] of this.sourceFiles) {
      const entry = this.entries.get(path)!
      if (this.isProductionFile(entry)) continue
      const isSupport = this.isSupportRole(entry.role)
      const tests = testTitles(sourceFile)
      this.testNodes.set(path, {
        id: fileNodeId(entry.layer, path),
        label: path.split('/').pop()!,
        kind: isSupport ? 'test-helper' : 'test-suite',
        file: path,
        line: 1,
        role: entry.role,
        roleReason: entry.roleReason,
        attrs: tests.length > 0 ? { tests, testCount: tests.length } : {},
        description: docComment(sourceFile.getStatements()[0]) ?? undefined,
      })
    }
    for (const [path, sourceFile] of this.sourceFiles) {
      const entry = this.entries.get(path)!
      if (this.isProductionFile(entry)) continue
      const node = this.testNodes.get(path)!
      const mode = this.isSupportRole(entry.role) ? 'support' : 'test'
      for (const statement of sourceFile.getStatements()) {
        if (Node.isImportDeclaration(statement)) {
          const target = statement.getModuleSpecifierSourceFile()
          const targetEntry = target ? this.entries.get(this.rel(target)) : undefined
          if (target && targetEntry && this.isSupportRole(targetEntry.role)) {
            this.addEdge(node.id, fileNodeId(targetEntry.layer, this.rel(target)), 'uses', statement)
          }
          continue
        }
        this.scanReferences(statement, node.id, mode)
      }
      // Naming convention: Foo.test.tsx tests Foo.tsx.
      if (mode === 'test') {
        const match = /^(.*)\.(test|spec)\.[cm]?[jt]sx?$/.exec(path)
        if (match) {
          for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
            const subject = this.sourceFiles.get(match[1] + ext)
            if (!subject) continue
            const main = this.mainDeclOf(subject)
            if (main) this.addEdge(node.id, main.id, 'tests', sourceFile, 0.9, { reason: 'naming convention' })
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- output

  private output(): ExtractResult {
    const nodes: PluginNode[] = []
    for (const decl of this.decls) {
      if (!decl.kind) continue
      const attrs = { ...decl.attrs }
      if (decl.exported && decl.kind !== 'api-call') attrs.exported = true
      nodes.push({
        id: decl.id,
        label: decl.label,
        kind: decl.kind,
        file: decl.file.path,
        line: decl.decl.getStartLineNumber(),
        endLine: decl.decl.getEndLineNumber(),
        parent: decl.parent,
        role: decl.file.role,
        roleReason: decl.file.roleReason,
        tags: decl.tags.size > 0 ? [...decl.tags].sort() : undefined,
        attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
        description: decl.description,
        descriptionSource: decl.description ? 'doc-comment' : undefined,
      })
    }
    nodes.push(...this.entryNodes.values(), ...this.routeNodes.values(), ...this.testNodes.values())
    const ids = new Set(nodes.map((n) => n.id))
    // Edges to nodes of other plugins (support files, file nodes) are kept; the builder validates them.
    const edges = [...this.edges.values()].filter((e) => ids.has(e.from))
    const claims = [...this.sourceFiles.keys()]
    return { nodes, edges, facts: this.facts.filter((f) => ids.has(f.from)), claims, diagnostics: this.diagnostics }
  }
}

// ------------------------------------------------------------------ syntax helpers

function defaultName(path: string): string {
  const base = path.split('/').pop()!.replace(/\.[^.]+$/, '')
  return base === 'index' ? path.split('/').slice(-2, -1)[0] ?? 'index' : base
}

/** The function behind a variable initializer: arrow/function expression, or memo/forwardRef(fn). */
function functionOf(initializer: Node | undefined): Node | undefined {
  if (!initializer) return undefined
  if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) return initializer
  if (Node.isCallExpression(initializer) && /(^|\.)(memo|forwardRef|observer)$/.test(initializer.getExpression().getText())) {
    return functionOf(initializer.getArguments()[0])
  }
  if (Node.isParenthesizedExpression(initializer) || Node.isAsExpression(initializer) || Node.isSatisfiesExpression(initializer)) {
    return functionOf(initializer.getExpression())
  }
  return undefined
}

/** Strips parentheses, `as` and `satisfies`. */
function unwrap(node: Node | undefined): Node | undefined {
  while (node && (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node))) node = node.getExpression()
  return node
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** The object a function returns: `() => ({ … })` or `() => { return { … } }`. */
function returnedObject(fn: Node | undefined): Node | undefined {
  if (!fn || !(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isMethodDeclaration(fn))) return undefined
  const body = fn.getBody()
  if (body && !Node.isBlock(body)) return unwrap(body)
  const ret = body?.getStatements().find((s) => Node.isReturnStatement(s))
  return ret && Node.isReturnStatement(ret) ? unwrap(ret.getExpression()) : undefined
}

/** An object literal's property (assignment, method or shorthand) by name. */
function property(object: Node | undefined, name: string): Node | undefined {
  if (!object || !Node.isObjectLiteralExpression(object)) return undefined
  return object.getProperty(name)
}

function propertyValue(object: Node | undefined, name: string): Node | undefined {
  const prop = property(object, name)
  if (prop && Node.isPropertyAssignment(prop)) return unwrap(prop.getInitializer())
  return prop && Node.isMethodDeclaration(prop) ? prop : undefined
}

/** createApi({ endpoints: (build) => ({ getX: build.query(…) }) }) / api.injectEndpoints(…) → the getX property. */
function endpointDefinition(api: Node, endpoint: string): Node | undefined {
  const init = Node.isVariableDeclaration(api) ? unwrap(api.getInitializer()) : undefined
  if (!init || !Node.isCallExpression(init)) return undefined
  const endpoints = propertyValue(unwrap(init.getArguments()[0]), 'endpoints')
  return property(returnedObject(endpoints), endpoint)
}

/** createSlice({ reducers: { opened(state) { … } } }) → the `opened` reducer. */
function sliceReducer(slice: Node, action: string): Node | undefined {
  const init = Node.isVariableDeclaration(slice) ? unwrap(slice.getInitializer()) : undefined
  if (!init || !Node.isCallExpression(init)) return undefined
  // reducers: { … } or reducers: (create) => ({ … })
  const reducers = propertyValue(unwrap(init.getArguments()[0]), 'reducers')
  return property(reducers && Node.isObjectLiteralExpression(reducers) ? reducers : returnedObject(reducers), action)
}

function collectMembers(object: Node, path: string[], out: { path: string[]; node: Node; fn: Node }[]): void {
  if (!Node.isObjectLiteralExpression(object)) return
  for (const property of object.getProperties()) {
    if (Node.isMethodDeclaration(property)) {
      out.push({ path: [...path, property.getName()], node: property, fn: property })
    } else if (Node.isPropertyAssignment(property)) {
      const init = property.getInitializer()
      const fn = functionOf(init)
      if (fn) out.push({ path: [...path, property.getName()], node: property, fn })
      else if (init && Node.isObjectLiteralExpression(init)) collectMembers(init, [...path, property.getName()], out)
    }
  }
}

function parameterNames(fn: Node): string[] {
  if (Node.isFunctionDeclaration(fn) || Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isMethodDeclaration(fn)) {
    return fn.getParameters().map((p) => p.getName())
  }
  return []
}

/** Index of the parameter an expression is built from (`path`, `${base}${path}`), or -1. */
function paramReferenced(expression: Node | undefined, params: string[]): number {
  if (!expression) return -1
  if (Node.isIdentifier(expression)) return params.indexOf(expression.getText())
  if (Node.isTemplateExpression(expression)) {
    for (const span of expression.getTemplateSpans()) {
      const index = paramReferenced(span.getExpression(), params)
      if (index >= 0) return index
    }
  }
  if (Node.isBinaryExpression(expression)) {
    const left = paramReferenced(expression.getLeft(), params)
    return left >= 0 ? left : paramReferenced(expression.getRight(), params)
  }
  return -1
}

/** HTTP method from an init argument: { method: 'POST' } → fixed; { ...init } → from that param. */
function methodFromInit(init: Node | undefined, params: string[], fallback: string): MethodSpec {
  if (!init) return { fixed: fallback }
  if (Node.isIdentifier(init)) {
    const index = params.indexOf(init.getText())
    return index >= 0 ? { initParam: index, fallback } : { fixed: fallback }
  }
  if (Node.isObjectLiteralExpression(init)) {
    const literal = methodLiteral(init)
    if (literal) return { fixed: literal }
    for (const property of init.getProperties()) {
      if (Node.isSpreadAssignment(property)) {
        const index = params.indexOf(property.getExpression().getText())
        if (index >= 0) return { initParam: index, fallback }
      }
    }
  }
  return { fixed: fallback }
}

function methodLiteral(init: Node | undefined): string | undefined {
  if (!init || !Node.isObjectLiteralExpression(init)) return undefined
  const property = init.getProperty('method')
  if (property && Node.isPropertyAssignment(property)) {
    const value = property.getInitializer()
    if (value && (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value))) return value.getLiteralText().toUpperCase()
  }
  return undefined
}

/**
 * The static text of a URL expression: 'x', `x`, `${base}/x/${id}` (spans kept as ${…}),
 * 'a' + b, or a const identifier with a static initializer. undefined when not static at all.
 */
function staticUrl(node: Node | undefined, depth = 0): string | undefined {
  if (!node || depth > 4) return undefined
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralText()
  if (Node.isTemplateExpression(node)) {
    let text = node.getHead().getLiteralText()
    for (const span of node.getTemplateSpans()) {
      const inner = staticUrl(span.getExpression(), depth + 1)
      text += inner !== undefined && !inner.includes('${') && Node.isIdentifier(span.getExpression()) && inner.startsWith('/') ? inner : `\${${span.getExpression().getText()}}`
      text += span.getLiteral().getLiteralText()
    }
    return text
  }
  if (Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    const left = staticUrl(node.getLeft(), depth + 1) ?? `\${${node.getLeft().getText()}}`
    const right = staticUrl(node.getRight(), depth + 1) ?? `\${${node.getRight().getText()}}`
    return left + right
  }
  if (Node.isIdentifier(node)) {
    const symbol = node.getSymbol()
    const declaration = symbol?.getDeclarations()[0]
    if (declaration && Node.isVariableDeclaration(declaration) && declaration.getVariableStatement()?.getDeclarationKind() === 'const') {
      const init = declaration.getInitializer()
      if (init && (Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init) || Node.isTemplateExpression(init))) {
        return staticUrl(init, depth + 1)
      }
    }
  }
  return undefined
}

function joinPaths(parent: string, child: string): string {
  if (child.startsWith('/')) return normalizeRoute(child)
  return normalizeRoute(`${parent.replace(/\/$/, '')}/${child}`)
}

function normalizeRoute(path: string): string {
  const cleaned = path.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

function jsxTag(node: Node): Node | undefined {
  if (Node.isJsxElement(node)) return node.getOpeningElement().getTagNameNode()
  if (Node.isJsxSelfClosingElement(node)) return node.getTagNameNode()
  if (Node.isParenthesizedExpression(node)) return jsxTag(node.getExpression())
  return undefined
}

function hasRouteAncestor(node: Node): boolean {
  let current = node.getParent()
  while (current) {
    if (Node.isJsxElement(current) && current.getOpeningElement().getTagNameNode().getText() === 'Route') return true
    current = current.getParent()
  }
  return false
}

function attributeValue(element: Node, name: string): Node | undefined {
  if (!Node.isJsxOpeningElement(element) && !Node.isJsxSelfClosingElement(element)) return undefined
  for (const attribute of element.getAttributes()) {
    if (!Node.isJsxAttribute(attribute) || attribute.getNameNode().getText() !== name) continue
    const init = attribute.getInitializer()
    if (!init) return undefined
    return Node.isJsxExpression(init) ? init.getExpression() : init
  }
  return undefined
}

function containsJsx(node: Node): boolean {
  if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node) || Node.isJsxFragment(node)) return true
  let found = false
  node.forEachDescendant((child, traversal) => {
    if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child) || Node.isJsxFragment(child)) {
      found = true
      traversal.stop()
    }
  })
  return found
}

function isDeclarationName(identifier: Node, parent: Node): boolean {
  return (
    (Node.isVariableDeclaration(parent) ||
      Node.isFunctionDeclaration(parent) ||
      Node.isClassDeclaration(parent) ||
      Node.isInterfaceDeclaration(parent) ||
      Node.isTypeAliasDeclaration(parent) ||
      Node.isParameterDeclaration(parent) ||
      Node.isPropertyAssignment(parent) ||
      Node.isMethodDeclaration(parent) ||
      Node.isPropertySignature(parent) ||
      Node.isBindingElement(parent)) &&
    (parent as unknown as { getNameNode?: () => Node }).getNameNode?.() === identifier
  )
}

/** describe/it/test titles (static strings only). */
function testTitles(sourceFile: SourceFile): string[] {
  const titles: string[] = []
  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return
    const callee = node.getExpression().getText()
    if (!/^(it|test)(\.(only|skip|todo|concurrent|fixme))?$/.test(callee)) return
    const title = staticUrl(node.getArguments()[0])
    if (title) {
      const describe = node.getFirstAncestor(
        (a) => Node.isCallExpression(a) && /^(describe|test\.describe)(\.\w+)?$/.test(a.getExpression().getText()),
      )
      const group = describe && Node.isCallExpression(describe) ? staticUrl(describe.getArguments()[0]) : undefined
      titles.push(group ? `${group} › ${title}` : title)
    }
  })
  return titles
}

/** First paragraph of the JSDoc block right before a declaration. */
function docComment(node: Node | undefined): string | undefined {
  if (!node) return undefined
  const ranges = node.getLeadingCommentRanges()
  const doc = [...ranges].reverse().find((r) => r.getText().startsWith('/**'))
  if (!doc) return undefined
  const text = doc
    .getText()
    .replace(/^\/\*\*|\*\/$/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n')
    .split(/\n\s*@/)[0]
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, 400) : undefined
}
