const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”' };

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\\([\\`*_{}[\]()#+\-.!$~])/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Visible text of a fetched page: tags and scripts removed for HTML, markdown kept as text. */
export function pageText(body: string, contentType: string): string {
  if (!/html/i.test(contentType)) return body;
  return body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ');
}

/** True when the whole quote appears in the page after whitespace and formatting normalization. */
export function quotePresent(body: string, contentType: string, quote: string): boolean {
  return normalize(pageText(body, contentType)).includes(normalize(quote));
}

/** A link that opens the page and highlights the start of the quote (Chrome, Edge, Safari). */
export function highlightUrl(url: string, quote: string): string {
  const start = normalize(quote).split(' ').slice(0, 10).join(' ');
  return `${url.split('#')[0]}#:~:text=${encodeURIComponent(start).replace(/-/g, '%2D')}`;
}

export interface PassiveObservation {
  url: string;
  tls: { authorized: boolean; validTo: string; subjectAltNames: string[] } | null;
  headers: Record<string, string> | null;
  securityTxt: boolean | null;
}
export type PassiveOutcome = 'pass' | 'fail' | 'unknown';

function hostMatches(host: string, san: string): boolean {
  const name = san.replace(/^DNS:/, '').toLowerCase();
  if (name.startsWith('*.')) {
    const rest = host.slice(host.indexOf('.') + 1);
    return host.includes('.') && rest === name.slice(2);
  }
  return host === name;
}

/** Evaluates passive observations for three security criteria. Only collected evidence produces pass or fail. */
export function evaluatePassive(o: PassiveObservation, now: Date): Record<'https-certificate' | 'security-headers' | 'security-contact', PassiveOutcome> {
  const host = new URL(o.url).hostname.toLowerCase();
  const certificate: PassiveOutcome = o.tls === null ? 'unknown'
    : o.tls.authorized && new Date(o.tls.validTo) > now && o.tls.subjectAltNames.some((s) => hostMatches(host, s)) ? 'pass' : 'fail';
  const h = o.headers;
  const headers: PassiveOutcome = h === null ? 'unknown'
    : h['strict-transport-security'] && (h['content-security-policy'] || h['x-content-type-options']) ? 'pass' : 'fail';
  // A missing security.txt does not prove there is no disclosure policy; researchers decide that from the docs.
  const contact: PassiveOutcome = o.securityTxt === true ? 'pass' : 'unknown';
  return { 'https-certificate': certificate, 'security-headers': headers, 'security-contact': contact };
}
