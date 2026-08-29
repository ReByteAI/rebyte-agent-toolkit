import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse, stringify } from 'smol-toml'
import { z } from 'zod'

export const AGENT_MODEL_IDS = [
  'deepseek-v4-pro',
  'glm-5.2',
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
const INTERNAL_CAPABILITIES = new Set<string>(INTERNAL_CAPABILITY_IDS)

const AgentSkillSchema = z.object({
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

const AgentManifestFileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  llm: z.enum(AGENT_MODEL_IDS).optional(),
  max_steps: z.number().int().positive().max(MAX_STEPS).optional(),
  prompt: z.string().max(100_000).optional(),
  prompt_file: z.string().trim().min(1).optional(),
  capabilities: z.array(z.string().trim().min(1)).max(64).optional(),
  skills: z.array(AgentSkillSchema).max(128).optional(),
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
    (manifest.skills ?? []).map((skill) => `${skill.repo}:${skill.path}`),
    'skill',
    ['skills'],
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

export type AgentMcpServer =
  | { kind: 'internal'; name: string }
  | { kind: 'composio'; toolkit: string }
  | { kind: 'custom'; serverId: string }

export interface ResolvedAgentManifest {
  name: string
  description: string | null
  instructions: string
  model: AgentModelId
  maxSteps: number
  mcpServers: AgentMcpServer[]
  skills: AgentSkill[]
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

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${path}${issue.message}`
  }).join('\n')
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
  return {
    name: manifest.name,
    description: manifest.description ?? null,
    instructions,
    model: manifest.llm ?? DEFAULT_MODEL,
    maxSteps: manifest.max_steps ?? DEFAULT_MAX_STEPS,
    mcpServers: capabilities.map(capabilityToMcpServer),
    skills: manifest.skills ?? [],
  }
}

export function serializeAgentManifest(agent: RebyteAgentRecord): string {
  const document: Record<string, unknown> = {
    name: agent.name,
    ...(agent.description === null ? {} : { description: agent.description }),
    llm: agent.model,
    max_steps: agent.maxSteps,
    capabilities: agent.mcpServers.map(mcpServerToCapability),
    prompt: agent.instructions,
    ...(agent.skills.length === 0 ? {} : { skills: agent.skills }),
  }
  return `# agent.toml — generated by Rebyte\n${stringify(document)}`
}

export function manifestToApiPayload(
  manifest: ResolvedAgentManifest,
  options?: { includeNullDescription?: boolean },
): Record<string, unknown> {
  return {
    name: manifest.name,
    ...(manifest.description === null && options?.includeNullDescription !== true
      ? {}
      : { description: manifest.description }),
    instructions: manifest.instructions,
    model: manifest.model,
    maxSteps: manifest.maxSteps,
    mcpServers: manifest.mcpServers,
    skills: manifest.skills,
  }
}
