import {
  AgentTransportError,
  parseResponseEventStream,
  type ResponseStreamEvent,
} from './responses.js'

export interface AgentTransportRequest {
  input: string | AgentChatInput
  conversationId: string | null
  signal: AbortSignal
}

export interface AgentAttachment {
  fileId: string
  filename: string
  contentType: string
  size: number
  inputType: 'input_file' | 'input_image'
}

export interface AgentChatInput {
  text: string
  attachments: AgentAttachment[]
}

export interface AgentUploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface AgentTransport {
  stream(request: AgentTransportRequest): Promise<AsyncIterable<ResponseStreamEvent>>
  interrupt(conversationId: string): Promise<void>
  upload?: (
    file: File,
    onProgress?: (progress: AgentUploadProgress) => void,
  ) => Promise<AgentAttachment>
}

export interface FetchTransportOptions {
  url: string
  interruptUrl: string
  fileUrl?: string
  fetch?: typeof globalThis.fetch
  headers?: Record<string, string> | (() => Promise<Record<string, string>> | Record<string, string>)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function fetchError(response: Response): Promise<AgentTransportError> {
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Preserve text responses from an application proxy.
  }
  const record = isRecord(body) ? body : null
  const nested = record && isRecord(record.error) ? record.error : null
  const message = nested && typeof nested.message === 'string'
    ? nested.message
    : record && typeof record.message === 'string'
      ? record.message
      : text.trim() || `HTTP ${response.status}`
  const code = nested && typeof nested.code === 'string' ? nested.code : null
  return new AgentTransportError(response.status, message, code, body)
}

function responseInput(input: string | AgentChatInput): unknown {
  if (typeof input === 'string') return input
  const text = input.text.trim()
  if (!text && input.attachments.length === 0) throw new Error('input is required')
  if (input.attachments.length === 0) return text

  const content: Array<Record<string, unknown>> = []
  if (text) content.push({ type: 'input_text', text })
  for (const attachment of input.attachments) {
    if (attachment.inputType === 'input_image') {
      content.push({
        type: 'input_image',
        file_id: attachment.fileId,
        detail: 'auto',
      })
    } else {
      content.push({ type: 'input_file', file_id: attachment.fileId })
    }
  }
  return [{ type: 'message', role: 'user', content }]
}

interface AppFileUpload {
  id: string
  filename: string
  maxFileSize: number
}

function appFileUpload(value: unknown): AppFileUpload {
  if (!isRecord(value)) throw new Error('App file endpoint returned a non-object response')
  const id = value.id
  const filename = value.filename
  const maxFileSize = value.maxFileSize
  if (typeof id !== 'string' || !id) throw new Error('App file endpoint returned no file ID')
  if (typeof filename !== 'string' || !filename) throw new Error('App file endpoint returned no filename')
  if (typeof maxFileSize !== 'number' || maxFileSize <= 0) {
    throw new Error('App file endpoint returned no maximum file size')
  }
  return { id, filename, maxFileSize }
}

function uploadThroughAppServer(
  url: string,
  file: File,
  contentType: string,
  headers: Record<string, string>,
  onProgress?: (progress: AgentUploadProgress) => void,
): Promise<AppFileUpload> {
  if (typeof XMLHttpRequest === 'undefined') {
    throw new Error('File upload requires a browser XMLHttpRequest implementation')
  }
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const separator = url.includes('?') ? '&' : '?'
    request.open('POST', `${url}${separator}filename=${encodeURIComponent(file.name)}`)
    request.setRequestHeader('Content-Type', contentType)
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() !== 'content-type') request.setRequestHeader(name, value)
    }
    request.upload.addEventListener('progress', (event) => {
      if (!onProgress || !event.lengthComputable) return
      onProgress({
        loaded: event.loaded,
        total: event.total,
        percent: Math.min(99, Math.round((event.loaded / event.total) * 100)),
      })
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        if (onProgress) onProgress({ loaded: file.size, total: file.size, percent: 100 })
        let value: unknown
        try {
          value = JSON.parse(request.responseText)
        } catch {
          reject(new Error('App file endpoint returned invalid JSON'))
          return
        }
        resolve(appFileUpload(value))
        return
      }
      let message = `File upload failed with HTTP ${request.status}`
      try {
        const value: unknown = JSON.parse(request.responseText)
        const record = isRecord(value) ? value : null
        const error = record && isRecord(record.error) ? record.error : null
        if (error && typeof error.message === 'string') message = error.message
      } catch {
        // Preserve the HTTP status when the app endpoint did not return JSON.
      }
      reject(new Error(message))
    })
    request.addEventListener('error', () => reject(new Error('File upload failed')))
    request.addEventListener('abort', () => reject(new Error('File upload was cancelled')))
    request.send(file)
  })
}

/**
 * Browser-safe transport. It calls the application's own endpoint, which is responsible
 * for authenticating the user and forwarding the Responses SSE stream from Rebyte.
 */
export function createFetchTransport(options: FetchTransportOptions): AgentTransport {
  if (!options.url) throw new Error('url is required')
  if (!options.interruptUrl) throw new Error('interruptUrl is required')
  const doFetch = options.fetch ?? globalThis.fetch
  if (!doFetch) throw new Error('No fetch implementation is available')
  const fileUrl = options.fileUrl

  return {
    async stream(request) {
      const extraHeaders = typeof options.headers === 'function'
        ? await options.headers()
        : options.headers ?? {}
      const response = await doFetch(options.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...extraHeaders,
        },
        body: JSON.stringify({
          input: responseInput(request.input),
          ...(request.conversationId
            ? { conversation: request.conversationId }
            : {}),
        }),
        signal: request.signal,
      })
      if (!response.ok) throw await fetchError(response)
      if (!response.body) throw new Error('Application response stream has no body')
      return parseResponseEventStream(response.body)
    },
    async interrupt(conversationId) {
      const extraHeaders = typeof options.headers === 'function'
        ? await options.headers()
        : options.headers ?? {}
      const response = await doFetch(options.interruptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({ conversation: conversationId }),
      })
      if (!response.ok) throw await fetchError(response)
    },
    ...(fileUrl ? {
      async upload(file, onProgress) {
        const extraHeaders = typeof options.headers === 'function'
          ? await options.headers()
          : options.headers ?? {}
        const contentType = file.type.trim() ? file.type : 'application/octet-stream'
        const maxFileSize = 200 * 1024 * 1024
        if (file.size > maxFileSize) {
          throw new AgentTransportError(
            413,
            `File exceeds the ${maxFileSize}-byte upload limit`,
            'file_too_large',
            null,
          )
        }
        const upload = await uploadThroughAppServer(
          fileUrl,
          file,
          contentType,
          extraHeaders,
          onProgress,
        )
        if (file.size > upload.maxFileSize) {
          throw new Error('App file endpoint accepted a file larger than its advertised limit')
        }
        return {
          fileId: upload.id,
          filename: upload.filename,
          contentType,
          size: file.size,
          inputType: contentType.startsWith('image/') ? 'input_image' : 'input_file',
        }
      },
    } : {}),
  }
}
