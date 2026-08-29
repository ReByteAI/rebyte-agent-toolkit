import { parseResponseEventStream } from './sse.js'
import type { RebyteResponse, ResponseStreamEvent } from './types.js'

export type ResponseEventListener = (event: ResponseStreamEvent) => void

function terminalResponse(event: ResponseStreamEvent): RebyteResponse | null {
  if (event.type !== 'response.completed' && event.type !== 'response.failed') return null
  const response = event.response
  if (typeof response !== 'object' || response === null) {
    throw new Error(`${event.type} did not include a Response object`)
  }
  return response as RebyteResponse
}

export class ResponseStream implements AsyncIterable<ResponseStreamEvent> {
  readonly response: globalThis.Response
  private consumed = false
  private listeners: ResponseEventListener[] = []
  private resolveFinal!: (response: RebyteResponse) => void
  private rejectFinal!: (error: unknown) => void
  private readonly finalPromise: Promise<RebyteResponse>

  constructor(response: globalThis.Response) {
    this.response = response
    this.finalPromise = new Promise<RebyteResponse>((resolve, reject) => {
      this.resolveFinal = resolve
      this.rejectFinal = reject
    })
    void this.finalPromise.catch(() => undefined)
  }

  tap(listener: ResponseEventListener): this {
    this.listeners.push(listener)
    return this
  }

  [Symbol.asyncIterator](): AsyncIterator<ResponseStreamEvent> {
    if (this.consumed) throw new Error('A ResponseStream can only be consumed once')
    this.consumed = true
    return this.iterate()
  }

  async finalResponse(): Promise<RebyteResponse> {
    if (!this.consumed) {
      void this.drain()
    }
    return this.finalPromise
  }

  private async drain(): Promise<void> {
    try {
      for await (const _event of this) {
        // Intentionally consume until the terminal event.
      }
    } catch {
      // iterate() rejects finalPromise with the original error.
    }
  }

  private async *iterate(): AsyncGenerator<ResponseStreamEvent> {
    const body = this.response.body
    if (!body) {
      const error = new Error('Responses stream has no body')
      this.rejectFinal(error)
      throw error
    }
    let final: RebyteResponse | null = null
    try {
      for await (const event of parseResponseEventStream(body)) {
        for (const listener of this.listeners) listener(event)
        if (event.type === 'error') {
          const message = typeof event.message === 'string'
            ? event.message
            : 'Responses stream failed'
          throw new Error(message)
        }
        const terminal = terminalResponse(event)
        if (terminal) final = terminal
        yield event
      }
      if (!final) throw new Error('Responses stream ended without a terminal event')
      this.resolveFinal(final)
    } catch (error) {
      this.rejectFinal(error)
      throw error
    }
  }
}
