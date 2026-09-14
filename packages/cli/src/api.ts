import Rebyte from '@rebyteai/agent-sdk'
import type { Agent, AgentCreateParams } from '@rebyteai/agent-sdk/resources/beta/agents/agents'

/** Agent management uses the Rebyte SDK fork as the application examples. */
export class RebyteApiClient {
  private readonly client: Rebyte
  constructor(baseUrl: string, apiKey: string) {
    const base = baseUrl.replace(/\/+$/, '')
    this.client = new Rebyte({ apiKey, baseURL: base.endsWith('/v1') ? base : `${base}/v1`, maxRetries: 0 })
  }
  createAgent(payload: AgentCreateParams): Promise<Agent> {
    return this.client.beta.agents.create(payload)
  }
  updateAgent(id: string, payload: AgentCreateParams): Promise<Agent> {
    return this.client.beta.agents.update(id, payload)
  }
  getAgent(id: string): Promise<Agent> {
    return this.client.beta.agents.retrieve(id)
  }
}
