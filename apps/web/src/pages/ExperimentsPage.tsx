import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ExperimentRow, SimulationBackend } from '@/lib/wire';
import { FlaskConical, Plus, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

const STATUS_FILTERS = ['all', 'draft', 'ready', 'running', 'completed', 'failed'];

const statusColors: Record<string, string> = {
  draft: 'bg-text-muted/20 text-text-muted',
  ready: 'bg-accent-blue/20 text-accent-blue',
  running: 'bg-accent-green/20 text-accent-green',
  completed: 'bg-accent-cyan/20 text-accent-cyan',
  failed: 'bg-accent-red/20 text-accent-red',
  cancelled: 'bg-accent-amber/20 text-accent-amber',
};

export function CreateExperimentModal({
  onClose,
  initialData,
  mode = 'create'
}: {
  onClose: () => void;
  initialData?: ExperimentRow;
  mode?: 'create' | 'edit' | 'copy';
}) {
  const qc = useQueryClient();
  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => api.getModels(1, 50),
  });
  const models = modelsData?.items ?? [];

  const [form, setForm] = useState(() => {
    if (initialData) {
      const config = initialData.config || {};
      const params = config.parameters || {};
      return {
        name: mode === 'copy' ? `${initialData.name} (Copy)` : initialData.name,
        description: initialData.description || '',
        modelId: initialData.modelId || '',
        backend: (config.backend || 'rate_based') as SimulationBackend,
        duration: config.duration || 2.0,
        dt: config.dt || 0.001,
        seed: config.seed || 42,
        global_coupling: params.global_coupling ?? 0.5,
        gain: params.gain ?? 1.0,
        noise_sigma: params.noise_sigma ?? 0.02,
        plasticity_enabled: params.plasticity_enabled ?? false,
        learning_rate: params.learning_rate ?? 0.05,
        tags: (initialData.tags || []).join(', '),
      };
    }
    return {
      name: '',
      description: '',
      modelId: '',
      backend: 'rate_based' as SimulationBackend,
      duration: 2.0,
      dt: 0.001,
      seed: 42,
      global_coupling: 0.5,
      gain: 1.0,
      noise_sigma: 0.02,
      plasticity_enabled: false,
      learning_rate: 0.05,
      tags: '',
    };
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        description: form.description,
        modelId: form.modelId,
        status: mode === 'edit' ? initialData?.status ?? 'draft' : 'draft',
        config: {
          backend: form.backend,
          duration: Number(form.duration),
          dt: Number(form.dt),
          seed: Number(form.seed),
          parameters: {
            tau: 0.01,
            gain: Number(form.gain),
            noise_sigma: Number(form.noise_sigma),
            global_coupling: Number(form.global_coupling),
            plasticity_enabled: Boolean(form.plasticity_enabled),
            learning_rate: Number(form.learning_rate),
          },
        },
        tags: form.tags
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean),
      };

      if (mode === 'edit' && initialData?.id) {
        return api.updateExperiment(initialData.id, payload);
      }
      return api.createExperiment(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['experiments'] });
      // Invalidate specific experiment if editing
      if (mode === 'edit' && initialData?.id) {
        qc.invalidateQueries({ queryKey: ['experiment', initialData.id] });
      }
      onClose();
    },
  });

  const set = (k: keyof typeof form, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const actionText = mode === 'edit' ? 'Save Changes' : mode === 'copy' ? 'Duplicate Experiment' : 'Create Experiment';
  const titleText = mode === 'edit' ? 'Edit Experiment' : mode === 'copy' ? 'Duplicate Experiment' : 'New Experiment';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg mx-4 shadow-2xl">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-sm font-semibold">{titleText}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="card-body space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Name *</label>
            <input
              className="input w-full"
              placeholder="My experiment"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Description</label>
            <textarea
              className="input w-full resize-none h-16"
              placeholder="Optional description…"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Brain Model *</label>
            <select
              className="input w-full"
              value={form.modelId}
              onChange={(e) => set('modelId', e.target.value)}
            >
              <option value="">Select a model…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.regionCount} regions)
                </option>
              ))}
            </select>
          </div>

          {/* Simulation config */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Backend</label>
              <select
                className="input w-full"
                value={form.backend}
                onChange={(e) => set('backend', e.target.value)}
              >
                <option value="rate_based">rate_based</option>
                <option value="spiking">spiking</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Seed</label>
              <input
                type="number"
                className="input w-full"
                value={form.seed}
                onChange={(e) => set('seed', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Duration (s)</label>
              <input
                type="number"
                step="0.5"
                className="input w-full"
                value={form.duration}
                onChange={(e) => set('duration', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Time step (dt)</label>
              <input
                type="number"
                step="0.0001"
                className="input w-full"
                value={form.dt}
                onChange={(e) => set('dt', e.target.value)}
              />
            </div>
          </div>

          {/* Parameters */}
          <div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {[
                { key: 'global_coupling', label: 'Global Coupling', step: '0.05' },
                { key: 'gain', label: 'Gain', step: '0.1' },
                { key: 'noise_sigma', label: 'Noise Sigma', step: '0.005' },
                { key: 'learning_rate', label: 'Learning Rate (Oja)', step: '0.01' },
              ].map(({ key, label, step }) => (
                <div key={key}>
                  <label className="block text-xs text-text-muted mb-1">{label}</label>
                  <input
                    type="number"
                    step={step}
                    className="input w-full"
                    value={(form as any)[key]}
                    onChange={(e) => set(key as keyof typeof form, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center space-x-2 mt-4">
              <input
                type="checkbox"
                id="plasticity_enabled"
                checked={(form as any).plasticity_enabled}
                onChange={(e) => set('plasticity_enabled', e.target.checked)}
                className="rounded border-border text-accent-cyan focus:ring-accent-cyan bg-background"
              />
              <label htmlFor="plasticity_enabled" className="text-xs text-text-muted">
                Enable Hebbian Plasticity
              </label>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Tags <span className="text-text-muted/60">(comma separated)</span>
            </label>
            <input
              className="input w-full"
              placeholder="baseline, dk68, rate-based"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!form.name || !form.modelId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : actionText}
          </button>
        </div>
        {mutation.isError && (
          <p className="text-xs text-accent-red px-4 pb-3">
            {(mutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}

export function ExperimentsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState<boolean | any>(false);

  const { data, isLoading } = useQuery({
    queryKey: ['experiments'],
    queryFn: () => api.getExperiments(1, 100),
    refetchInterval: 10_000,
  });

  const experiments = data?.items ?? [];
  const filtered =
    filter === 'all' ? experiments : experiments.filter((e) => e.status === filter);

  return (
    <div className="space-y-6">
      {showCreate && (
        <CreateExperimentModal
          onClose={() => setShowCreate(false)}
          initialData={typeof showCreate === 'object' ? showCreate : undefined}
          mode={typeof showCreate === 'object' ? 'copy' : 'create'}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Experiments</h1>
          <p className="text-sm text-text-secondary mt-1">
            {experiments.length} experiment{experiments.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          New Experiment
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_FILTERS.map((s) => {
          const count = s === 'all' ? experiments.length : experiments.filter((e) => e.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'px-3 py-1 rounded text-xs font-medium transition-colors',
                filter === s
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary',
              )}
            >
              {s} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card card-body animate-pulse h-20 bg-bg-secondary" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card card-body text-center py-12">
          <FlaskConical className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted">
            {filter === 'all' ? 'No experiments yet.' : `No ${filter} experiments.`}
          </p>
          {filter === 'all' && (
            <button
              className="btn-primary mt-4 mx-auto"
              onClick={() => setShowCreate(true)}
            >
              Create your first experiment
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((exp) => (
            <div
              key={exp.id}
              className="card card-body cursor-pointer hover:border-border-hover transition-all group"
              onClick={() => navigate(`/experiments/${exp.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <FlaskConical className="w-5 h-5 text-accent-green mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium">{exp.name}</h3>
                      <span
                        className={cn('status-badge', statusColors[exp.status] || statusColors.draft)}
                      >
                        {exp.status}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 truncate">
                      {exp.description || 'No description'}
                    </p>
                    <div className="flex gap-3 mt-2 flex-wrap">
                      <span className="text-xs text-text-secondary">
                        <span className="text-text-muted">Model: </span>
                        {exp.model?.name || exp.modelId?.slice(0, 8)}
                      </span>
                      <span className="text-xs text-text-secondary">
                        <span className="text-text-muted">Runs: </span>
                        {exp._count?.runs ?? 0}
                      </span>
                      {exp.config?.backend && (
                        <span className="text-xs text-text-muted font-mono">
                          {exp.config.backend}
                        </span>
                      )}
                      {exp.tags?.length > 0 && (
                        <span className="text-xs text-text-muted">
                          {exp.tags.slice(0, 3).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded hover:bg-bg-tertiary transition-colors"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowCreate(exp);
                    }}
                  >
                    Duplicate
                  </button>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-secondary shrink-0 mt-1" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
