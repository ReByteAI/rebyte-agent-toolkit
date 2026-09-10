import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse, stringify } from 'smol-toml'
import { z } from 'zod'
import {
  NonStrictClientToolParametersSchema,
  StrictClientToolParametersSchema,
} from './client-tool-schema.js'

export const AGENT_MODEL_IDS = [
  'deepseek-v4-pro',
  'glm-5.3',
  'qwen3.8-max',
  'gemini-3.8-flash',
  'kimi-k3',
  'claude-sonnet-5',
  'claude-opus-5',
  'gpt-5.6',
  'gpt-5.4-mini',
] as const

export type AgentModelId = typeof AGENT_MODEL_IDS[number]

export const INTERNAL_CAPABILITY_IDS = [
  'web_search_&_browse',
  'sandbox',
  'skills',
  'coding_agent',
  'ask_user_question',
  'report_builder',
  'company',
  'app_builder_contract',
  'github',
  'sound_studio',
  'speech_generator',
  'http_client',
] as const

const DEFAULT_CAPABILITY_IDS = [
  'web_search_&_browse',
  'sandbox',
  'skills',
  'coding_agent',
  'ask_user_question',
  'report_builder',
  'company',
] as const

const DEFAULT_MODEL: AgentModelId = 'deepseek-v4-pro'
const DEFAULT_MAX_STEPS = 32
const MAX_STEPS = 128
const GITHUB_REPO_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/
const REPO_RELATIVE_DIRECTORY_PATTERN =
  /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\\)(?!.*[?#\s])[^/]+(?:\/[^/]+)*$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CLIENT_TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const ENVIRONMENT_REFERENCE_PATTERN = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/
const INTERNAL_CAPABILITIES = new Set<string>(INTERNAL_CAPABILITY_IDS)

const AgentSkillSchema = z.object({
  ref: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/).refine(ref => !ref.includes('..')).optional(),
  repo: z.string().min(1).max(300).regex(
    GITHUB_REPO_PATTERN,
    'repo must be a canonical GitHub owner/repo',
  ).refine((repo) => {
    const name = repo.split('/')[1]
    return name !== '.' && name !== '..' && !repo.toLowerCase().endsWith('.git')
  }, 'repo must not end in .git'),
  path: z.string().min(1).max(1000).regex(
    REPO_RELATIVE_DIRECTORY_PATTERN,
    'path must be a canonical repo-relative directory',
  ).refine(
    (path) => path.toLowerCase() !== 'skill.md'
      && !path.toLowerCase().endsWith('/skill.md'),
    'path must name a directory, not SKILL.md',
  ),
}).strict()

const AgentNetworkPolicySchema = z.object({
  allow_network_egress: z.boolean(),
  domain_allowlist: z.enum(['none', 'package_managers_only', 'all_domains']),
  additional_allowed_domains: z.array(z.string().trim().min(1).max(253)).max(128).default([]),
  allow_public_traffic: z.boolean().default(false),
}).strict()

const AgentClientToolFields = {
  type: z.literal('function'),
  name: z.string().regex(
    CLIENT_TOOL_NAME_PATTERN,
    'name must contain 1-64 letters, numbers, underscores, or hyphens',
  ),
  description: z.string().trim().min(1),
}

const AgentClientToolSchema = z.discriminatedUnion('strict', [
  z.object({
    ...AgentClientToolFields,
    parameters: StrictClientToolParametersSchema,
    strict: z.literal(true),
  }).strict(),
  z.object({
    ...AgentClientToolFields,
    parameters: NonStrictClientToolParametersSchema,
    strict: z.literal(false),
  }).strict(),
])

const AgentMcpServerManifestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url'),
    name: z.string().trim().min(1).max(100),
    url: z.string().trim().min(1).max(2_000),
  }).strict(),
  z.object({
    type: z.literal('custom'),
    name: z.string().trim().min(1).max(100).optional(),
    server_id: z.string().regex(UUID_PATTERN, 'server_id must be a UUID'),
  }).strict(),
])

const AgentManifestFileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  llm: z.enum(AGENT_MODEL_IDS).optional(),
  max_steps: z.number().int().positive().max(MAX_STEPS).optional(),
  prompt: z.string().max(100_000).optional(),
  prompt_file: z.string().trim().min(1).optional(),
  capabilities: z.array(z.string().trim().min(1)).max(64).optional(),
  mcp_servers: z.array(AgentMcpServerManifestSchema).max(64).optional(),
  skills: z.array(AgentSkillSchema).max(128).optional(),
  client_tools: z.array(AgentClientToolSchema).max(64).optional(),
  network_policy: AgentNetworkPolicySchema.optional(),
  sandbox_strategy: z.enum(['agent_shared', 'session_dedicated']).optional(),
}).strict().superRefine((manifest, context) => {
  if (manifest.prompt !== undefined && manifest.prompt_file !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prompt_file'],
      message: 'prompt and prompt_file are mutually exclusive',
    })
  }
  validateUnique(manifest.capabilities ?? [], 'capability', ['capabilities'], context)
  validateUnique(
    (manifest.mcp_servers ?? []).map((server) => server.type === 'url'
      ? `url:${server.name}`
      : `custom:${server.server_id}`),
    'MCP server',
    ['mcp_servers'],
    context,
  )
  if (
    (manifest.capabilities?.length ?? DEFAULT_CAPABILITY_IDS.length)
      + (manifest.mcp_servers?.length ?? 0) > 64
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mcp_servers'],
      message: 'capabilities and mcp_servers may contain at most 64 entries in total',
    })
  }
  validateUnique(
    (manifest.skills ?? []).map((skill) => `${skill.repo}:${skill.path}`),
    'skill',
    ['skills'],
    context,
  )
  validateUnique(
    (manifest.client_tools ?? []).map((tool) => tool.name),
    'client tool',
    ['client_tools'],
    context,
  )
  for (const [index, capability] of (manifest.capabilities ?? []).entries()) {
    const error = capabilityError(capability)
    if (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities', index],
        message: error,
      })
    }
  }
})

export type AgentSkill = z.infer<typeof AgentSkillSchema>
export type AgentNetworkPolicy = z.infer<typeof AgentNetworkPolicySchema>
export type AgentClientTool = z.infer<typeof AgentClientToolSchema>

export type AgentMcpServer =
  | { kind: 'internal'; name: string }
  | { kind: 'composio'; toolkit: string }
  | { kind: 'custom'; serverId: string; name?: string }
  | { type: 'url'; name: string; url: string }

export interface ResolvedAgentManifest {
  name: string
  description: string | null
  instructions: string
  model: AgentModelId
  maxSteps: number
  mcpServers: AgentMcpServer[]
  skills: AgentSkill[]
  clientTools: AgentClientTool[]
  networkPolicy: AgentNetworkPolicy | null
  sandboxStrategy?: 'agent_shared' | 'session_dedicated'
}

export interface RebyteAgentRecord extends ResolvedAgentManifest {
  id: string
  object: 'agent'
}

function validateUnique(
  values: readonly string[],
  label: string,
  path: Array<string | number>,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index],
        message: `duplicate ${label}: ${value}`,
      })
    }
    seen.add(value)
  }
}

function capabilityError(value: string): string | null {
  if (INTERNAL_CAPABILITIES.has(value)) return null
  if (value.startsWith('composio:')) {
    const toolkit = value.slice('composio:'.length)
    if (toolkit && toolkit.length <= 300 && toolkit.trim() === toolkit) return null
    return 'Composio capability must be composio:<toolkit>'
  }
  if (value.startsWith('custom:')) {
    return UUID_PATTERN.test(value.slice('custom:'.length))
      ? null
      : 'custom capability must be custom:<server UUID>'
  }
  return `unknown Rebyte capability: ${value}`
}

function capabilityToMcpServer(capability: string): AgentMcpServer {
  if (INTERNAL_CAPABILITIES.has(capability)) {
    return { kind: 'internal', name: capability }
  }
  if (capability.startsWith('composio:')) {
    return { kind: 'composio', toolkit: capability.slice('composio:'.length) }
  }
  if (capability.startsWith('custom:')) {
    return { kind: 'custom', serverId: capability.slice('custom:'.length) }
  }
  throw new Error(`Unsupported Rebyte capability: ${capability}`)
}

function mcpServerToCapability(server: AgentMcpServer): string {
  if (!('kind' in server)) {
    throw new Error('URL MCP servers cannot be serialized as capabilities')
  }
  if (server.kind === 'internal') {
    if (!INTERNAL_CAPABILITIES.has(server.name)) {
      throw new Error(`Agent contains an unsupported internal capability: ${server.name}`)
    }
    return server.name
  }
  if (server.kind === 'composio') return `composio:${server.toolkit}`
  if (server.kind === 'custom') return `custom:${server.serverId}`
  throw new Error('Agent contains an unsupported MCP server')
}

function resolveEnvironmentReference(
  value: string,
  manifestPath: string,
  index: number,
): string {
  const match = ENVIRONMENT_REFERENCE_PATTERN.exec(value)
  if (!match) return value
  const variable = match[1]
  if (!variable) return value
  const resolved = process.env[variable]
  if (!resolved) {
    throw new Error(
      `${manifestPath}: mcp_servers.${index}.url references unset or empty environment variable ${variable}`,
    )
  }
  return resolved
}

function requireHttpUrl(value: string, manifestPath: string, index: number): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${manifestPath}: mcp_servers.${index}.url must be a valid URL`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${manifestPath}: mcp_servers.${index}.url must use https`)
  }
  if (url.username.length > 0 || url.password.length > 0 || url.hash.length > 0) {
    throw new Error(`${manifestPath}: mcp_servers.${index}.url must not contain credentials or a fragment`)
  }
  if (url.toString().length > 2_000) {
    throw new Error(`${manifestPath}: mcp_servers.${index}.url must be at most 2000 characters`)
  }
  return value
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${path}${issue.message}`
  }).join('\n')
}

function findJsonNullPath(value: unknown, path: string): string | null {
  if (value === null) return path
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findJsonNullPath(item, `${path}[${index}]`)
      if (found !== null) return found
    }
    return null
  }
  if (typeof value !== 'object') return null
  for (const [key, item] of Object.entries(value)) {
    const found = findJsonNullPath(item, `${path}.${key}`)
    if (found !== null) return found
  }
  return null
}

export function readAgentManifest(path: string): ResolvedAgentManifest {
  const absolutePath = resolve(path)
  let parsedToml: unknown
  try {
    parsedToml = parse(readFileSync(absolutePath, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${absolutePath}: unable to parse TOML: ${message}`)
  }

  const result = AgentManifestFileSchema.safeParse(parsedToml)
  if (!result.success) {
    throw new Error(`${absolutePath}: invalid agent.toml\n${formatZodError(result.error)}`)
  }

  const manifest = result.data
  let instructions = manifest.prompt ?? ''
  if (manifest.prompt_file !== undefined) {
    const promptPath = resolve(dirname(absolutePath), manifest.prompt_file)
    if (!existsSync(promptPath)) {
      throw new Error(`${absolutePath}: prompt_file does not exist: ${promptPath}`)
    }
    instructions = readFileSync(promptPath, 'utf8')
    if (instructions.length > 100_000) {
      throw new Error(`${absolutePath}: prompt_file exceeds 100000 characters`)
    }
  }

  const capabilities = manifest.capabilities ?? [...DEFAULT_CAPABILITY_IDS]
  const declaredMcpServers: AgentMcpServer[] = (manifest.mcp_servers ?? []).map(
    (server, index) => {
      if (server.type === 'custom') {
        return {
          kind: 'custom',
          serverId: server.server_id,
          ...(server.name === undefined ? {} : { name: server.name }),
        }
      }
      const resolvedUrl = resolveEnvironmentReference(server.url, absolutePath, index)
      return {
        type: 'url',
        name: server.name,
        url: requireHttpUrl(resolvedUrl, absolutePath, index),
      }
    },
  )
  return {
    name: manifest.name,
    description: manifest.description ?? null,
    instructions,
    model: manifest.llm ?? DEFAULT_MODEL,
    maxSteps: manifest.max_steps ?? DEFAULT_MAX_STEPS,
    mcpServers: [
      ...capabilities.map(capabilityToMcpServer),
      ...declaredMcpServers,
    ],
    skills: manifest.skills ?? [],
    clientTools: manifest.client_tools ?? [],
    networkPolicy: manifest.network_policy ?? null,
    ...(manifest.sandbox_strategy === undefined ? {} : { sandboxStrategy: manifest.sandbox_strategy }),
  }
}

export function serializeAgentManifest(agent: RebyteAgentRecord): string {
  for (const [index, tool] of agent.clientTools.entries()) {
    const nullPath = findJsonNullPath(
      tool.parameters,
      `clientTools[${index}].parameters`,
    )
    if (nullPath !== null) {
      throw new Error(
        `${nullPath} contains literal JSON null, which agent.toml cannot represent`,
      )
    }
  }
  const capabilities: string[] = []
  const mcpServers: Array<Record<string, string>> = []
  for (const server of agent.mcpServers) {
    if ('kind' in server && server.kind !== 'custom') {
      capabilities.push(mcpServerToCapability(server))
      continue
    }
    if ('kind' in server) {
      mcpServers.push({
        type: 'custom',
        ...(server.name === undefined ? {} : { name: server.name }),
        server_id: server.serverId,
      })
      continue
    }
    mcpServers.push({
      type: 'url',
      name: server.name,
      url: server.url,
    })
  }
  const document: Record<string, unknown> = {
    name: agent.name,
    ...(agent.description === null ? {} : { description: agent.description }),
    llm: agent.model,
    max_steps: agent.maxSteps,
    capabilities,
    ...(agent.sandboxStrategy === undefined ? {} : { sandbox_strategy: agent.sandboxStrategy }),
    prompt: agent.instructions,
    ...(mcpServers.length === 0 ? {} : { mcp_servers: mcpServers }),
    ...(agent.skills.length === 0 ? {} : { skills: agent.skills }),
    ...(agent.clientTools.length === 0
      ? {}
      : { client_tools: agent.clientTools }),
    ...(agent.networkPolicy === null
      ? {}
      : { network_policy: agent.networkPolicy }),
  }
  return `# agent.toml — generated by Rebyte\n${stringify(document)}`
}

export function manifestToApiPayload(
  manifest: ResolvedAgentManifest,
  options?: {
    includeNullDescription?: boolean
    includeNullNetworkPolicy?: boolean
  },
): Record<string, unknown> {
  return {
    name: manifest.name,
    ...(manifest.description === null && options?.includeNullDescription !== true
      ? {}
      : { description: manifest.description }),
    ...(manifest.sandboxStrategy === undefined ? {} : { sandboxStrategy: manifest.sandboxStrategy }),
    instructions: manifest.instructions,
    model: manifest.model,
    maxSteps: manifest.maxSteps,
    mcpServers: manifest.mcpServers,
    skills: manifest.skills,
    clientTools: manifest.clientTools,
    ...(manifest.networkPolicy === null && options?.includeNullNetworkPolicy !== true
      ? {}
      : { networkPolicy: manifest.networkPolicy }),
  }
}
