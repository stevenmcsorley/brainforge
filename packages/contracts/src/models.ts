import { z } from 'zod';

// --- Region ---

export const RegionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  abbreviation: z.string().optional(),
  hemisphere: z.enum(['left', 'right', 'midline']).optional(),
  atlasIndex: z.number().int().optional(),
  coordinates: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateRegionSchema = RegionSchema.omit({ id: true });

// --- Connectivity ---

export const ConnectionSchema = z.object({
  sourceRegionId: z.string().uuid(),
  targetRegionId: z.string().uuid(),
  weight: z.number(),
  delay: z.number().nonnegative().optional(),
  type: z.enum(['excitatory', 'inhibitory', 'mixed']).default('excitatory'),
});

export const ConnectivitySetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  regionCount: z.number().int().positive(),
  connectionCount: z.number().int().nonnegative(),
  isDirected: z.boolean().default(true),
  createdAt: z.string().datetime(),
});

// --- Brain Model ---

export const SimulationBackendType = z.enum([
  'rate_based',
  'spiking',
  'whole_brain',
  'three_factor',
  'node_perturb',
]);

export const BrainModelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  regionCount: z.number().int().positive(),
  defaultBackend: SimulationBackendType.default('rate_based'),
  parameters: z.record(z.number()).optional(),
  connectivitySetId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateBrainModelSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  defaultBackend: SimulationBackendType.default('rate_based'),
  parameters: z.record(z.number()).optional(),
});

export const UpdateBrainModelSchema = CreateBrainModelSchema.partial();

// --- Types ---

export type Region = z.infer<typeof RegionSchema>;
export type CreateRegion = z.infer<typeof CreateRegionSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type ConnectivitySet = z.infer<typeof ConnectivitySetSchema>;
export type BrainModel = z.infer<typeof BrainModelSchema>;
export type CreateBrainModel = z.infer<typeof CreateBrainModelSchema>;
export type UpdateBrainModel = z.infer<typeof UpdateBrainModelSchema>;
export type SimulationBackend = z.infer<typeof SimulationBackendType>;
