import { byCodeUnit, deviceKey, type EvalRun } from './evals.ts';

export type ReplicationRelationship = 'consistent' | 'inconsistent' | 'repeated_on_other_hardware';

export interface ReplicationEvidence {
  independent_replicators: number;
  contested: boolean;
  peers: { result: string; relationship: ReplicationRelationship }[];
}

type RepeatRun = EvalRun & { repeat: NonNullable<EvalRun['repeat']> };
type Candidate = { run: RepeatRun; evidence: ReplicationEvidence; device: string | undefined; consistentSubmitters?: Set<string> };

function cohortKey(run: RepeatRun): string | undefined {
  const { runtime, format, quantization, served_model } = run.setup;
  // Historical definitions are no longer available to validate these method fields.
  const { runs, temperature, top_p } = run.repeat;
  const identity: (string | number | null)[] = [
    run.benchmark, run.benchmark_version, run.model, format, quantization, run.n, runs, temperature, top_p,
  ];
  if (runtime !== 'api') return JSON.stringify(identity);
  if (run.api === undefined || served_model === undefined) return undefined;
  identity.push(run.api.provider, served_model, run.api.model_card ?? null);
  return JSON.stringify(identity);
}

function overlaps([low, high]: readonly [number, number], [otherLow, otherHigh]: readonly [number, number]): boolean {
  return low <= otherHigh && otherLow <= high;
}

function relationship({ run: a, device }: Candidate, { run: b, device: otherDevice }: Candidate): ReplicationRelationship | undefined {
  if (a.run.submitter !== b.run.submitter) {
    return overlaps(a.repeat.pass_1_ci, b.repeat.pass_1_ci) && overlaps(a.repeat.pass_k_ci, b.repeat.pass_k_ci)
      ? 'consistent' : 'inconsistent';
  }
  if (device === undefined) return undefined;
  const hardware = a.setup.hardware;
  const other = b.setup.hardware;
  if (device !== otherDevice || hardware.accelerator !== other.accelerator || hardware.memory_gb !== other.memory_gb) {
    return 'repeated_on_other_hardware';
  }
  return undefined;
}

function addPeer(candidate: Candidate, peer: RepeatRun, relation: ReplicationRelationship) {
  candidate.evidence.peers.push({ result: peer.id, relationship: relation });
  if (relation === 'consistent') (candidate.consistentSubmitters ??= new Set()).add(peer.run.submitter);
  if (relation === 'inconsistent') candidate.evidence.contested = true;
}

/**
 * Per-result evidence from scored runs. Compare each pair within an exact cohort once; keep
 * every eligible peer in result ID order but count each consistent submitter only once.
 */
export function buildReplicationIndex(runs: readonly EvalRun[]): ReadonlyMap<string, ReplicationEvidence> {
  const index = new Map<string, ReplicationEvidence>();
  const cohorts = new Map<string, Candidate[]>();
  const repeated = runs.filter((run): run is RepeatRun => run.repeat !== undefined)
    .sort((a, b) => byCodeUnit(a.id, b.id));
  for (const run of repeated) {
    const evidence: ReplicationEvidence = { independent_replicators: 0, contested: false, peers: [] };
    index.set(run.id, evidence);
    const key = cohortKey(run);
    if (key === undefined) continue;
    const device = run.setup.runtime === 'api' ? undefined : deviceKey(run.setup.hardware.device);
    const candidate = { run, evidence, device };
    const cohort = cohorts.get(key);
    if (cohort === undefined) cohorts.set(key, [candidate]);
    else cohort.push(candidate);
  }
  for (const cohort of cohorts.values()) {
    for (let i = 0; i < cohort.length; i++) {
      const a = cohort[i];
      for (let j = i + 1; j < cohort.length; j++) {
        const b = cohort[j];
        const relation = relationship(a, b);
        if (relation === undefined) continue;
        addPeer(a, b.run, relation);
        addPeer(b, a.run, relation);
      }
      a.evidence.independent_replicators = a.consistentSubmitters?.size ?? 0;
    }
  }
  return index;
}
