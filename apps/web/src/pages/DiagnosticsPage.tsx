import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function DiagnosticsPage() {
  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
  });

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Diagnostics</h1>
          <p className="text-sm text-text-secondary mt-1">
            System health, service status, and debug information
          </p>
        </div>
        <button className="btn-secondary" onClick={() => refetchHealth()}>
          Refresh
        </button>
      </div>

      {/* Health checks */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-medium">Service Health</h2>
        </div>
        <div className="card-body">
          {health ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    health.status === 'healthy'
                      ? 'bg-accent-green'
                      : 'bg-accent-amber'
                  }`}
                />
                <span className="text-sm font-medium capitalize">
                  {health.status}
                </span>
                <span className="text-xs text-text-muted ml-2">
                  {health.timestamp}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {Object.entries(health.checks || {}).map(
                  ([service, status]) => (
                    <div
                      key={service}
                      className="p-3 rounded bg-bg-tertiary flex items-center gap-3"
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          status === 'ok'
                            ? 'bg-accent-green'
                            : 'bg-accent-red'
                        }`}
                      />
                      <div>
                        <p className="text-sm capitalize">{service}</p>
                        <p className="text-xs text-text-muted">
                          {status as string}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Loading...</p>
          )}
        </div>
      </div>

      {/* Database stats */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-medium">Database Statistics</h2>
        </div>
        <div className="card-body">
          {stats ? (
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(stats).map(([key, value]) => (
                <div key={key}>
                  <p className="label">{key}</p>
                  <p className="metric-value mt-1">{String(value)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Loading...</p>
          )}
        </div>
      </div>

      {/* Environment info */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-medium">Environment</h2>
        </div>
        <div className="card-body font-mono text-xs space-y-1 text-text-secondary">
          <p>Version: {health?.version || '0.1.0'}</p>
          <p>API: {import.meta.env.VITE_API_URL || 'default'}</p>
          <p>Mode: {import.meta.env.MODE}</p>
        </div>
      </div>
    </div>
  );
}
