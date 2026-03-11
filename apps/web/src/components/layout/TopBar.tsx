import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

export function TopBar() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 30_000,
  });

  const status = health?.status || 'unknown';

  return (
    <header className="h-12 bg-bg-secondary border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <span className="text-xs text-text-muted font-mono">
          NEURAL SIMULATION PLATFORM
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* System status indicator */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              status === 'healthy'
                ? 'bg-accent-green'
                : status === 'degraded'
                  ? 'bg-accent-amber'
                  : 'bg-text-muted',
            )}
          />
          <span className="text-xs text-text-muted">
            {status === 'healthy'
              ? 'All systems operational'
              : status === 'degraded'
                ? 'Degraded'
                : 'Connecting...'}
          </span>
        </div>

        <div className="text-xs text-text-muted font-mono">
          dev@brainforge
        </div>
      </div>
    </header>
  );
}
