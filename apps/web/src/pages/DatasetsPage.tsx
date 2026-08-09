import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Database } from 'lucide-react';

export function DatasetsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => api.getDatasets(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Datasets</h1>
        <p className="text-sm text-text-secondary mt-1">
          Connectivity matrices, region metadata, and imported data
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-text-muted">Loading...</div>
      ) : (
        <div className="grid gap-3">
          {data?.items?.map((ds) => (
            <div key={ds.id} className="card card-body">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-accent-purple mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium">{ds.name}</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    {ds.description || 'No description'}
                  </p>
                  <div className="flex gap-4 mt-2">
                    <span className="text-xs text-text-secondary">
                      <span className="text-text-muted">Format:</span> {ds.format}
                    </span>
                    {ds.regionCount && (
                      <span className="text-xs text-text-secondary">
                        <span className="text-text-muted">Regions:</span>{' '}
                        {ds.regionCount}
                      </span>
                    )}
                    <span className="text-xs text-text-secondary">
                      <span className="text-text-muted">Source:</span>{' '}
                      {ds.source || 'unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {data?.items?.length === 0 && (
            <p className="text-sm text-text-muted">No datasets found.</p>
          )}
        </div>
      )}
    </div>
  );
}
