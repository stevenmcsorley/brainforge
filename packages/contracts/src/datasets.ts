import { z } from 'zod';

export const DatasetFormatSchema = z.enum([
  'csv',
  'json',
  'npz',
  'connectivity_matrix',
  'region_metadata',
]);

export const DatasetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  format: DatasetFormatSchema,
  source: z.string().optional(),
  regionCount: z.number().int().optional(),
  fileSize: z.number().int().optional(),
  checksum: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});

export const CreateDatasetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  format: DatasetFormatSchema,
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Dataset = z.infer<typeof DatasetSchema>;
export type CreateDataset = z.infer<typeof CreateDatasetSchema>;
export type DatasetFormat = z.infer<typeof DatasetFormatSchema>;
