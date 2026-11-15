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

/** One streamed chat completion at temperature 0. */
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
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '' || payload === '[DONE]') continue;
      const event = JSON.parse(payload) as {
        choices?: { delta?: { content?: unknown } }[];
        usage?: { completion_tokens?: unknown };
      };
      const delta = event.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta !== '') {
        if (ttftMs === null) ttftMs = performance.now() - started;
        text += delta;
      }
      if (typeof event.usage?.completion_tokens === 'number') completionTokens = event.usage.completion_tokens;
    }
  }
  return { text, ttftMs, seconds: (performance.now() - started) / 1000, completionTokens };
}
