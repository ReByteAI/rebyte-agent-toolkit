import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createResponseState,
  reduceResponseState,
  type RebyteResponse,
  type ResponseStreamEvent,
} from '../src/index.js'

const response: RebyteResponse = {
  id: 'resp_1',
  object: 'response',
  created_at: 1,
  status: 'completed',
  background: false,
  completed_at: 1,
  model: 'agent-1',
  output_text: 'Hello',
  previous_response_id: null,
  error: null,
  incomplete_details: null,
  instructions: null,
  max_output_tokens: null,
  metadata: {},
  parallel_tool_calls: true,
  reasoning: null,
  store: true,
  temperature: null,
  text: { format: { type: 'text' } },
  tool_choice: 'auto',
  tools: [],
  top_p: null,
  truncation: 'disabled',
  usage: null,
  conversation: { id: 'conv_1' },
  output: [{
    id: 'mcp_1',
    type: 'mcp_call',
    server_label: 'sandbox',
    name: 'run_command',
    arguments: '{"cmd":"echo hi"}',
    output: 'hi',
    error: null,
    status: 'completed',
  }],
}

test('folds text deltas and MCP output into a completed immutable state', () => {
  const events: ResponseStreamEvent[] = [
    { type: 'response.created', sequence_number: 0, response: { ...response, status: 'in_progress', output: [], output_text: '' } },
    { type: 'response.output_text.delta', sequence_number: 1, item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Hel' },
    { type: 'response.output_text.delta', sequence_number: 2, item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'lo' },
    { type: 'response.completed', sequence_number: 3, response },
  ]
  const initial = createResponseState()
  const final = events.reduce(reduceResponseState, initial)
  assert.equal(initial.status, 'idle')
  assert.equal(final.status, 'completed')
  assert.equal(final.outputText, 'Hello')
  assert.equal(final.toolCalls[0]?.name, 'run_command')
  assert.equal(final.events.length, 4)
})
