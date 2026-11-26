interface Topic {
  slug: string;
  title: string;
  summary: string;
  sections: { title: string; text: string }[];
  destination: string;
  destinationLabel: string;
}

export const stackTopics: Topic[] = [
  {
    slug: 'model-task-taxonomy', title: 'Model Task Taxonomy',
    summary: 'Describe the work before choosing a model or buying compute.',
    sections: [
      { title: 'Task families', text: 'Separate generation, classification, retrieval, embeddings, vision, speech, tool use and rendering. A task can combine families: retrieval followed by generation is not evaluated like retrieval alone. These are editorial categories, not additional registry schema values.' },
      { title: 'Define the contract', text: 'Record input format, output format, language, context size and an acceptance criterion. Classification needs a label set; retrieval needs a corpus and relevance measure; generation needs a rubric; tool use needs permitted actions and a stopping rule.' },
      { title: 'Select evidence', text: 'Compare results on the same task definition and benchmark version. A general leaderboard does not establish fitness for private data, a different language or a tool workflow. Check licence and deployment constraints before selecting a model.' },
    ], destination: '/registry', destinationLabel: 'Browse model and dataset cards',
  },
  {
    slug: 'observability', title: 'Observability',
    summary: 'Make runs explainable without leaking prompts, credentials or private data.',
    sections: [
      { title: 'Identify a run', text: 'Record a run identifier, model revision, runtime version, hardware, configuration and timestamps. Link the benchmark version and command so later comparisons can distinguish a model change from a setup change.' },
      { title: 'Measure the right units', text: 'Distinguish time to first output, total latency, throughput, token counts and resource utilization. Record concurrency and whether setup time is included. Label estimated cost separately from an invoice and include its currency and billing unit.' },
      { title: 'Keep evidence safely', text: 'Redact secrets and personal data before publishing logs. A transcript hash can identify an artifact without hosting the raw text; it does not prove that the measurement was honest. The evaluation pages show self-reported evidence, not live service monitoring.' },
    ], destination: '/evals', destinationLabel: 'Inspect published evaluation evidence',
  },
  {
    slug: 'targets', title: 'Targets',
    summary: 'Choose an execution environment that fits the task and its data constraints.',
    sections: [
      { title: 'Deployment choices', text: 'Local CPU or GPU execution keeps control on your machine. Edge deployment adds power and memory constraints. Private infrastructure, hosted inference and distributed compute trade operational work for external dependencies. These are deployment targets, not promised latency or quality targets.' },
      { title: 'Check compatibility', text: 'Match model memory, context length, runtime, accelerator support, storage and network needs to the target. Confirm whether an offer supplies a machine, a container, a managed endpoint or a completed task; they are not interchangeable products.' },
      { title: 'Set boundaries', text: 'Decide where inputs and outputs may be stored, who can access them, and what happens when capacity is interrupted. Check total cost, regional eligibility and external terms before sending data or purchasing resources.' },
    ], destination: '/stack/compute', destinationLabel: 'Browse compute resources',
  },
  {
    slug: 'model-layer', title: 'Model Layer',
    summary: 'Treat a model as a versioned collection of artifacts and permissions.',
    sections: [
      { title: 'Identify the artifacts', text: 'Record architecture, weight revision, tokenizer, configuration, adapters and source provenance. An identical display name does not establish identical weights. Pin artifact revisions and preserve checksums when a publisher supplies them.' },
      { title: 'Check rights and runtime', text: 'Read the actual licence and usage restrictions. Open weights do not necessarily mean open training data or unrestricted redistribution. Match tokenizer and chat template to the runtime; check context and tool-format compatibility.' },
      { title: 'Connect evaluations', text: 'An evaluation applies to the revision, precision, prompt and runtime that produced it. Use model cards to find those details rather than transferring a score to a different quantization or adapter without evidence.' },
    ], destination: '/registry', destinationLabel: 'Inspect model cards',
  },
  {
    slug: 'actuation', title: 'Actuation',
    summary: 'Treat every external side effect as an explicitly authorized action.',
    sections: [
      { title: 'Constrain tools', text: 'Give agents only the tools, destinations and data permissions needed for the task. Separate reading from writing, and separate generating a proposal from executing it. Retrieved text is data, not authority to change files, spend money or disclose secrets.' },
      { title: 'Authorize spending and changes', text: 'Set human-approved budgets, deadlines and scope before execution. Irreversible actions need explicit approval. Never publish credentials, wallet keys or signed mandates in public records. A directory listing grants no permission to buy a service.' },
      { title: 'Recover safely', text: 'Use idempotency keys and inspect external state before retrying uncertain actions. A timeout can occur after the action succeeded. Preserve action identifiers and reconcile outcomes instead of interpreting a missing response as a safe retry.' },
    ], destination: '/governance', destinationLabel: 'Read platform governance',
  },
  {
    slug: 'quantization', title: 'Quantization',
    summary: 'Compare precision choices using compatible artifacts and measured task quality.',
    sections: [
      { title: 'Precision is not a score', text: 'Quantization represents model values with fewer bits or a different numeric scheme. It can reduce storage and memory, but speed and quality depend on the method, hardware and runtime. A bit count alone does not establish equivalent behavior.' },
      { title: 'Check the full memory budget', text: 'Weights are only part of runtime memory. Include context-dependent cache, activations and runtime overhead. Confirm artifact format and supported kernels; a smaller file need not run faster on every target.' },
      { title: 'Evaluate the actual artifact', text: 'Record quantization, model revision, runtime, context and task configuration. Compare the same benchmark version under comparable conditions. Report measured quality and speed separately and retain the source command and evidence hash.' },
    ], destination: '/evals', destinationLabel: 'Compare measured evaluation results',
  },
  {
    slug: 'verification', title: 'Verification',
    summary: 'Separate artifact identity, reproducibility, authorization and useful task output.',
    sections: [
      { title: 'Know what a check proves', text: 'A hash identifies bytes against a reference; it does not prove safe code or a truthful claim. A signature ties data to a key, not necessarily a unique person. A reproducible command is useful evidence but requires independent execution to establish reproduction.' },
      { title: 'Evaluate outcomes', text: 'Record the benchmark version, metric, direction, prompt, setup and limitations. Compare evidence with the task acceptance criteria. Independent review is stronger than a provider assertion, but a different account is not proof of an independent organization.' },
      { title: 'Do not confuse settlement with delivery', text: 'A paid invoice, token transfer or funded stream proves a payment-related state, not correct compute output. Provider badges and directory inclusion are not guarantees of capacity, confidentiality or successful completion.' },
    ], destination: '/evals', destinationLabel: 'Inspect evaluation methods and results',
  },
  {
    slug: 'distributions', title: 'Distributions',
    summary: 'Package model artifacts and runtime requirements into reproducible bundles.',
    sections: [
      { title: 'Define the bundle', text: 'Here, a distribution is a model/runtime package, not a probability distribution. Its manifest identifies weights, tokenizer, configuration, adapters, runtime requirements and licences. Pin versions rather than depend on an unbounded latest tag.' },
      { title: 'Make setup reproducible', text: 'State supported operating systems, accelerator/runtime versions, memory needs and startup command. Separate downloaded artifacts from generated caches and document integrity checks against publisher references.' },
      { title: 'Preserve provenance', text: 'Keep upstream sources, modifications and redistribution rights visible. A bundle should link evaluations of its actual configuration, not inherit a different artifact score. Inspect installation instructions before executing downloaded code.' },
    ], destination: '/registry', destinationLabel: 'Find artifact and provenance records',
  },
  {
    slug: 'distribution', title: 'Distribution',
    summary: 'Publish and deliver artifacts without confusing discovery with hosting.',
    sections: [
      { title: 'Choose a delivery channel', text: 'A registry card describes a model; a repository release, artifact host or mirror delivers its files. Keep canonical sources and versions explicit. This page concerns publishing channels, while Distributions concerns what is inside a bundle.' },
      { title: 'Publish usable references', text: 'Include a licence, source revision, download location, file format, size and integrity reference where available. A mirror should preserve provenance and name any modifications rather than silently replace upstream files.' },
      { title: 'Correct records transparently', text: 'Use reviewed contributions for registry changes and document moved or withdrawn sources. Do not invent licences, evaluation results or availability claims. Users remain responsible for checking external hosts and the rights attached to downloaded artifacts.' },
    ], destination: '/contribute', destinationLabel: 'Read contribution instructions',
  },
];
