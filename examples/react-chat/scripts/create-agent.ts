import '../load-env.js'
import Rebyte from '@rebyteai/agent-sdk'
import { readFile } from 'node:fs/promises'
const apiKey = process.env.REBYTE_API_KEY
if (!apiKey) throw new Error('Set REBYTE_API_KEY')
const client = new Rebyte({ apiKey, baseURL: process.env.REBYTE_API_URL, maxRetries: 0 })
const instructions = await readFile(new URL('../prompt.md', import.meta.url), 'utf8')
const agent = await client.beta.agents.create({ name: 'App Kit Agent', model: process.env.REBYTE_MODEL ?? 'gpt-5.6-luna', instructions })
console.log(`REBYTE_AGENT_ID=${agent.id}`)
