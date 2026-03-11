import { z } from 'zod';
import { SimulationBackendType } from './models';

export const ExperimentStatusSchema = z.enum([
  'draft',
  'ready',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const ExperimentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  modelId: z.string().uuid(),
  status: ExperimentStatusSchema.default('draft'),
  config: z.object({
    backend: SimulationBackendType,
    duration: z.number().positive(),
    dt: z.number().positive().default(0.001),
    seed: z.number().int().optional(),
    parameters: z.record(z.union([z.number(), z.boolean(), z.string()])).optional(),
    environment: z.object({
      type: z.enum(['pong', 'braitenberg', 'cartpole']),
      sensoryNodes: z.array(z.number()),
      motorNodes: z.array(z.number()),
    }).optional(),
  }),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateExperimentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  modelId: z.string().uuid(),
  status: ExperimentStatusSchema.default('draft'),
  config: z.object({
    backend: SimulationBackendType,
    duration: z.number().positive(),
    dt: z.number().positive().default(0.001),
    seed: z.number().int().optional(),
    parameters: z.record(z.union([z.number(), z.boolean(), z.string()])).optional(),
    environment: z.object({
      type: z.enum(['pong', 'braitenberg', 'cartpole']),
      sensoryNodes: z.array(z.number()),
      motorNodes: z.array(z.number()),
    }).optional(),
  }),
  tags: z.array(z.string()).optional(),
});

export const UpdateExperimentSchema = CreateExperimentSchema.partial();

export type Experiment = z.infer<typeof ExperimentSchema>;
export type CreateExperiment = z.infer<typeof CreateExperimentSchema>;
export type UpdateExperiment = z.infer<typeof UpdateExperimentSchema>;
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;
