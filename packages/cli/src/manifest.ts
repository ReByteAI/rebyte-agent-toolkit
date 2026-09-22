import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse, stringify } from 'smol-toml'
import { z } from 'zod'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type { Agent, AgentCreateParams } from 'openai/resources/beta/agents/agents'

const record = z.record(z.unknown())
const name = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)
const functionTool = z.object({
  type: z.literal('function'), name, description: z.string(), parameters: record,
  defer_loading: z.boolean().optional(),
}).strict()
const transport = z.union([
  z.object({ type: z.literal('connection'), connection_id: z.string().min(1).max(4096) }).strict(),
  z.object({ type: z.literal('http'), server_url: z.string().url().refine(value => {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash
  }, 'Use an HTTP(S) URL without credentials or a fragment'), headers: z.record(z.string()).optional() }).strict(),
  z.object({ type: z.literal('stdio'), command: z.string().min(1), cwd: z.string().startsWith('/'),
    args: z.array(z.string()).optional(), env_vars: z.array(z.string()).optional() }).strict(),
])
const mcpTool = z.object({
  type: z.literal('mcp'), server_label: name, transport,
  allowed_tools: z.array(z.string()).optional(), connection_origin: z.enum(['service', 'environment']).optional(),
  credential_id: z.string().min(1).optional(), request_metadata: record.optional(), required: z.boolean().optional(),
}).strict()
const webSearch = z.object({ type: z.literal('web_search'), mode: z.enum(['live', 'disabled']).optional(),
  context_size: z.enum(['low', 'medium', 'high']).optional(), allowed_domains: z.array(z.string()).optional() }).strict()
const toolSearch = z.object({ type: z.literal('tool_search') }).strict()
const dynamicWorkflow = z.object({ type: z.literal('dynamic_workflow') }).strict()
const reasoning = z.object({ effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  summary: z.enum(['auto', 'concise', 'detailed']).optional() }).strict()
const text = z.object({ verbosity: z.enum(['low', 'medium', 'high']).optional(), format: z.union([
  z.object({ type: z.literal('text') }).strict(),
  z.object({ type: z.literal('json_schema'), schema: record }).strict(),
]).optional() }).strict()
const manifestSchema = z.object({
  model: z.string().min(1), name: z.string().max(128).optional(),
  instructions: z.string().max(1048576).optional(), instructions_file: z.string().min(1).optional(),
  tools: z.array(z.union([functionTool, mcpTool, webSearch, toolSearch, dynamicWorkflow])).default([]),
  reasoning: reasoning.optional(), text: text.optional(),
  service_tier: z.enum(['auto', 'default', 'flex', 'priority']).optional(),
  metadata: z.record(z.string().max(64), z.string().max(512)).refine(value => Object.keys(value).length <= 16).optional(),
}).strict()
export type AgentManifest = z.infer<typeof manifestSchema>
const reserved = ['exec_command', 'write_stdin', 'apply_patch', 'view_image', 'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource', 'search_tools', 'call_tool', 'tool_search', 'run_code']

function validateSchema(schema: Record<string, unknown>) {
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true })
  addFormats(ajv)
  ajv.compile(schema)
}
function interpolate(value: unknown): unknown {
  if (typeof value === 'string') {
    const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value)
    if (!match) return value
    const resolved = process.env[match[1]!]
    if (!resolved) throw new Error(`Set ${match[1]} before reading this manifest`)
    return resolved
  }
  if (Array.isArray(value)) return value.map(interpolate)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, interpolate(child)]))
  return value
}
export function readAgentManifest(file: string): AgentManifest {
  const raw = parse(readFileSync(file, 'utf8'))
  for (const field of ['llm', 'prompt', 'prompt_file', 'capabilities', 'client_tools', 'mcp_servers', 'sandbox_strategy', 'network_policy', 'skills', 'max_steps', 'description']) {
    if (field in raw) throw new Error(`Retired manifest field '${field}'. Use model/instructions_file/tools; environment and Skills belong to Session creation. See docs/migration.md.`)
  }
  // Resolve references in tool declarations only; instructions retain literal examples.
  if (raw.tools !== undefined) raw.tools = interpolate(raw.tools) as typeof raw.tools
  const manifest = manifestSchema.parse(raw)
  if (manifest.instructions !== undefined && manifest.instructions_file !== undefined) throw new Error('instructions and instructions_file are mutually exclusive')
  if (manifest.instructions_file !== undefined) {
    manifest.instructions = readFileSync(resolve(dirname(resolve(file)), manifest.instructions_file), 'utf8')
    delete manifest.instructions_file
  }
  const names: string[] = []
  if (manifest.tools.some(tool => tool.type === 'function' && tool.defer_loading) && !manifest.tools.some(tool => tool.type === 'tool_search')) throw new Error('defer_loading=true requires a tool_search tool')
  for (const tool of manifest.tools) {
    const label = tool.type === 'mcp' ? tool.server_label : tool.type === 'function' ? tool.name : tool.type
    if (names.includes(label) || ((tool.type === 'function' || tool.type === 'mcp') && reserved.includes(label)) || label.startsWith('rebyte_')) throw new Error(`Duplicate or reserved tool name: ${label}`)
    names.push(label)
    if (tool.type === 'function') validateSchema(tool.parameters)
    if (tool.type === 'mcp') {
      if (tool.transport.type === 'connection' && ((tool.connection_origin !== undefined && tool.connection_origin !== 'service') || tool.credential_id !== undefined)) throw new Error('Platform connections use service origin and manage their own credentials')
      if (tool.transport.type === 'stdio' && tool.connection_origin !== undefined) throw new Error('Omit connection_origin for stdio MCP')
      if (tool.transport.type === 'http' && tool.transport.headers !== undefined) {
        for (const [key, value] of Object.entries(tool.transport.headers)) {
          if (/^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token)$/i.test(key)) throw new Error('MCP credentials belong to the Session or Vault')
          if (/[\r\n]/.test(value)) throw new Error('Invalid MCP header value')
        }
      }
    }
  }
  if (manifest.text?.format?.type === 'json_schema') validateSchema(manifest.text.format.schema)
  return manifestSchema.parse(manifest)
}
export function manifestToApiPayload(manifest: AgentManifest): AgentCreateParams {
  // apply describes the complete saved configuration; omission clears old fields.
  return { model: manifest.model, name: manifest.name ?? null, instructions: manifest.instructions ?? null,
    tools: manifest.tools, metadata: manifest.metadata ?? {}, reasoning: manifest.reasoning ?? null,
    text: manifest.text ?? null, service_tier: manifest.service_tier ?? 'auto', multi_agent: { enabled: false } } as AgentCreateParams
}
function cleanDefinition(value: unknown, key = ''): unknown {
  // Schemas and metadata are opaque JSON. Nulls within them are data.
  if (['parameters', 'schema', 'request_metadata'].includes(key)) return value
  if (Array.isArray(value)) return value.map(child => cleanDefinition(child))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== null).map(([name, child]) => [name, cleanDefinition(child, name)]))
  return value
}
function hasNull(value: unknown): boolean {
  return value === null || (Array.isArray(value) ? value.some(hasNull)
    : typeof value === 'object' && value !== null && Object.values(value).some(hasNull))
}
export function serializeAgentManifest(agent: Agent): string {
  const tools = agent.tools.map(tool => {
    if (tool.type === 'mcp' && tool.transport.type === 'stdio') {
      const { connection_origin, ...definition } = tool
      return definition
    }
    return tool
  })
  const output = cleanDefinition({ model: agent.model, name: agent.name, instructions: agent.instructions,
    tools, reasoning: agent.reasoning, text: agent.text, service_tier: agent.service_tier, metadata: agent.metadata }) as Record<string, unknown>
  if (hasNull(output)) throw new Error('TOML cannot represent literal JSON null. Retrieve this Agent as JSON with the official SDK; no export was written.')
  return stringify(output)
}
