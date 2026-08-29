export class RebyteAPIError extends Error {
  readonly status: number
  readonly code: string | null
  readonly body: unknown

  constructor(status: number, message: string, code: string | null, body: unknown) {
    super(message)
    this.name = 'RebyteAPIError'
    this.status = status
    this.code = code
    this.body = body
  }
}
