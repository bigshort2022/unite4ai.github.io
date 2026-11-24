import type { APIRoute } from 'astro';
import { renderAgentIndex } from '../lib/ax-index.mjs';

export const prerender = true;
export const GET: APIRoute = ({ site, url }) => new Response(renderAgentIndex(site ?? url, import.meta.env.BASE_URL), {
  headers: { 'content-type': 'text/plain; charset=utf-8' },
});
