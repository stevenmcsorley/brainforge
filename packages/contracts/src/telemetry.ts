import { z } from 'zod';

export const TelemetryEventTypeSchema = z.enum([
  'run_started',
  'run_progress',
  'run_checkpoint',
  'run_metric',
  'run_warning',
  'run_error',
  'run_completed',
  'run_command',
]);

export const RunStartedEventSchema = z.object({
  type: z.literal('run_started'),
  runId: z.string().uuid(),
  experimentId: z.string().uuid(),
  config: z.record(z.unknown()),
  timestamp: z.number(),
});

export const RunProgressEventSchema = z.object({
  type: z.literal('run_progress'),
  runId: z.string().uuid(),
  step: z.number().int(),
  totalSteps: z.number().int(),
  progress: z.number().min(0).max(1),
  elapsed: z.number(),
  timestamp: z.number(),
});

export const RunMetricEventSchema = z.object({
  type: z.literal('run_metric'),
  runId: z.string().uuid(),
  step: z.number().int(),
  metrics: z.record(z.number()),
  // Per-region activity snapshot (region index -> activation)
  regionActivity: z.array(z.number()).optional(),
  timestamp: z.number(),
});

export const RunCheckpointEventSchema = z.object({
  type: z.literal('run_checkpoint'),
  runId: z.string().uuid(),
  step: z.number().int(),
  checkpointId: z.string(),
  timestamp: z.number(),
});

export const RunWarningEventSchema = z.object({
  type: z.literal('run_warning'),
  runId: z.string().uuid(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});

export const RunErrorEventSchema = z.object({
  type: z.literal('run_error'),
  runId: z.string().uuid(),
  error: z.string(),
  fatal: z.boolean().default(false),
  timestamp: z.number(),
});

export const RunCompletedEventSchema = z.object({
  type: z.literal('run_completed'),
  runId: z.string().uuid(),
  summary: z.record(z.unknown()),
  timestamp: z.number(),
});

export const RunCommandEventSchema = z.object({
  type: z.literal('run_command'),
  runId: z.string().uuid(),
  command: z.enum(['pause', 'resume', 'stop']),
  timestamp: z.number(),
});

export const TelemetryEventSchema = z.discriminatedUnion('type', [
  RunStartedEventSchema,
  RunProgressEventSchema,
  RunMetricEventSchema,
  RunCheckpointEventSchema,
  RunWarningEventSchema,
  RunErrorEventSchema,
  RunCompletedEventSchema,
  RunCommandEventSchema,
]);

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type TelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;
export type RunStartedEvent = z.infer<typeof RunStartedEventSchema>;
export type RunProgressEvent = z.infer<typeof RunProgressEventSchema>;
export type RunMetricEvent = z.infer<typeof RunMetricEventSchema>;
export type RunCompletedEvent = z.infer<typeof RunCompletedEventSchema>;
