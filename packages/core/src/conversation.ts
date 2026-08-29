import type { Rebyte } from './client.js'
import type { ResponseStream } from './stream.js'
import type {
  ConversationCreateParams,
  ConversationSnapshot,
  RebyteResponse,
  RequestOptions,
  ResponseInput,
} from './types.js'

export class RebyteConversation {
  readonly model: string
  private previousResponseId: string | null

  constructor(
    private readonly client: Rebyte,
    options: { model: string; previousResponseId?: string },
  ) {
    if (!options.model) throw new Error('model is required')
    this.model = options.model
    this.previousResponseId = options.previousResponseId ?? null
  }

  snapshot(): ConversationSnapshot {
    return { model: this.model, previousResponseId: this.previousResponseId }
  }

  async send(
    input: ResponseInput,
    params: ConversationCreateParams = {},
    options?: RequestOptions,
  ): Promise<RebyteResponse> {
    const response = await this.client.responses.create({
      ...params,
      model: this.model,
      input,
      ...(this.previousResponseId
        ? { previous_response_id: this.previousResponseId }
        : {}),
    }, options)
    if (response.status === 'completed') this.previousResponseId = response.id
    return response
  }

  async stream(
    input: ResponseInput,
    params: ConversationCreateParams = {},
    options?: RequestOptions,
  ): Promise<ResponseStream> {
    const stream = await this.client.responses.create({
      ...params,
      model: this.model,
      input,
      stream: true,
      ...(this.previousResponseId
        ? { previous_response_id: this.previousResponseId }
        : {}),
    }, options)
    stream.tap((event) => {
      if (event.type !== 'response.completed') return
      const response = event.response as RebyteResponse
      this.previousResponseId = response.id
    })
    return stream
  }
}
