import axe from 'axe-core'

/**
 * What axe finds against WCAG 2.1 A and AA in the element (the page by default): one line per rule,
 * with where. Expect `[]`.
 */
export async function a11yViolations(context: Element = document.body): Promise<string[]> {
  const result = await axe.run(context, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}
