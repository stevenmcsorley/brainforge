import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Grid3x3, List, FlaskConical } from 'lucide-react';

// Map a weight [0, 1] → HSL color (cool blue → hot red)
function weightToColor(w: number, max: number): string {
  if (max === 0 || w === 0) return 'hsl(220,15%,12%)'; // near-black for zero
  const norm = w / max;
  // blue (220°) → cyan (180°) → green (140°) → amber (45°) → red (0°)
  const hue = 220 - norm * 220;
  const sat = 60 + norm * 30;
  const lgt = 15 + norm * 50;
  return `hsl(${hue},${sat}%,${lgt}%)`;
}

export function ModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<'regions' | 'matrix'>('regions');
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number; w: number } | null>(null);

  const { data: model, isLoading } = useQuery({
    queryKey: ['model', id],
    queryFn: () => api.getModel(id!),
    enabled: !!id,
  });

  const { data: regions } = useQuery({
    queryKey: ['model-regions', id],
    queryFn: () => api.getModelRegions(id!),
    enabled: !!id,
  });

  const { data: connections } = useQuery({
    queryKey: ['model-connectivity', id],
    queryFn: () => api.getModelConnectivity(id!),
    enabled: !!id && view === 'matrix',
  });

  // Build a dense NxN matrix from the sparse connection list
  const { matrix, maxWeight, regionList } = useMemo(() => {
    if (!regions || !connections) return { matrix: [], maxWeight: 0, regionList: [] };

    const sorted = [...regions].sort((a, b) =>
      (a.atlasIndex ?? 0) - (b.atlasIndex ?? 0)
    );
    const n = sorted.length;
    const idxMap: Record<string, number> = {};
    sorted.forEach((r, i) => { idxMap[r.id] = i; });

    const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    let max = 0;
    for (const conn of connections) {
      const si = idxMap[conn.sourceRegionId];
      const ti = idxMap[conn.targetRegionId];
      if (si !== undefined && ti !== undefined) {
        m[si][ti] = conn.weight;
        if (conn.weight > max) max = conn.weight;
      }
    }
    return { matrix: m, maxWeight: max, regionList: sorted };
  }, [regions, connections]);

  if (isLoading) {
    return <div className="text-sm text-text-muted animate-pulse">Loading model…</div>;
  }
  if (!model) {
    return <div className="text-sm text-text-muted">Model not found</div>;
  }

  // Cell size for the heatmap — shrinks as region count grows
  const n = regionList.length;
  const cellPx = n > 50 ? 5 : n > 30 ? 7 : 10;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{model.name}</h1>
          <p className="text-sm text-text-secondary mt-1">{model.description}</p>
        </div>
        <button
          className="btn-secondary flex items-center gap-2"
          onClick={() => navigate('/experiments/new')}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          New Experiment
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          ['Regions', model.regionCount ?? (regions?.length ?? '-')],
          ['Backend', model.defaultBackend ?? '-'],
          ['Version', model.version ?? '1'],
          ['ID', model.id?.slice(0, 12) + '…'],
        ].map(([label, val]) => (
          <div key={String(label)} className="card card-body">
            <p className="label">{label}</p>
            <p className="text-sm font-mono mt-1">{String(val)}</p>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <button
          className={cn('btn-secondary flex items-center gap-1.5', view === 'regions' && 'ring-1 ring-accent-blue')}
          onClick={() => setView('regions')}
        >
          <List className="w-3.5 h-3.5" /> Regions
        </button>
        <button
          className={cn('btn-secondary flex items-center gap-1.5', view === 'matrix' && 'ring-1 ring-accent-blue')}
          onClick={() => setView('matrix')}
        >
          <Grid3x3 className="w-3.5 h-3.5" /> Connectivity Matrix
        </button>
      </div>

      {view === 'regions' && regions && regions.length > 0 && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-medium">Regions</h2>
            <span className="text-xs text-text-muted">{regions.length} total</span>
          </div>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg-secondary z-10">
                <tr className="border-b border-border text-left">
                  {['#', 'Name', 'Hemisphere', 'Coordinates (MNI)'].map(h => (
                    <th key={h} className="px-4 py-2 text-xs text-text-muted font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...regions]
                  .sort((a, b) => (a.atlasIndex ?? 0) - (b.atlasIndex ?? 0))
                  .map((r) => (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-bg-tertiary">
                      <td className="px-4 py-1.5 font-mono text-text-muted text-xs">{r.atlasIndex}</td>
                      <td className="px-4 py-1.5">{r.name}</td>
                      <td className="px-4 py-1.5 text-text-secondary capitalize">{r.hemisphere || '—'}</td>
                      <td className="px-4 py-1.5 font-mono text-xs text-text-muted">
                        {r.coordX != null && r.coordY != null && r.coordZ != null
                          ? `(${r.coordX.toFixed(1)}, ${r.coordY.toFixed(1)}, ${r.coordZ.toFixed(1)})`
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'matrix' && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-medium">Structural Connectivity Matrix</h2>
            {hoveredCell && (
              <span className="text-xs font-mono text-text-secondary">
                [{regionList[hoveredCell.i]?.name ?? hoveredCell.i}] →
                [{regionList[hoveredCell.j]?.name ?? hoveredCell.j}] = {hoveredCell.w.toFixed(4)}
              </span>
            )}
          </div>
          <div className="card-body">
            {matrix.length === 0 ? (
              <p className="text-sm text-text-muted">Loading connectivity data…</p>
            ) : (
              <>
                {/* Gradient legend */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-text-muted">0</span>
                  <div
                    className="h-3 flex-1 rounded"
                    style={{
                      background: 'linear-gradient(to right, hsl(220,15%,12%), hsl(140,80%,35%), hsl(45,90%,45%), hsl(0,90%,55%))',
                    }}
                  />
                  <span className="text-xs text-text-muted">{maxWeight.toFixed(3)}</span>
                </div>

                {/* Matrix grid */}
                <div className="overflow-auto max-h-[520px] cursor-crosshair">
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${n}, ${cellPx}px)`,
                      gap: 1,
                    }}
                  >
                    {matrix.map((row, i) =>
                      row.map((w, j) => (
                        <div
                          key={`${i}-${j}`}
                          style={{
                            width: cellPx,
                            height: cellPx,
                            backgroundColor: weightToColor(w, maxWeight),
                          }}
                          onMouseEnter={() => setHoveredCell({ i, j, w })}
                          onMouseLeave={() => setHoveredCell(null)}
                        />
                      ))
                    )}
                  </div>
                </div>

                <p className="text-xs text-text-muted mt-3">
                  {n}×{n} matrix — {connections?.length ?? 0} non-zero connections.
                  Hover cells for region names and weight values.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
