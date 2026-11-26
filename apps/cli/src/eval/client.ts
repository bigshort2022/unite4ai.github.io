import { containsApiKey, type ApprovedApiEndpoint } from './api.ts';
import type { ChatMessage } from './gsm8k.ts';

export interface Completion {
  /** The visible reply: content only, without any reasoning the server streams separately. */
  text: string;
  /** Milliseconds until the first generated token, reasoning included; null when nothing was generated. */
  ttftMs: number | null;
  seconds: number;
  /** From the stream's usage chunk; null when the server does not send one. */
  completionTokens: number | null;
  /** From the stream's usage chunk; null when the server does not send one. */
  promptTokens: number | null;
  /** Why the server stopped, e.g. "stop" or "length"; null when it sent only `[DONE]`. */
  finishReason: string | null;
}

/** Endpoint location without userinfo, query or fragment, for text that is published. */
export function publicBaseUrl(url: string): string {
  const parsed = new URL(url);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.href.replace(/\/$/, '');
}

export async function listModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`GET /models → ${response.status}`);
  const body = (await response.json()) as { data?: { id?: unknown }[] };
  return (body.data ?? []).map((model) => model?.id).filter((id): id is string => typeof id === 'string' && id !== '');
}

/**
 * What an omp-managed server reports at `/_omp/status`: the one model it has loaded and how
 * many requests it is serving. Null from every other server (plain mlx-lm and Ollama have no
 * such route) and whenever the answer is not that shape.
 */
export async function serverStatus(baseUrl: string): Promise<{ model: string; activeRequests: number } | null> {
  try {
    const response = await fetch(new URL('/_omp/status', baseUrl), { signal: AbortSignal.timeout(2_000) });
    if (response.status !== 200) return null;
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    if (!('version' in body) || body.version !== 1) return null;
    if (!('model' in body) || typeof body.model !== 'string') return null;
    if (!('active_requests' in body) || typeof body.active_requests !== 'number') return null;
    return { model: body.model, activeRequests: body.active_requests };
  } catch {
    return null;
  }
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

export type ChatRequest = (
  | { api?: never; baseUrl: string; model: string }
  | { api: ApprovedApiEndpoint; baseUrl?: never; model?: never }
) & {
  messages: ChatMessage[];
  maxTokens: number;
  /** Limit for the whole request, from sending it to the end of the reply. */
  timeoutMs: number;
  /**
   * The sampling of a repeat-run benchmark. Absent: temperature 0 and nothing else, the
   * single-run method, so a single-run request is unchanged.
   */
  sampling?: { temperature: number; topP: number; seed: number };
};

/** Its message is ours, not a provider payload or an exception from fetch/parser internals. */
class SafeApiError extends Error {}

const isTokenCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

/**
 * One streamed chat completion, at temperature 0 unless the request carries sampling. Throws
 * when the server reports an error inside the stream, the stream ends without a finish_reason
 * or `[DONE]`, or the reply is not complete within the timeout, so a failed or partial reply is
 * never scored.
 */
export async function streamChat(request: ChatRequest): Promise<Completion> {
  const signal = AbortSignal.timeout(request.timeoutMs);
  try {
    return await readCompletion(request, signal);
  } catch (error) {
    // The abort surfaces as a bare "The operation timed out."; say which limit was hit.
    if (signal.aborted) throw new Error(`request timed out after ${request.timeoutMs} ms`);
    if (request.api !== undefined && !(error instanceof SafeApiError)) throw new Error('authenticated request failed');
    throw error;
  }
}

async function readCompletion(request: ChatRequest, signal: AbortSignal): Promise<Completion> {
  const started = performance.now();
  const { api } = request;
  const response = await fetch(api?.completionUrl ?? `${request.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(api === undefined ? {} : { authorization: `Bearer ${api.key}` }),
    },
    ...(api === undefined ? {} : { redirect: 'error' as const }),
    body: JSON.stringify({
      model: api?.servedModel ?? request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      ...(request.sampling === undefined
        ? { temperature: 0 }
        : { temperature: request.sampling.temperature, top_p: request.sampling.topP, seed: request.sampling.seed }),
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    if (api !== undefined) {
      try {
        await response.body?.cancel();
      } catch {
        // Do not surface a provider response or transport error from discarding the body.
      }
      throw new SafeApiError(`POST /chat/completions → ${response.status}`);
    }
    throw new Error(`POST /chat/completions → ${response.status} ${(await response.text()).slice(0, 200)}`);
  }

  let text = '';
  let ttftMs: number | null = null;
  let completionTokens: number | null = null;
  let promptTokens: number | null = null;
  let finishReason: string | null = null;
  let finished = false;
  for await (const payload of dataPayloads(response.body)) {
    if (payload === '') continue;
    if (payload === '[DONE]') {
      finished = true;
      if (api !== undefined) break;
      continue;
    }
    const event = JSON.parse(payload) as {
      choices?: { delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown }; finish_reason?: unknown }[];
      usage?: { completion_tokens?: unknown; prompt_tokens?: unknown };
      error?: unknown;
    };
    if (event.error != null) {
      if (api !== undefined) throw new SafeApiError('provider returned an error event');
      const detail = typeof event.error === 'object' && 'message' in event.error ? event.error.message : event.error;
      throw new Error(`server error in stream: ${typeof detail === 'string' ? detail : JSON.stringify(event.error)}`);
    }
    const choice = event.choices?.[0];
    if (choice?.finish_reason != null) finished = true;
    if (typeof choice?.finish_reason === 'string') {
      if (api !== undefined && containsApiKey(choice.finish_reason, api.key)) {
        throw new SafeApiError('provider reply contained the API key');
      }
      finishReason = choice.finish_reason;
    }
    // Servers stream a model's reasoning under either name; it is generated output, so it
    // starts the clock, but only content is the reply.
    const delta = choice?.delta;
    const generated = [delta?.content, delta?.reasoning, delta?.reasoning_content];
    if (ttftMs === null && generated.some((part) => typeof part === 'string' && part !== '')) {
      ttftMs = performance.now() - started;
    }
    if (typeof delta?.content === 'string') text += delta.content;
    if (typeof event.usage?.completion_tokens === 'number') {
      completionTokens = api === undefined || isTokenCount(event.usage.completion_tokens) ? event.usage.completion_tokens : null;
    }
    if (typeof event.usage?.prompt_tokens === 'number') {
      promptTokens = api === undefined || isTokenCount(event.usage.prompt_tokens) ? event.usage.prompt_tokens : null;
    }
  }
  if (!finished) throw new SafeApiError('stream ended before the reply was complete');
  if (api !== undefined && containsApiKey(text, api.key)) throw new SafeApiError('provider reply contained the API key');
  return { text, ttftMs, seconds: (performance.now() - started) / 1000, completionTokens, promptTokens, finishReason };
}
