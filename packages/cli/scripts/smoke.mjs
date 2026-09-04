import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const cliPath = join(packageDir, 'dist', 'cli.js')
const fixtureDir = mkdtempSync(join(tmpdir(), 'rebyte-agent-cli-'))
const agentId = 'c05ff691-8e23-4c3c-9d77-29d5783387e5'
let agent = null
let requestCount = 0

const server = createServer(async (request, response) => {
  requestCount += 1
  assert.equal(request.headers.api_key, 'local_test_key')
  const body = await readJsonBody(request)
  if (request.method === 'POST' && request.url === '/v1/agents') {
    agent = { id: agentId, object: 'agent', ...body }
    return sendJson(response, 201, { agent })
  }
  if (request.method === 'PATCH' && request.url === `/v1/agents/${agentId}`) {
    assert.ok(agent)
    agent = { ...agent, ...body, id: agentId, object: 'agent' }
    return sendJson(response, 200, { agent })
  }
  if (request.method === 'GET' && request.url === `/v1/agents/${agentId}`) {
    assert.ok(agent)
    return sendJson(response, 200, { agent })
  }
  return sendJson(response, 404, { error: { message: 'not found' } })
})

try {
  writeFileSync(join(fixtureDir, 'prompt.md'), 'Research carefully.\n', 'utf8')
  writeFileSync(join(fixtureDir, 'agent.toml'), `
name = "Research Agent"
description = "Research with citations"
llm = "deepseek-v4-pro"
max_steps = 24
prompt_file = "prompt.md"
capabilities = [
  "web_search_&_browse",
  "composio:github",
  "custom:550e8400-e29b-41d4-a716-446655440000"
]

[[skills]]
repo = "rebyteai/skills"
path = "research/deep-research"

[[client_tools]]
type = "function"
name = "present_research"
description = "Render the research result in the host application."
strict = true

[client_tools.parameters]
type = "object"
"$schema" = "http://json-schema.org/draft-07/schema#"
required = ["title", "sources"]
additionalProperties = false

[client_tools.parameters.properties.title]
type = ["string", "null"]
minLength = 1

[client_tools.parameters.properties.sources]
type = "array"
minItems = 1
maxItems = 20
items = { type = "string" }

[network_policy]
allow_network_egress = true
domain_allowlist = "none"
additional_allowed_domains = ["api.example.com"]
allow_public_traffic = false
`, 'utf8')

  await listen(server)
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  process.env.REBYTE_TEST_BASE_URL = `http://127.0.0.1:${address.port}`
  const common = ['--env', 'test', '--api-key', 'local_test_key']

  const validated = await runCli([
    'agent', 'validate', '-f', join(fixtureDir, 'agent.toml'),
  ])
  assert.match(validated.stdout, /Valid agent\.toml: Research Agent/)

  const created = await runCli([
    'agent', 'create', '-f', join(fixtureDir, 'agent.toml'), ...common,
  ])
  assert.match(created.stdout, new RegExp(`Created Agent ${agentId}`))
  assert.equal(agent.instructions, 'Research carefully.\n')
  assert.equal(agent.mcpServers[1].kind, 'composio')
  assert.equal(agent.mcpServers[2].kind, 'custom')
  assert.deepEqual(agent.clientTools, [{
    type: 'function',
    name: 'present_research',
    description: 'Render the research result in the host application.',
    parameters: {
      type: 'object',
      $schema: 'http://json-schema.org/draft-07/schema#',
      required: ['title', 'sources'],
      additionalProperties: false,
      properties: {
        title: { type: ['string', 'null'], minLength: 1 },
        sources: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: { type: 'string' },
        },
      },
    },
    strict: true,
  }])
  assert.deepEqual(agent.networkPolicy, {
    allow_network_egress: true,
    domain_allowlist: 'none',
    additional_allowed_domains: ['api.example.com'],
    allow_public_traffic: false,
  })

  const exportPath = join(fixtureDir, 'exported.toml')
  const exported = await runCli([
    'agent', 'export', agentId, '-o', exportPath, ...common,
  ])
  assert.match(exported.stdout, /Exported Agent/)
  const exportedText = readFileSync(exportPath, 'utf8')
  assert.match(exportedText, /composio:github/)
  assert.match(exportedText, /\[\[skills\]\]/)
  assert.match(exportedText, /\[\[client_tools\]\]/)
  assert.match(exportedText, /\[client_tools\.parameters\.properties\.title\]/)
  assert.match(exportedText, /\[network_policy\]/)
  await runCli(['agent', 'validate', '-f', exportPath])

  const refusedOverwrite = await runCli([
    'agent', 'export', agentId, '-o', exportPath, ...common,
  ], false)
  assert.match(refusedOverwrite.stderr, /already exists/)

  agent.clientTools[0].parameters.properties.title.enum = ['brief', null]
  const refusedNullExport = await runCli([
    'agent', 'export', agentId, ...common,
  ], false)
  assert.match(
    refusedNullExport.stderr,
    /clientTools\[0\]\.parameters\.properties\.title\.enum\[1\] contains literal JSON null/,
  )
  delete agent.clientTools[0].parameters.properties.title.enum

  writeFileSync(join(fixtureDir, 'apply.toml'), `
name = "Updated Research Agent"
llm = "glm-5.3"
max_steps = 32
prompt = "Updated prompt"
capabilities = ["sandbox", "skills"]
`, 'utf8')
  const applied = await runCli([
    'agent', 'apply', agentId, '-f', join(fixtureDir, 'apply.toml'), ...common,
  ])
  assert.match(applied.stdout, /Applied agent\.toml/)
  assert.equal(agent.name, 'Updated Research Agent')
  assert.equal(agent.description, null)
  assert.equal(agent.instructions, 'Updated prompt')
  assert.deepEqual(agent.clientTools, [])
  assert.equal(agent.networkPolicy, null)

  writeFileSync(join(fixtureDir, 'unknown.toml'), 'name = "Bad"\ntype = "codex"\n', 'utf8')
  const unknown = await runCli([
    'agent', 'validate', '-f', join(fixtureDir, 'unknown.toml'),
  ], false)
  assert.match(unknown.stderr, /Unrecognized key.*type/)

  writeFileSync(join(fixtureDir, 'unsupported-schema.toml'), `
name = "Bad schema"

[[client_tools]]
type = "function"
name = "search"
description = "Search locally."
strict = true

[client_tools.parameters]
type = "object"
required = ["query"]
additionalProperties = false

[client_tools.parameters.properties.query]
type = "string"
default = "all"
`, 'utf8')
  const unsupportedSchema = await runCli([
    'agent', 'validate', '-f', join(fixtureDir, 'unsupported-schema.toml'),
  ], false)
  assert.match(
    unsupportedSchema.stderr,
    /unsupported strict JSON Schema keyword: default/,
  )

  writeFileSync(join(fixtureDir, 'optional-field.toml'), `
name = "Bad required fields"

[[client_tools]]
type = "function"
name = "search"
description = "Search locally."
strict = true

[client_tools.parameters]
type = "object"
required = []
additionalProperties = false

[client_tools.parameters.properties.query]
type = "string"
`, 'utf8')
  const optionalField = await runCli([
    'agent', 'validate', '-f', join(fixtureDir, 'optional-field.toml'),
  ], false)
  assert.match(
    optionalField.stderr,
    /required: must contain every property name exactly once/,
  )

  assert.equal(requestCount, 4)
  process.stdout.write('agent.toml CLI smoke passed\n')
} finally {
  await new Promise((resolve) => server.close(resolve))
  rmSync(fixtureDir, { recursive: true, force: true })
}

function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, '127.0.0.1', resolve)
  })
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (chunks.length === 0) return null
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function runCli(args, expectSuccess = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: fixtureDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code) => {
      if ((code === 0) !== expectSuccess) {
        reject(new Error(
          `Unexpected CLI exit ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ))
        return
      }
      resolve({ code, stdout, stderr })
    })
  })
}
