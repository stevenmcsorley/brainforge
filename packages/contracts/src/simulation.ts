import { z } from 'zod';
import { SimulationBackendType } from './models';

export const StimulusTypeSchema = z.enum([
  'constant',
  'pulse',
  'ramp',
  'noise',
  'sine',
  'custom',
]);

export const StimulusSchema = z.object({
  id: z.string().uuid().optional(),
  targetRegions: z.array(z.string()),
  type: StimulusTypeSchema,
  amplitude: z.number(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  parameters: z.record(z.number()).optional(),
});

export const SimConfigSchema = z.object({
  backend: SimulationBackendType,
  duration: z.number().positive(),
  dt: z.number().positive().default(0.001),
  seed: z.number().int().default(42),
  reportInterval: z.number().int().positive().default(10),
  checkpointInterval: z.number().int().positive().optional(),
  parameters: z.record(z.number()).optional(),
  stimuli: z.array(StimulusSchema).optional(),
});

export const ParameterSweepSchema = z.object({
  parameterName: z.string(),
  values: z.array(z.number()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  steps: z.number().int().positive().optional(),
});

export type Stimulus = z.infer<typeof StimulusSchema>;
export type StimulusType = z.infer<typeof StimulusTypeSchema>;
export type SimConfig = z.infer<typeof SimConfigSchema>;
export type ParameterSweep = z.infer<typeof ParameterSweepSchema>;
