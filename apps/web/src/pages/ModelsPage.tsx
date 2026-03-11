import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Brain } from 'lucide-react';

export function ModelsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => api.getModels(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Brain Models</h1>
          <p className="text-sm text-text-secondary mt-1">
            Registered brain models with region and connectivity data
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-text-muted">Loading models...</div>
      ) : (
        <div className="grid gap-3">
          {data?.items?.map((model: any) => (
            <div
              key={model.id}
              className="card card-body cursor-pointer hover:border-border-hover transition-colors"
              onClick={() => navigate(`/models/${model.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Brain className="w-5 h-5 text-accent-cyan mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium">{model.name}</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {model.description || 'No description'}
                    </p>
                    <div className="flex gap-4 mt-2">
                      <span className="text-xs text-text-secondary">
                        <span className="text-text-muted">Regions:</span>{' '}
                        {model.regionCount}
                      </span>
                      <span className="text-xs text-text-secondary">
                        <span className="text-text-muted">Backend:</span>{' '}
                        {model.defaultBackend}
                      </span>
                      <span className="text-xs text-text-secondary">
                        <span className="text-text-muted">Version:</span>{' '}
                        {model.version}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-xs text-text-muted font-mono">
                  {model.id.slice(0, 8)}
                </span>
              </div>
            </div>
          ))}
          {data?.items?.length === 0 && (
            <p className="text-sm text-text-muted">
              No models found. Run the seed script to create sample data.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
