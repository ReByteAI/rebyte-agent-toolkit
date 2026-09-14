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
const agentId = 'agent_cli_fixture'
let agent
const methods = []
const server = createServer(async (request, response) => {
  assert.equal(request.headers.authorization, 'Bearer local_test_key')
  assert.equal(request.headers['openai-beta'], 'agents=v1')
  methods.push(request.method)
  const body = await readJsonBody(request)
  if (request.method === 'POST') agent = { id: agentId, object: 'agent', ...body }
  return sendJson(response, 200, agent)
})
try {
  await listen(server)
  const common = ['--base-url', `http://127.0.0.1:${server.address().port}/v1`, '--api-key', 'local_test_key']
  const file = join(fixtureDir, 'agent.toml')
  writeFileSync(join(fixtureDir, 'prompt.md'), 'Keep literal ${EXAMPLE}.')
  writeFileSync(file, 'model = "gpt-5.6-luna"\nname = "Example"\ninstructions_file = "prompt.md"\ntools = []\n[text.format]\ntype = "json_schema"\nschema = { type = "object", properties = { answer = { type = "string" } } }\n')
  await runCli(['agent', 'validate', '-f', file])
  await runCli(['agent', 'create', '-f', file, ...common])
  assert.equal(agent.instructions, 'Keep literal ${EXAMPLE}.')
  assert.equal(agent.model, 'gpt-5.6-luna')
  const output = join(fixtureDir, 'export.toml')
  await runCli(['agent', 'export', agentId, '-o', output, ...common])
  await runCli(['agent', 'validate', '-f', output])
  assert.match(readFileSync(output, 'utf8'), /json_schema/)
  assert.match((await runCli(['agent', 'export', agentId, '-o', output, ...common], false)).stderr, /already exists/)
  agent.text.format.schema.properties.answer.enum = ['yes', null]
  assert.match((await runCli(['agent', 'export', agentId, ...common], false)).stderr, /literal JSON null/)
  writeFileSync(file, 'model = "gpt-5.6-luna"\n')
  await runCli(['agent', 'apply', agentId, '-f', file, ...common])
  assert.deepEqual(agent.tools, [])
  assert.equal(agent.text, null)
  assert.equal(agent.instructions, null)
  assert.deepEqual(methods, ['POST', 'GET', 'GET', 'POST'])
  writeFileSync(file, 'llm = "old"\n')
  assert.match((await runCli(['agent', 'validate', '-f', file], false)).stderr, /Retired manifest field/)
  writeFileSync(file, 'model = "gpt-5.6-luna"\n[[tools]]\ntype = "mcp"\nserver_label = "private"\ntransport = { type = "http", server_url = "https://example.com/mcp", headers = { Authorization = "secret" } }\n')
  assert.match((await runCli(['agent', 'validate', '-f', file], false)).stderr, /credentials belong to the Session/)
  console.log('Agents CLI protocol and manifest round-trip smoke passed (local HTTP fixture)')
} finally {
  await new Promise(resolve => server.close(resolve))
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
