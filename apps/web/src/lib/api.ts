const API_BASE = import.meta.env.VITE_API_URL || '';

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
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json();
}

export const api = {
  // Models
  getModels: (page = 1, limit = 20) =>
    request<any>(`/models?page=${page}&limit=${limit}`),
  getModel: (id: string) => request<any>(`/models/${id}`),
  createModel: (data: any) =>
    request<any>('/models', { method: 'POST', body: JSON.stringify(data) }),
  getModelRegions: (id: string) => request<any[]>(`/models/${id}/regions`),
  getModelConnectivity: (id: string) =>
    request<any[]>(`/models/${id}/connectivity`),

  // Datasets
  getDatasets: (page = 1, limit = 20) =>
    request<any>(`/datasets?page=${page}&limit=${limit}`),
  getDataset: (id: string) => request<any>(`/datasets/${id}`),

  // Experiments
  getExperiments: (page = 1, limit = 20) =>
    request<any>(`/experiments?page=${page}&limit=${limit}`),
  getExperiment: (id: string) => request<any>(`/experiments/${id}`),
  createExperiment: (data: any) =>
    request<any>('/experiments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateExperiment: (id: string, data: any) =>
    request<any>(`/experiments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Runs
  getRunsByExperiment: (experimentId: string) =>
    request<any>(`/runs/experiment/${experimentId}`),
  getRun: (id: string) => request<any>(`/runs/${id}`),
  startRun: (experimentId: string, seed?: number) =>
    request<any>(`/runs/start/${experimentId}`, {
      method: 'POST',
      body: JSON.stringify({ seed }),
    }),
  sendRunCommand: (runId: string, command: any) =>
    request<any>(`/runs/${runId}/command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  getRunMetrics: (runId: string) => request<any[]>(`/runs/${runId}/metrics`),
  getRunActivityMap: (runId: string) =>
    request<any>(`/runs/${runId}/activity-map`),
  compareRuns: (runIds: string[]) =>
    request<any>('/runs/compare', {
      method: 'POST',
      body: JSON.stringify({ runIds }),
    }),

  // Admin
  getHealth: () => request<any>('/admin/health'),
  getStats: () => request<any>('/admin/stats'),
};
