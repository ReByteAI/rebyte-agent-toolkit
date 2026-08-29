import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RebyteApiClient } from './api.js'
import {
  manifestToApiPayload,
  readAgentManifest,
  serializeAgentManifest,
} from './manifest.js'

const VERSION = '0.1.0'
const DEFAULT_BASE_URL = 'https://api.rebyte.ai'
type RebyteEnvironment = 'dev' | 'test' | 'prod'

interface CommandOptions {
  file: string
  output?: string
  environment?: RebyteEnvironment
  baseUrl?: string
  apiKey?: string
  force: boolean
  positionals: string[]
}

function usage(): string {
  return `Rebyte CLI

Usage:
  rebyte agent validate [-f agent.toml]
  rebyte agent create   [-f agent.toml]
  rebyte agent apply <agent-id> [-f agent.toml]
  rebyte agent export <agent-id> [-o agent.toml] [--force]

Options:
  -f, --file <path>       Manifest path (default: ./agent.toml)
  -o, --output <path>     Export destination (default: stdout)
      --force             Overwrite an existing export destination
      --env <name>        Environment: dev, test, or prod
      --base-url <url>    Exact API base URL; overrides --env
      --api-key <key>     API key (default: REBYTE_API_KEY)
  -h, --help              Show help
  -v, --version           Show version
`
}

function parseOptions(args: string[]): CommandOptions {
  const apiKey = process.env.REBYTE_API_KEY
  const options: CommandOptions = {
    file: 'agent.toml',
    ...(apiKey ? { apiKey } : {}),
    force: false,
    positionals: [],
  }
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === undefined) throw new Error('Unable to parse command options')
    if (value === '-f' || value === '--file') {
      options.file = requireFlagValue(args, ++index, value)
    } else if (value === '-o' || value === '--output') {
      options.output = requireFlagValue(args, ++index, value)
    } else if (value === '--base-url') {
      options.baseUrl = requireFlagValue(args, ++index, value)
    } else if (value === '--env') {
      const environment = requireFlagValue(args, ++index, value)
      if (environment !== 'dev' && environment !== 'test' && environment !== 'prod') {
        throw new Error('--env must be one of: dev, test, prod')
      }
      options.environment = environment
    } else if (value === '--api-key') {
      options.apiKey = requireFlagValue(args, ++index, value)
    } else if (value === '--force') {
      options.force = true
    } else if (value.startsWith('-')) {
      throw new Error(`Unknown option: ${value}`)
    } else {
      options.positionals.push(value)
    }
  }
  return options
}

function requireFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index]
  if (!value || value.startsWith('-')) throw new Error(`${flag} requires a value`)
  return value
}

function requireApiClient(options: CommandOptions): RebyteApiClient {
  if (!options.apiKey) throw new Error('REBYTE_API_KEY is required for this command')
  return new RebyteApiClient(resolveBaseUrl(options), options.apiKey)
}

function resolveBaseUrl(options: CommandOptions): string {
  if (options.baseUrl) return options.baseUrl
  if (!options.environment && process.env.REBYTE_BASE_URL) {
    return process.env.REBYTE_BASE_URL
  }
  const environment = options.environment ?? process.env.REBYTE_ENV ?? 'prod'
  if (environment === 'prod') return DEFAULT_BASE_URL
  if (environment === 'dev') {
    return process.env.REBYTE_DEV_BASE_URL ?? 'http://localhost:3332'
  }
  if (environment === 'test') {
    const testUrl = process.env.REBYTE_TEST_BASE_URL
    if (!testUrl) throw new Error('REBYTE_TEST_BASE_URL is required for --env test')
    return testUrl
  }
  throw new Error(`Unknown REBYTE_ENV: ${environment}`)
}

function requireAgentId(options: CommandOptions): string {
  const id = options.positionals[0]
  if (!id || options.positionals.length !== 1) {
    throw new Error('Exactly one <agent-id> is required')
  }
  return id
}

async function run(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help') || args.length === 0) {
    process.stdout.write(usage())
    return
  }
  if (args.length === 1 && (args[0] === '-v' || args[0] === '--version')) {
    process.stdout.write(`${VERSION}\n`)
    return
  }
  const resource = args[0]
  if (resource !== 'agent') throw new Error(`Unknown resource: ${resource}`)
  const command = args[1]
  const options = parseOptions(args.slice(2))

  if (command === 'validate') {
    if (options.positionals.length > 0) {
      throw new Error('validate does not accept positional arguments')
    }
    const manifest = readAgentManifest(options.file)
    process.stdout.write(`Valid agent.toml: ${manifest.name}\n`)
    return
  }

  if (command === 'create') {
    if (options.positionals.length > 0) {
      throw new Error('create does not accept positional arguments')
    }
    const manifest = readAgentManifest(options.file)
    const agent = await requireApiClient(options).createAgent(manifestToApiPayload(manifest))
    process.stdout.write(`Created Agent ${agent.id} (${agent.name})\n`)
    return
  }

  if (command === 'apply') {
    const id = requireAgentId(options)
    const manifest = readAgentManifest(options.file)
    const agent = await requireApiClient(options).updateAgent(
      id,
      manifestToApiPayload(manifest, { includeNullDescription: true }),
    )
    process.stdout.write(`Applied agent.toml to Agent ${agent.id} (${agent.name})\n`)
    return
  }

  if (command === 'export') {
    const id = requireAgentId(options)
    const outputPath = options.output && options.output !== '-'
      ? resolve(options.output)
      : undefined
    if (outputPath && existsSync(outputPath) && !options.force) {
      throw new Error(`${outputPath} already exists; pass --force to overwrite it`)
    }
    const agent = await requireApiClient(options).getAgent(id)
    const output = serializeAgentManifest(agent)
    if (!outputPath) {
      process.stdout.write(output)
      return
    }
    writeFileSync(outputPath, output, 'utf8')
    process.stdout.write(`Exported Agent ${agent.id} to ${outputPath}\n`)
    return
  }

  throw new Error(`Unknown agent command: ${command ?? '(missing)'}`)
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Error: ${message}\n`)
  process.exitCode = 1
})
