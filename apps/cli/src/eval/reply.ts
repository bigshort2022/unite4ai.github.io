/**
 * The reply with the model's reasoning removed: `<think>…</think>` blocks, everything up to a
 * closing tag that has no opener (some servers stream the reasoning and then only the closing
 * tag), and everything from an opener that is never closed (the reply ran out of tokens
 * mid-thought).
 */
export function visibleReply(reply: string): string {
  return reply
    .replace(/<think>[\s\S]*?<\/think>/g, ' ')
    .replace(/^[\s\S]*<\/think>/, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();
}
