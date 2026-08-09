import type {
  ActivityMapResponse,
  BrainModelRow,
  CompareRunsResponse,
  ConnectionRow,
  DatasetRow,
  ExperimentRow,
  ExperimentRunRow,
  HealthResponse,
  Paginated,
  RegionRow,
  RunCommandPayload,
  RunMetricRow,
  StatsResponse,
} from './wire';
import type { CreateBrainModel, CreateExperiment, UpdateExperiment } from '@brainforge/contracts';

const API_BASE = import.meta.env.VITE_API_URL || '';

/** Error carrying the HTTP status and any parsed validation issues. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Dev-User': 'dev@brainforge.local',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    // The API returns JSON errors ({ message, issues? }); fall back to raw text.
    try {
      const parsed = JSON.parse(body);
      throw new ApiError(
        res.status,
        parsed.message ?? `API error ${res.status}`,
        parsed.issues,
      );
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(res.status, `API error ${res.status}: ${body}`);
    }
  }

  return res.json();
}

export const api = {
  // Models
  getModels: (page = 1, limit = 20) =>
    request<Paginated<BrainModelRow>>(`/models?page=${page}&limit=${limit}`),
  getModel: (id: string) => request<BrainModelRow>(`/models/${id}`),
  createModel: (data: CreateBrainModel) =>
    request<BrainModelRow>('/models', { method: 'POST', body: JSON.stringify(data) }),
  getModelRegions: (id: string) => request<RegionRow[]>(`/models/${id}/regions`),
  getModelConnectivity: (id: string) =>
    request<ConnectionRow[]>(`/models/${id}/connectivity`),

  // Datasets
  getDatasets: (page = 1, limit = 20) =>
    request<Paginated<DatasetRow>>(`/datasets?page=${page}&limit=${limit}`),
  getDataset: (id: string) => request<DatasetRow>(`/datasets/${id}`),

  // Experiments
  getExperiments: (page = 1, limit = 20) =>
    request<Paginated<ExperimentRow>>(`/experiments?page=${page}&limit=${limit}`),
  getExperiment: (id: string) => request<ExperimentRow>(`/experiments/${id}`),
  createExperiment: (data: CreateExperiment) =>
    request<ExperimentRow>('/experiments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateExperiment: (id: string, data: UpdateExperiment) =>
    request<ExperimentRow>(`/experiments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Runs
  getRunsByExperiment: (experimentId: string) =>
    request<Paginated<ExperimentRunRow>>(`/runs/experiment/${experimentId}`),
  getRun: (id: string) => request<ExperimentRunRow>(`/runs/${id}`),
  startRun: (experimentId: string, seed?: number) =>
    request<ExperimentRunRow>(`/runs/start/${experimentId}`, {
      method: 'POST',
      body: JSON.stringify({ seed }),
    }),
  sendRunCommand: (runId: string, command: RunCommandPayload) =>
    request<{ runId: string; command: RunCommandPayload; sent: boolean }>(
      `/runs/${runId}/command`,
      { method: 'POST', body: JSON.stringify({ command }) },
    ),
  getRunMetrics: (runId: string) => request<RunMetricRow[]>(`/runs/${runId}/metrics`),
  getRunActivityMap: (runId: string) =>
    request<ActivityMapResponse>(`/runs/${runId}/activity-map`),
  compareRuns: (runIds: string[]) =>
    request<CompareRunsResponse>('/runs/compare', {
      method: 'POST',
      body: JSON.stringify({ runIds }),
    }),

  // Admin
  getHealth: () => request<HealthResponse>('/admin/health'),
  getStats: () => request<StatsResponse>('/admin/stats'),
};
