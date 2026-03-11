import { z } from 'zod';

export const RunStatusSchema = z.enum([
  'queued',
  'initializing',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'checkpointed',
]);

export const RunCommandSchema = z.union([
  z.enum(['pause', 'resume', 'stop']),
  z.object({
    command: z.literal('stimulus'),
    node: z.number().int().nonnegative(),
    value: z.number(),
  }),
]);

export const ExperimentRunSchema = z.object({
  id: z.string().uuid(),
  experimentId: z.string().uuid(),
  status: RunStatusSchema,
  progress: z.number().min(0).max(1).default(0),
  currentStep: z.number().int().nonnegative().default(0),
  totalSteps: z.number().int().positive(),
  seed: z.number().int(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});

export const RunSummarySchema = z.object({
  runId: z.string().uuid(),
  totalSteps: z.number().int(),
  wallTimeMs: z.number(),
  simTimeSec: z.number(),
  peakMemoryMb: z.number().optional(),
  meanActivity: z.number().optional(),
  warnings: z.number().int().default(0),
  errors: z.number().int().default(0),
});

export const RunArtifactSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  type: z.enum(['trace', 'checkpoint', 'metrics', 'summary', 'config']),
  path: z.string(),
  sizeBytes: z.number().int().optional(),
  step: z.number().int().optional(),
  createdAt: z.string().datetime(),
});

export const RunMetricSchema = z.object({
  runId: z.string().uuid(),
  step: z.number().int(),
  timestamp: z.number(),
  metrics: z.record(z.number()),
});

export type ExperimentRun = z.infer<typeof ExperimentRunSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunCommand = z.infer<typeof RunCommandSchema>;
export type RunSummary = z.infer<typeof RunSummarySchema>;
export type RunArtifact = z.infer<typeof RunArtifactSchema>;
export type RunMetric = z.infer<typeof RunMetricSchema>;
