// Public-package checks for the fork's destination/authentication and packaging boundary.
// Uses synthetic credentials and an in-process transport; live recipes test the runtime.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Rebyte, { Rebyte as NamedRebyte, rebyteSandbox } from '@rebyteai/agent-sdk'
import { Stream } from '@rebyteai/agent-sdk/core/streaming'

const require = createRequire(import.meta.url)
const CommonJS = require('@rebyteai/agent-sdk')
const saved = { ...process.env }
try {
  for (const name of Object.keys(process.env)) if (name.startsWith('REBYTE_')) delete process.env[name]
  process.env.OPENAI_API_KEY = 'synthetic-openai-key'
  process.env.OPENAI_ADMIN_KEY = 'synthetic-openai-admin'
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
  process.env.OPENAI_ORG_ID = 'synthetic-openai-org'
  process.env.OPENAI_PROJECT_ID = 'synthetic-openai-project'
  process.env.OPENAI_CUSTOM_HEADERS = 'X-Must-Not-Leak: synthetic'
  assert.throws(() => new Rebyte(), /REBYTE_API_KEY/)
  process.env.REBYTE_API_KEY = 'synthetic-rebyte-key'
  const client = new Rebyte()
  assert.equal(Rebyte, NamedRebyte)
  assert.equal(client.baseURL, 'https://api.rebyte.ai/v1')
  assert.equal(client.apiKey, 'synthetic-rebyte-key')
  assert.equal(client.organization, null)
  assert.equal(client.project, null)
  assert.equal(client.withOptions({ timeout: 1234 }).baseURL, client.baseURL)
  assert.equal(new CommonJS().baseURL, client.baseURL)
  assert.equal(new CommonJS.Rebyte().baseURL, client.baseURL)
  assert.equal(typeof Stream, 'function')
  assert.throws(() => new Rebyte({ dataResidency: 'us' }), /not supported/)
  process.env.REBYTE_BASE_URL = 'http://127.0.0.1:34567/v1'
  assert.equal(new Rebyte().baseURL, process.env.REBYTE_BASE_URL)
  assert.equal(new Rebyte({ baseURL: 'http://localhost:34567/v1' }).baseURL, 'http://localhost:34567/v1')
  const environment = rebyteSandbox({ skills: [{ type: 'github', url: 'https://github.com/example/skills', name: 'example' }] })
  assert.equal(environment.type, 'openai_hosted')
  const transportClient = new Rebyte({ fetch: async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:34567/v1/agents/sessions')
    const headers = new Headers(init.headers)
    assert.equal(headers.get('authorization'), 'Bearer synthetic-rebyte-key')
    assert.equal(headers.get('openai-beta'), 'agents=v1')
    assert.equal(headers.get('openai-organization'), null)
    assert.equal(headers.get('x-must-not-leak'), null)
    assert.match(headers.get('user-agent'), /^Rebyte\/JS /)
    assert.deepEqual(JSON.parse(init.body).environment, environment)
    return Response.json({ id: 'session_synthetic', environment })
  } })
  assert.equal((await transportClient.beta.agents.sessions.create({ agent_id: 'agent_synthetic', environment })).id, 'session_synthetic')
  console.log('SDK package smoke passed: ESM, CommonJS, subpaths, Rebyte defaults, credential isolation, clone, beta header, Sandbox serialization.')
} finally {
  for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name]
  Object.assign(process.env, saved)
}
