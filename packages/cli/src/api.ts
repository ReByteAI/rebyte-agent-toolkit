import OpenAI from 'openai'
import type { Agent, AgentCreateParams } from 'openai/resources/beta/agents/agents'

/** Agent management uses the official OpenAI SDK with the Rebyte API endpoint. */
export class RebyteApiClient {
  private readonly client: OpenAI
  constructor(baseUrl: string, apiKey: string) {
    const base = baseUrl.replace(/\/+$/, '')
    this.client = new OpenAI({ apiKey, baseURL: base.endsWith('/v1') ? base : `${base}/v1`, maxRetries: 0 })
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
