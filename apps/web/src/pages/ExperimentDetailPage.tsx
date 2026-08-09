import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ExperimentRow } from '@/lib/wire';
import { cn } from '@/lib/cn';
import { Play, Activity, Clock, Hash, CheckCircle, XCircle, Loader } from 'lucide-react';
import { CreateExperimentModal } from './ExperimentsPage';

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  completed: { label: 'Completed', cls: 'bg-accent-green/20 text-accent-green', icon: CheckCircle },
  running: { label: 'Running', cls: 'bg-accent-blue/20 text-accent-blue', icon: Loader },
  failed: { label: 'Failed', cls: 'bg-accent-red/20 text-accent-red', icon: XCircle },
  queued: { label: 'Queued', cls: 'bg-text-muted/20 text-text-muted', icon: Clock },
  initializing: { label: 'Initializing', cls: 'bg-accent-blue/10 text-accent-blue', icon: Loader },
  paused: { label: 'Paused', cls: 'bg-accent-amber/20 text-accent-amber', icon: Clock },
  cancelled: { label: 'Cancelled', cls: 'bg-text-muted/20 text-text-muted', icon: XCircle },
};

export function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [modalState, setModalState] = useState<{ mode: 'edit' | 'copy'; data: ExperimentRow } | null>(null);
  const queryClient = useQueryClient();

  const { data: experiment, isLoading } = useQuery({
    queryKey: ['experiment', id],
    queryFn: () => api.getExperiment(id!),
    enabled: !!id,
  });

  // Separate query for runs — the API doesn't embed runs in the experiment object
  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['runs', 'experiment', id],
    queryFn: () => api.getRunsByExperiment(id!),
    enabled: !!id,
    refetchInterval: 3000, // poll every 3s to pick up running→completed transitions
  });

  const startRunMutation = useMutation({
    mutationFn: () => api.startRun(id!),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['runs', 'experiment', id] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate(`/monitor/${run.id}`);
    },
  });

  if (isLoading) {
    return <div className="text-sm text-text-muted animate-pulse">Loading experiment...</div>;
  }
  if (!experiment) {
    return <div className="text-sm text-text-muted">Experiment not found</div>;
  }

  const config = experiment.config;
  const runs = runsData?.items ?? [];
  const totalSteps = Math.ceil((config.duration || 1) / (config.dt || 0.001));

  return (
    <div className="space-y-6">
      {modalState && (
        <CreateExperimentModal
          mode={modalState.mode}
          initialData={modalState.data}
          onClose={() => setModalState(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{experiment.name}</h1>
          <p className="text-sm text-text-secondary mt-1">{experiment.description}</p>
          <div className="flex items-center gap-3 mt-2">
            {experiment.tags?.map((tag: string) => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-bg-tertiary text-text-muted border border-border">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => setModalState({ mode: 'edit', data: experiment })}
          >
            Edit
          </button>
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => setModalState({ mode: 'copy', data: experiment })}
          >
            Duplicate
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => startRunMutation.mutate()}
            disabled={startRunMutation.isPending}
          >
            <Play className="w-3.5 h-3.5" />
            {startRunMutation.isPending ? 'Starting…' : 'Start Run'}
          </button>
        </div>
      </div>

      {/* Config + status row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-medium">Simulation Config</h2>
          </div>
          <div className="card-body space-y-2">
            {[
              ['Backend', config.backend ?? '-'],
              ['Duration', `${config.duration ?? '-'} s`],
              ['Time Step', `${config.dt ?? '-'} s`],
              ['Total Steps', totalSteps.toLocaleString()],
              ['Seed', config.seed ?? 'random'],
              ['Report Every', `${config.reportInterval ?? 10} steps`],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between text-sm">
                <span className="text-text-muted">{label}</span>
                <span className="font-mono text-text-primary">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-medium">Backend Parameters</h2>
          </div>
          <div className="card-body space-y-2">
            {config.parameters && Object.entries(config.parameters).length > 0 ? (
              Object.entries(config.parameters).map(([key, val]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-text-muted">{key}</span>
                  <span className="font-mono text-text-primary">{String(val)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-muted">Using backend defaults</p>
            )}
          </div>
        </div>
      </div>

      {/* Runs list */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-text-muted" />
            Runs
          </h2>
          <span className="text-xs text-text-muted">{runs.length} total</span>
        </div>
        <div className="card-body">
          {runsLoading ? (
            <p className="text-sm text-text-muted animate-pulse">Loading runs…</p>
          ) : runs.length > 0 ? (
            <div className="space-y-1.5">
              {runs.map((run) => {
                const meta = STATUS_META[run.status] ?? STATUS_META.queued;
                const StatusIcon = meta.icon;
                const progress = (run.progress ?? 0) * 100;
                return (
                  <div
                    key={run.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary cursor-pointer hover:bg-bg-elevated transition-colors group"
                    onClick={() => navigate(
                      run.status === 'running' || run.status === 'paused'
                        ? `/monitor/${run.id}`
                        : `/monitor/${run.id}`
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusIcon
                        className={cn('w-3.5 h-3.5 shrink-0', meta.cls.split(' ')[1],
                          run.status === 'running' || run.status === 'initializing' ? 'animate-spin' : ''
                        )}
                      />
                      <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', meta.cls)}>
                        {meta.label}
                      </span>
                      <span className="text-xs font-mono text-text-muted">
                        {run.id.slice(0, 12)}…
                      </span>
                    </div>

                    <div className="flex items-center gap-5 text-xs text-text-muted shrink-0">
                      {/* Progress bar inline for running/initializing */}
                      {(run.status === 'running' || run.status === 'initializing') && (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1 bg-bg-primary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-blue rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span>{progress.toFixed(0)}%</span>
                        </div>
                      )}
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {run.seed}
                      </span>
                      <span>
                        {run.currentStep?.toLocaleString() ?? 0} / {run.totalSteps?.toLocaleString() ?? '-'} steps
                      </span>
                      <span>{new Date(run.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-sm text-text-muted">No runs yet.</p>
              <p className="text-xs text-text-muted mt-1">Click <strong>Start Run</strong> above to begin.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
