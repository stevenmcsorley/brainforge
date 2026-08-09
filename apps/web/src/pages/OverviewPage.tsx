import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Brain, Database, FlaskConical, Activity, ArrowRight } from 'lucide-react';

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-accent-green',
  running: 'bg-accent-blue animate-pulse',
  failed: 'bg-accent-red',
  queued: 'bg-text-muted',
  paused: 'bg-accent-amber',
  cancelled: 'bg-text-muted',
  initializing: 'bg-accent-blue animate-pulse',
};

export function OverviewPage() {
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    refetchInterval: 10_000,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 15_000,
  });

  const { data: experimentsData } = useQuery({
    queryKey: ['experiments', 1, 6],
    queryFn: () => api.getExperiments(1, 6),
  });

  const statCards = [
    { label: 'Brain Models', value: stats?.models ?? '—', icon: Brain, color: 'text-accent-cyan', href: '/models' },
    { label: 'Datasets', value: stats?.datasets ?? '—', icon: Database, color: 'text-accent-purple', href: '/datasets' },
    { label: 'Experiments', value: stats?.experiments ?? '—', icon: FlaskConical, color: 'text-accent-green', href: '/experiments' },
    { label: 'Simulation Runs', value: stats?.runs ?? '—', icon: Activity, color: 'text-accent-amber', href: '/experiments' },
  ];

  const experiments = experimentsData?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-text-secondary mt-1">
          BrainForge simulation platform — status and summary
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <button
            key={stat.label}
            className="card card-body text-left hover:bg-bg-elevated transition-colors group"
            onClick={() => navigate(stat.href)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="label">{stat.label}</p>
                <p className={cn('metric-value mt-1', statsLoading && 'animate-pulse text-text-muted')}>
                  {stat.value}
                </p>
              </div>
              <stat.icon
                className={cn('w-8 h-8 opacity-40 group-hover:opacity-60 transition-opacity', stat.color)}
              />
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* System health */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-medium">System Health</h2>
          </div>
          <div className="card-body space-y-3">
            {health?.checks ? (
              Object.entries(health.checks).map(([service, status]) => (
                <div key={service} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        status === 'ok' ? 'bg-accent-green' : 'bg-accent-red',
                      )}
                    />
                    <span className="text-sm capitalize">{service}</span>
                  </div>
                  <span className={cn(
                    'text-xs font-mono',
                    status === 'ok' ? 'text-accent-green' : 'text-accent-red',
                  )}>
                    {status as string}
                  </span>
                </div>
              ))
            ) : (
              <div className="space-y-3">
                {['PostgreSQL', 'Redis'].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-text-muted animate-pulse" />
                    <span className="text-sm text-text-muted">{s}</span>
                  </div>
                ))}
              </div>
            )}
            {health?.timestamp && (
              <p className="text-xs text-text-muted pt-1 border-t border-border">
                Checked {new Date(health.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Quick start */}
        <div className="card col-span-2">
          <div className="card-header">
            <h2 className="text-sm font-medium">Quick Start</h2>
          </div>
          <div className="card-body space-y-3">
            <p className="text-sm text-text-secondary">
              BrainForge is a research-grade platform for large-scale brain simulation.
              It supports rate-based, spiking, and whole-brain oscillatory dynamics
              across configurable anatomical connectivity models.
            </p>
            <div className="flex gap-3 pt-1">
              <button className="btn-primary" onClick={() => navigate('/models')}>
                Browse Models
              </button>
              <button className="btn-secondary" onClick={() => navigate('/experiments')}>
                View Experiments
              </button>
              <button className="btn-secondary" onClick={() => navigate('/monitor')}>
                Live Monitor
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent experiments */}
      {experiments.length > 0 && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent Experiments</h2>
            <button
              className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors"
              onClick={() => navigate('/experiments')}
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-border/50">
            {experiments.map((exp) => (
              <div
                key={exp.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-bg-tertiary cursor-pointer transition-colors"
                onClick={() => navigate(`/experiments/${exp.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    STATUS_DOT[exp.status] ?? 'bg-text-muted',
                  )} />
                  <div>
                    <p className="text-sm font-medium">{exp.name}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {exp.config?.backend ?? 'rate_based'} ·{' '}
                      {exp.config?.duration ?? 1}s ·{' '}
                      {exp.config?.dt ?? 0.001}s dt
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded font-medium',
                    exp.status === 'running' ? 'bg-accent-blue/10 text-accent-blue' :
                      exp.status === 'completed' ? 'bg-accent-green/10 text-accent-green' :
                        'bg-bg-tertiary text-text-muted',
                  )}>
                    {exp.status}
                  </span>
                  <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-40" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
