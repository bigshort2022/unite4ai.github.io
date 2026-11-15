import type { ChatMessage } from './gsm8k.ts';

export interface Completion {
  text: string;
  /** Milliseconds until the first content token; null when the reply was empty. */
  ttftMs: number | null;
  seconds: number;
  /** From the stream's usage chunk; null when the server does not send one. */
  completionTokens: number | null;
}

export async function listModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`GET /models → ${response.status}`);
  const body = (await response.json()) as { data?: { id?: unknown }[] };
  return (body.data ?? []).map((model) => model?.id).filter((id): id is string => typeof id === 'string' && id !== '');
}

/** Yields the payload of every `data:` line in a server-sent event stream. */
async function* dataPayloads(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() as string;
    for (const line of lines) {
      if (line.trim().startsWith('data:')) yield line.trim().slice(5).trim();
    }
  }
  // A server may close the stream without a newline after its last line.
  const last = (buffer + decoder.decode()).trim();
  if (last.startsWith('data:')) yield last.slice(5).trim();
}

/**
 * One streamed chat completion at temperature 0. Throws when the server reports an error inside
 * the stream or the stream ends without a finish_reason or `[DONE]`, so a failed or partial
 * reply is never scored.
 */
export async function streamChat(request: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs: number;
}): Promise<Completion> {
  const started = performance.now();
  const response = await fetch(`${request.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(request.timeoutMs),
  });
  if (!response.ok || !response.body) {
    throw new Error(`POST /chat/completions → ${response.status} ${(await response.text()).slice(0, 200)}`);
  }

  let text = '';
  let ttftMs: number | null = null;
  let completionTokens: number | null = null;
  let finished = false;
  for await (const payload of dataPayloads(response.body)) {
    if (payload === '') continue;
    if (payload === '[DONE]') {
      finished = true;
      continue;
    }
    const event = JSON.parse(payload) as {
      choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[];
      usage?: { completion_tokens?: unknown };
      error?: unknown;
    };
    if (event.error != null) {
      const detail = typeof event.error === 'object' && 'message' in event.error ? event.error.message : event.error;
      throw new Error(`server error in stream: ${typeof detail === 'string' ? detail : JSON.stringify(event.error)}`);
    }
    const choice = event.choices?.[0];
    if (choice?.finish_reason != null) finished = true;
    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta !== '') {
      if (ttftMs === null) ttftMs = performance.now() - started;
      text += delta;
    }
    if (typeof event.usage?.completion_tokens === 'number') completionTokens = event.usage.completion_tokens;
  }
  if (!finished) throw new Error('stream ended before the reply was complete');
  return { text, ttftMs, seconds: (performance.now() - started) / 1000, completionTokens };
}
