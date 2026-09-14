import '../load-env.js'
import { serve } from '@hono/node-server'
import { createAgentApp } from '@rebyteai/agent-server'

const apiKey = process.env.REBYTE_API_KEY
const agentId = process.env.REBYTE_AGENT_ID
const baseURL = process.env.REBYTE_API_URL
if (!apiKey || !agentId) throw new Error('Set REBYTE_API_KEY and REBYTE_AGENT_ID before starting the example')
const app = createAgentApp({ apiKey, agentId, baseURL })
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 4101) }, info => {
  console.log(`Rebyte Agents API example listening on http://${info.address}:${info.port}`)
})
