/**
 * When a component renders a child: the conditions around a JSX element, read from the code between it and the
 * component's function. `cond && <X />`, `cond ? <A /> : <B />`, `if (cond) return <X />`, an early
 * `if (cond) return …` before it, and `.map(…)` over a list. Each condition also says what it reads: the
 * component's own state, a store selector, a query, a prop — traced through the locals it was worked out from.
 */
import { Node, SyntaxKind } from 'ts-morph'
import type { RenderCase, ShownElement } from '../../src/shared/types.ts'

export type { RenderCase, ShownElement }

const MAX_TEXT = 140

export function renderCase(element: Node, root: Node): RenderCase {
  const clauses: string[] = []
  const conditions: Node[] = []
  let each: Node | undefined
  const add = (condition: Node, negated: boolean) => {
    clauses.push(negated ? negate(text(condition)) : text(condition))
    conditions.push(condition)
  }

  let child: Node = element
  let parent = element.getParent()
  while (parent && child !== root) {
    if (Node.isBinaryExpression(parent) && parent.getRight() === child) {
      const op = parent.getOperatorToken().getKind()
      if (op === SyntaxKind.AmpersandAmpersandToken) add(parent.getLeft(), false)
      else if (op === SyntaxKind.BarBarToken) add(parent.getLeft(), true)
    } else if (Node.isConditionalExpression(parent) && parent.getCondition() !== child) {
      add(parent.getCondition(), parent.getWhenFalse() === child)
    } else if (Node.isIfStatement(parent) && parent.getExpression() !== child) {
      add(parent.getExpression(), parent.getElseStatement() === child)
    } else if (Node.isBlock(parent) || Node.isSourceFile(parent)) {
      // An early `if (…) return` before this statement: getting here means it didn't return.
      for (const statement of parent.getStatements()) {
        if (statement === child) break
        if (Node.isIfStatement(statement) && !statement.getElseStatement() && returns(statement.getThenStatement())) add(statement.getExpression(), true)
      }
    } else if (Node.isCallExpression(parent) && parent.getArguments().includes(child)) {
      const callee = parent.getExpression()
      if (Node.isPropertyAccessExpression(callee) && ['map', 'flatMap'].includes(callee.getName())) each ??= callee.getExpression()
    }
    child = parent
    parent = parent.getParent()
  }

  // Outermost first: the order they're checked in.
  clauses.reverse()
  conditions.reverse()
  const reads = readsOf(conditions, each ? [each] : [], root)
  return { if: clauses, line: element.getStartLineNumber(), ...(each ? { each: text(each) } : {}), ...(reads.length ? { reads } : {}) }
}

/** Whether a statement always returns (a `return`, or a block ending in one). */
function returns(statement: Node): boolean {
  if (Node.isReturnStatement(statement)) return true
  if (Node.isBlock(statement)) {
    const last = statement.getStatements().at(-1)
    return !!last && Node.isReturnStatement(last)
  }
  return false
}

function text(node: Node): string {
  const t = node.getText().replace(/\s+/g, ' ').trim()
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 1)}…` : t
}

export function negate(condition: string): string {
  if (/^!\s*[\w$.?]+$/.test(condition)) return condition.replace(/^!\s*/, '')
  if (/^!\((.*)\)$/.test(condition)) return condition.slice(2, -1)
  if (/^[\w$.?]+$/.test(condition)) return `!${condition}`
  // One comparison: the opposite comparison reads better than !(…).
  const comparison = /^([^=!&|?]+) (===|!==) ([^=!&|?]+)$/.exec(condition)
  if (comparison) return `${comparison[1]} ${comparison[2] === '===' ? '!==' : '==='} ${comparison[3]}`
  return `!(${condition})`
}

/** The locals the conditions use, each traced back (through up to 3 locals) to the hooks or props it comes from. */
function readsOf(conditions: Node[], extra: Node[], root: Node): { name: string; from: string }[] {
  const reads = new Map<string, string>()
  const seen = new Set<Node>()
  const sourcesOf = (expression: Node, depth: number): string[] => {
    const sources = new Set<string>()
    const visit = (node: Node) => {
      if (Node.isCallExpression(node)) {
        const callee = node.getExpression()
        const name = Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText()
        if (/^use[A-Z]/.test(name)) {
          sources.add(hookText(node, name))
          return
        }
      }
      if (Node.isIdentifier(node) && depth < 3) for (const source of localSources(node, depth + 1)) sources.add(source)
      node.forEachChild(visit)
    }
    visit(expression)
    return [...sources]
  }
  const localSources = (identifier: Node, depth: number): string[] => {
    const declaration = declarationIn(identifier, root)
    if (!declaration || seen.has(declaration)) return []
    seen.add(declaration)
    if (Node.isParameterDeclaration(declaration)) return ['a prop']
    if (Node.isBindingElement(declaration)) {
      if (declaration.getFirstAncestor((a) => Node.isParameterDeclaration(a))) return ['a prop']
      const variable = declaration.getFirstAncestor((a) => Node.isVariableDeclaration(a))
      return variable && Node.isVariableDeclaration(variable) && variable.getInitializer() ? sourcesOf(variable.getInitializer()!, depth) : []
    }
    if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer()
      return initializer ? sourcesOf(initializer, depth) : []
    }
    return []
  }
  for (const condition of [...conditions, ...extra]) {
    const identifiers = Node.isIdentifier(condition) ? [condition] : condition.getDescendantsOfKind(SyntaxKind.Identifier)
    for (const identifier of identifiers) {
      // `state.status`: the local is `state`, not `status`.
      const parent = identifier.getParent()
      if (parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier) continue
      const name = identifier.getText()
      if (reads.has(name)) continue
      seen.clear()
      const sources = localSources(identifier, 0)
      if (sources.length) reads.set(name, sources.join(', '))
    }
  }
  return [...reads].map(([name, from]) => ({ name, from }))
}

/** The declaration of a local of the component (not an import, not a module constant). */
function declarationIn(identifier: Node, root: Node): Node | undefined {
  const symbol = identifier.getSymbol()
  const declaration = symbol?.getDeclarations()[0]
  if (!declaration) return undefined
  return declaration.getAncestors().includes(root) ? declaration : undefined
}

/** `useGetLatestQuery`, or a selector's body: `useAppSelector(state.site)`. */
function hookText(call: Node, name: string): string {
  if (!Node.isCallExpression(call)) return name
  const first = call.getArguments()[0]
  if (first && (Node.isArrowFunction(first) || Node.isFunctionExpression(first)) && /Selector$/.test(name)) {
    const body = first.getBody()
    if (!Node.isBlock(body)) return `${name}(${text(body)})`
  }
  return name
}

/**
 * Whether this element is the one a condition picks (`cond && <p>…</p>`, a branch of `?:`, `if (cond) return <p />`),
 * not something nested inside an element that is.
 */
export function directlyConditional(element: Node, root: Node): boolean {
  let child: Node = element
  let parent = element.getParent()
  while (parent && child !== root) {
    if (Node.isJsxElement(parent) || Node.isJsxFragment(parent)) return false
    if (Node.isBinaryExpression(parent) && parent.getRight() === child) {
      const op = parent.getOperatorToken().getKind()
      if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) return true
    }
    if (Node.isConditionalExpression(parent) && parent.getCondition() !== child) return true
    if (Node.isIfStatement(parent) && parent.getExpression() !== child) return true
    if (Node.isBlock(parent) || Node.isArrowFunction(parent) || Node.isFunctionDeclaration(parent)) return false
    child = parent
    parent = parent.getParent()
  }
  return false
}

/** A plain element shown under a condition: its tag, first class, and a glimpse of what it holds. */
export function shownElement(element: Node, root: Node): ShownElement {
  const opening = Node.isJsxElement(element) ? element.getOpeningElement() : element
  const tag = Node.isJsxOpeningElement(opening) || Node.isJsxSelfClosingElement(opening) ? opening.getTagNameNode().getText() : 'element'
  let className: string | undefined
  if (Node.isJsxOpeningElement(opening) || Node.isJsxSelfClosingElement(opening)) {
    const attribute = opening.getAttribute('className')
    const initializer = attribute && Node.isJsxAttribute(attribute) ? attribute.getInitializer() : undefined
    if (initializer && Node.isStringLiteral(initializer)) className = initializer.getLiteralText().split(/\s+/).filter(Boolean).at(-1)
  }
  let content: string | undefined
  if (Node.isJsxElement(element)) {
    for (const child of element.getJsxChildren()) {
      const piece = Node.isJsxText(child) ? child.getText().replace(/\s+/g, ' ').trim() : Node.isJsxExpression(child) ? text(child) : ''
      if (piece) {
        content = piece.length > 60 ? `${piece.slice(0, 59)}…` : piece
        break
      }
    }
  }
  return { tag, ...(className ? { className } : {}), ...(content ? { content } : {}), case: renderCase(element, root) }
}
