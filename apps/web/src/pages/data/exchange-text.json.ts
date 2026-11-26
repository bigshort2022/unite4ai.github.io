import type { APIRoute } from 'astro';
import { loadExchange } from '../../lib/exchange';

export const GET: APIRoute = async () => {
  const { text } = await loadExchange();
  return new Response(JSON.stringify(text), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
