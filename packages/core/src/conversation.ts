import type { Rebyte } from './client.js'
import type { ResponseStream } from './stream.js'
import type {
  ConversationCreateParams,
  RebyteResponse,
  RequestOptions,
  ResponseInput,
} from './types.js'

export class RebyteConversation {
  readonly model: string
  private conversationId: string | null

  constructor(
    private readonly client: Rebyte,
    options: { model: string; id?: string },
  ) {
    if (!options.model) throw new Error('model is required')
    this.model = options.model
    this.conversationId = options.id ?? null
  }

  get id(): string | null {
    return this.conversationId
  }

  private bind(response: RebyteResponse): void {
    const id = response.conversation.id
    if (!id) throw new Error('Response did not include a Conversation id')
    if (this.conversationId !== null && this.conversationId !== id) {
      throw new Error(`Response moved from Conversation ${this.conversationId} to ${id}`)
    }
    this.conversationId = id
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
      ...(this.conversationId
        ? { conversation: this.conversationId }
        : {}),
    }, options)
    this.bind(response)
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
      ...(this.conversationId
        ? { conversation: this.conversationId }
        : {}),
    }, options)
    stream.tap((event) => {
      if (typeof event.response !== 'object' || event.response === null) return
      this.bind(event.response as RebyteResponse)
    })
    return stream
  }
}
