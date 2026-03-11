export const API_DEFAULTS = {
  port: 3001,
  host: '0.0.0.0',
  corsOrigin: 'http://localhost:5173',
} as const;

export const SIMULATION_DEFAULTS = {
  dt: 0.001,
  duration: 1.0,
  seed: 42,
  reportInterval: 10,
  checkpointInterval: 100,
  maxSteps: 1_000_000,
} as const;

export const TELEMETRY_CHANNELS = {
  runEvents: (runId: string) => `brainforge:run:${runId}:events`,
  runMetrics: (runId: string) => `brainforge:run:${runId}:metrics`,
  jobQueue: 'brainforge:jobs:simulation',
} as const;

export const STORAGE_PATHS = {
  datasets: (datasetId: string) => `datasets/${datasetId}`,
  runs: (runId: string) => `runs/${runId}`,
  traces: (runId: string) => `runs/${runId}/traces`,
  checkpoints: (runId: string) => `runs/${runId}/checkpoints`,
  artifacts: (runId: string) => `runs/${runId}/artifacts`,
} as const;
