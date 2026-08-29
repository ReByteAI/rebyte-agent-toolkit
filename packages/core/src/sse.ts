import type { ResponseStreamEvent } from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export async function* parseResponseEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ResponseStreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []

  const flush = (): ResponseStreamEvent | '[DONE]' | null => {
    if (dataLines.length === 0) return null
    const raw = dataLines.join('\n')
    dataLines = []
    if (raw === '[DONE]') return '[DONE]'
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('Responses stream emitted invalid JSON')
    }
    if (!isRecord(value) || typeof value.type !== 'string') {
      throw new Error('Responses stream emitted an event without a type')
    }
    if (typeof value.sequence_number !== 'number') {
      throw new Error(`Responses event ${value.type} has no sequence_number`)
    }
    return value as ResponseStreamEvent
  }

  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const rawLine = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line === '') {
        const event = flush()
        if (event === '[DONE]') return
        if (event) yield event
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const fieldValue = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'data') dataLines.push(fieldValue)
      }
      newline = buffer.indexOf('\n')
    }
    if (done) break
  }

  if (buffer.length > 0) {
    const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  const event = flush()
  if (event && event !== '[DONE]') yield event
}
