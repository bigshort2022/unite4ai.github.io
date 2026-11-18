import { getCollection } from 'astro:content';
import { buildExchangeFeeds } from '@unite4ai/core/exchange';
import { readExchangeRecords } from '@unite4ai/core/read-exchange';

/** No endpoint can publish records until the same raw-file and relationship gate has passed. */
export async function loadExchange() {
  const [hypotheses, models, benchmarks, results] = await Promise.all([
    getCollection('hypotheses'), getCollection('models'), getCollection('benchmarks'), getCollection('evals'),
    // Force both mirrored JSON schemas to participate in Astro's content contract too.
    getCollection('findings'), getCollection('reviews'),
  ]);
  const hypothesisData = new Map(hypotheses.map(({ id, data }) => [id, data]));
  const { records, errors } = await readExchangeRecords(
    process.env.U4AI_EXCHANGE_DIR || './src/content',
    (_frontmatter, id) => hypothesisData.get(id),
  );
  if (errors.length) throw new Error(`Invalid exchange files:\n${errors.join('\n')}`);
  return buildExchangeFeeds(records, {
    models: new Set(models.map(({ id }) => id)),
    benchmarks: new Map(benchmarks.map(({ id, data }) => [id, data])),
    results: new Map(results.map(({ id, data }) => [id, data])),
  });
}
