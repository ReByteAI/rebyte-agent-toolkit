import OpenAI from 'openai'
import { RebyteExtensions } from '@rebyteai/agent-extensions'

// Each recipe owns its resources. Never enumerate and delete an organization's runs.
export function workflowExample() {
  const client = new RebyteExtensions(new OpenAI({ apiKey: process.env.REBYTE_API_KEY, baseURL: process.env.REBYTE_BASE_URL ?? 'https://api.rebyte.ai/v1', maxRetries: 0 }))
  const agents = new Set()
  const runs = new Set()
  const rememberAgent = agent => { agents.add(agent.id); return agent }
  const rememberRun = run => { runs.add(run.id); return run }
  const completed = run => {
    rememberRun(run)
    if (run.status !== 'completed') throw new Error(`Run ${run.id}: ${run.status}: ${run.error}`)
    return run
  }
  async function consume(stream) {
    let terminal
    for await (const event of stream) {
      if ('run' in event) rememberRun(event.run)
      if (event.type === 'workflow.run.output') console.log('Progress:', event.value)
      if (event.type === 'workflow.run.tool.failed') console.log('Tool error:', event.error)
      if (['workflow.run.completed', 'workflow.run.failed', 'workflow.run.cancelled'].includes(event.type)) {
        terminal = event.run
      }
    }
    // An interrupted stream can end without throwing. Never treat that as success.
    if (!terminal) throw new Error('Stream ended without a terminal run event')
    return completed(terminal)
  }
  async function cleanup() {
    const errors = []
    for (const id of runs) {
      try {
        const run = await client.workflowAgents.runs.retrieve(id)
        if (['preparing', 'in_progress'].includes(run.status)) await client.workflowAgents.runs.cancel(id)
        await client.workflowAgents.runs.delete(id)
      } catch (error) { errors.push(new Error(`Could not clean up run ${id}`, { cause: error })) }
    }
    for (const id of agents) {
      try { await client.workflowAgents.delete(id) }
      catch (error) { errors.push(new Error(`Could not clean up agent ${id}`, { cause: error })) }
    }
    if (errors.length) throw new AggregateError(errors, 'Workflow recipe cleanup failed')
  }
  return { client, rememberAgent, rememberRun, completed, consume, cleanup }
}
