/** JSON Schema validation (ajv) plus the semantic checks a schema cannot express. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv'
import { TOOL_ROOT } from './config.ts'
import type { PluginOutput, RepoGraph } from '../shared/types.ts'

let validators: { graph: ValidateFunction; plugin: ValidateFunction } | undefined

function getValidators() {
  if (!validators) {
    const ajv = new Ajv({ allErrors: true, strict: false })
    const load = (name: string) => JSON.parse(readFileSync(join(TOOL_ROOT, 'schema', name), 'utf8'))
    validators = {
      graph: ajv.compile(load('graph.schema.json')),
      plugin: ajv.compile(load('plugin-output.schema.json')),
    }
  }
  return validators
}

function format(errors: ErrorObject[] | null | undefined, limit = 12): string[] {
  return (errors ?? []).slice(0, limit).map((e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim())
}

export function validatePluginOutput(output: unknown): string[] {
  const { plugin } = getValidators()
  return plugin(output) ? [] : format(plugin.errors)
}

/** Schema + semantics: unknown vocabulary, dangling edges/parents, duplicate ids. */
export function validateGraph(graph: unknown): string[] {
  const { graph: validate } = getValidators()
  if (!validate(graph)) return format(validate.errors)
  const g = graph as RepoGraph
  const problems: string[] = []
  const layers = new Set(g.meta.layers.map((l) => l.id))
  const roles = new Set(g.meta.roles.map((r) => r.id))
  const kinds = new Set(g.meta.kinds.map((k) => k.id))
  const edgeTypes = new Set(g.meta.edgeTypes.map((t) => t.id))
  const ids = new Set<string>()
  for (const node of g.nodes) {
    if (ids.has(node.id)) problems.push(`duplicate node id ${node.id}`)
    ids.add(node.id)
    if (!layers.has(node.layer)) problems.push(`${node.id}: unknown layer "${node.layer}"`)
    if (!roles.has(node.role)) problems.push(`${node.id}: unknown role "${node.role}"`)
    if (!kinds.has(node.kind)) problems.push(`${node.id}: unknown kind "${node.kind}"`)
  }
  for (const node of g.nodes) {
    if (node.parent && !ids.has(node.parent)) problems.push(`${node.id}: parent ${node.parent} does not exist`)
  }
  for (const edge of g.edges) {
    if (!ids.has(edge.from)) problems.push(`edge ${edge.type}: missing from ${edge.from}`)
    if (!ids.has(edge.to)) problems.push(`edge ${edge.type}: missing to ${edge.to}`)
    if (!edgeTypes.has(edge.type)) problems.push(`edge ${edge.from} → ${edge.to}: unknown type "${edge.type}"`)
  }
  return problems.slice(0, 50)
}

export function assertValidPluginOutput(pluginId: string, output: unknown): asserts output is PluginOutput {
  const problems = validatePluginOutput(output)
  if (problems.length > 0) {
    throw new Error(`Plugin "${pluginId}" printed output that does not match the schema:\n  - ${problems.join('\n  - ')}`)
  }
}
