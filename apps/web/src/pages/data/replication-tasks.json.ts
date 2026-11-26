import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { exportJson } from '../../lib/eval-exports';
import { BFCL_BENCHMARK_ID, BFCL_REFERENCE_ID, bfclReplicationTask } from '../../lib/replication-task';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [benchmark, result] = await Promise.all([
    getEntry('benchmarks', BFCL_BENCHMARK_ID),
    getEntry('evals', BFCL_REFERENCE_ID),
  ]);
  const task = bfclReplicationTask(BFCL_BENCHMARK_ID, benchmark?.data, result && { id: result.id, ...result.data });
  return exportJson({
    schema_version: 1,
    notice: 'Read-only task listing. Not approval, assignment, availability, payment, or evidence of completed replication.',
    tasks: task ? [task] : [],
  });
};
