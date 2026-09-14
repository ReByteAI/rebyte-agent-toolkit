import { createAgentApp } from '@rebyte/agent-server'
interface Bindings { REBYTE_API_KEY: string; REBYTE_AGENT_ID: string; REBYTE_API_URL: string }
export default {
  fetch(request: Request, env: Bindings) {
    return createAgentApp({ apiKey: env.REBYTE_API_KEY, agentId: env.REBYTE_AGENT_ID, baseURL: env.REBYTE_API_URL }).fetch(request)
  },
}
