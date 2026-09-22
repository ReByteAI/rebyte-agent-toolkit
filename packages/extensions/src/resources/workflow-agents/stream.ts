import type { OpenAI } from 'openai/client';
import { APIError, OpenAIError } from 'openai/core/error';
import { Stream, _iterSSEMessages } from 'openai/core/streaming';


/** A tool failure is workflow data: the program can catch it and continue. */
export class WorkflowEventStream<Item> extends Stream<Item> {
  static override fromSSEResponse<Item>(
    response: Response, controller: AbortController, client?: OpenAI, synthesizeEventData?: boolean,
  ): Stream<Item> {
    let consumed = false;
    async function* iterator(): AsyncGenerator<Item> {
      if (consumed) throw new OpenAIError('Cannot iterate over a consumed stream, use `.tee()` to split the stream.');
      consumed = true;
      let done = false;
      const messages = _iterSSEMessages(response, controller);
      const close = messages.return.bind(messages);
      messages.return = (value) => { controller.abort(); return close(value); };
      try {
        for await (const sse of messages) {
          let data;
          try { data = JSON.parse(sse.data); }
          catch { throw new SyntaxError('Error reading response: malformed workflow event JSON.'); }
          if (sse.event === 'error') {
            throw new APIError(undefined, data?.error ?? data, undefined, response.headers);
          }
          yield synthesizeEventData ? { event: sse.event, data } as Item : data;
        }
        done = true;
      } catch (error) {
        if (!(error instanceof APIError) &&
          ((error instanceof Error && error.name === 'AbortError') || (controller.signal.aborted && error === controller.signal.reason))) return;
        throw error;
      } finally {
        if (!done) controller.abort();
      }
    }
    return new Stream(iterator, controller, client);
  }
}
