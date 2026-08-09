/**
 * Shapes the API actually returns over the wire.
 *
 * These deliberately differ from the `@brainforge/contracts` schemas: those
 * describe the idealised domain model, while the API serialises Prisma rows.
 * Concretely — regions expose flat `coordX/Y/Z` rather than a nested
 * `coordinates` object, nullable columns come back as `null` rather than
 * `undefined`, dates are ISO strings, and list endpoints attach `_count`.
 *
 * Enum-like unions and the experiment config are imported from contracts, since
 * those genuinely match on both sides.
 */
import type {
  ExperimentStatus,
  RunStatus,
  SimulationBackend,
} from '@brainforge/contracts';

export type { ExperimentStatus, RunStatus, SimulationBackend };

/** Envelope returned by every paginated list endpoint. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExperimentConfig {
  backend: SimulationBackend;
  duration: number;
  dt: number;
  seed?: number;
  /** Steps between telemetry emissions; the worker defaults to 10. */
  reportInterval?: number;
  checkpointInterval?: number;
  parameters?: Record<string, number | boolean | string>;
  environment?: {
    type: 'pong' | 'braitenberg' | 'cartpole';
    sensoryNodes: number[];
    motorNodes: number[];
  };
}

export interface BrainModelRow {
  id: string;
  name: string;
  description: string | null;
  version: string;
  regionCount: number;
  defaultBackend: SimulationBackend;
  parameters: Record<string, number> | null;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  connectivitySetId: string | null;
  /** Present on list responses only. */
  _count?: { regions: number };
}

export interface RegionRow {
  id: string;
  name: string;
  abbreviation: string | null;
  hemisphere: string | null;
  atlasIndex: number | null;
  coordX: number | null;
  coordY: number | null;
  coordZ: number | null;
  metadata: Record<string, unknown> | null;
  modelId: string;
}

export interface ConnectionRow {
  sourceRegionId: string;
  targetRegionId: string;
  weight: number;
  delay: number;
  connectionType: string;
}

/** Narrow run projection attached to experiment list rows. */
export interface ExperimentRunSummary {
  id: string;
  seed: number;
  status: RunStatus;
  totalSteps: number;
  createdAt: string;
}

export interface ExperimentRow {
  id: string;
  name: string;
  description: string | null;
  status: ExperimentStatus;
  config: ExperimentConfig;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  modelId: string;
  userId: string | null;
  /**
   * The list endpoint selects only { id, name }; findOne and the run detail
   * endpoint return the full row.
   */
  model?: BrainModelRow | Pick<BrainModelRow, 'id' | 'name'>;
  /** List endpoint only: up to 20 most recent completed runs. */
  runs?: ExperimentRunSummary[];
  _count?: { runs: number };
}

export interface RunArtifactRow {
  id: string;
  type: string;
  path: string;
  sizeBytes: number | null;
  step: number | null;
  createdAt: string;
  runId: string;
}

export interface ExperimentRunRow {
  id: string;
  status: RunStatus;
  progress: number;
  currentStep: number;
  totalSteps: number;
  seed: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  experimentId: string;
  /** Included by the run detail endpoint. */
  experiment?: ExperimentRow;
  artifacts?: RunArtifactRow[];
}

export interface RunMetricRow {
  id: string;
  step: number;
  timestamp: number;
  metrics: Record<string, number>;
  createdAt: string;
  runId: string;
}

export interface DatasetRow {
  id: string;
  name: string;
  description: string | null;
  format: string;
  source: string | null;
  regionCount: number | null;
  fileSize: number | null;
  checksum: string | null;
  storagePath: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
}

/** Region enriched with per-region activity, from GET /runs/:id/activity-map. */
export interface ActivityMapRegion {
  id: string;
  name: string;
  abbreviation: string | null;
  hemisphere: string | null;
  atlasIndex: number;
  coordX: number | null;
  coordY: number | null;
  coordZ: number | null;
  meanActivity: number | null;
  maxActivity: number | null;
  stdActivity: number | null;
  finalActivity: number | null;
}

export interface ActivityMapResponse {
  runId: string;
  experimentName: string;
  modelName: string;
  hasData: boolean;
  activityMap: Record<string, number[]> | null;
  regions: ActivityMapRegion[];
}

export interface CompareRunsResponse {
  runs: ExperimentRunRow[];
  metrics: Record<string, RunMetricRow[]>;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  checks: Record<string, string>;
  timestamp: string;
  version: string;
}

export interface StatsResponse {
  models: number;
  datasets: number;
  experiments: number;
  runs: number;
}

/** Telemetry events streamed over the /telemetry websocket namespace. */
export type TelemetryEvent =
  | { type: 'run_started'; runId: string; config: Record<string, unknown>; timestamp: number }
  | {
      type: 'run_metric';
      runId: string;
      step: number;
      metrics: Record<string, number>;
      regionActivity?: number[];
      timestamp: number;
    }
  | {
      type: 'run_progress';
      runId: string;
      step: number;
      totalSteps: number;
      progress: number;
      elapsed: number;
      timestamp: number;
    }
  | { type: 'run_warning'; runId: string; message: string; details?: Record<string, number>; timestamp: number }
  | { type: 'run_completed'; runId: string; summary: Record<string, unknown>; timestamp: number }
  | { type: 'run_error'; runId: string; error: string; fatal?: boolean; timestamp: number }
  | { type: 'run_checkpoint'; runId: string; step: number; checkpointId: string; timestamp: number }
  | { type: 'run_command'; runId: string; command: unknown; timestamp: number };

/** Payload accepted by POST /runs/:id/command. */
export type RunCommandPayload =
  | 'pause'
  | 'resume'
  | 'stop'
  | { command: 'stimulus'; node: number; value: number }
  | { command: 'reward'; value: number };
