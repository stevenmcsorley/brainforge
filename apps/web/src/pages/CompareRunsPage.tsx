import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CheckSquare, Square, GitCompare, Loader2, BarChart2, ZoomIn, ZoomOut } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell, ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/cn';

const PALETTE = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

// ─── Run Browser ────────────────────────────────────────────────────────────
function ExperimentRunGroup({ experiment, selectedIds, onToggle }: any) {
  const runs: any[] = experiment.runs ?? [];
  const completed = runs.filter((r: any) => r.status === 'completed');
  if (completed.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-1.5 bg-bg-primary/60 text-xs text-text-muted font-medium sticky top-0">
        {experiment.name}
      </div>
      {completed.map((run: any) => {
        const selected = selectedIds.includes(run.id);
        const idx = selectedIds.indexOf(run.id);
        return (
          <div
            key={run.id}
            className={cn('flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-bg-secondary/60 transition-colors', selected && 'bg-bg-secondary/40')}
            onClick={() => onToggle(run.id)}
          >
            <div className="flex-shrink-0" style={{ color: selected ? PALETTE[idx % PALETTE.length] : '#64748b' }}>
              {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </div>
            <span className="text-xs font-mono text-text-muted flex-1">{run.id.slice(0, 13)}…</span>
            <span className="text-xs text-text-muted">#{run.seed} · {(run.totalSteps ?? 0).toLocaleString()} steps</span>
            <span className="status-badge bg-accent-cyan/15 text-accent-cyan text-xs">completed</span>
          </div>
        );
      })}
    </div>
  );
}

function RunBrowser({ selectedIds, onToggle }: { selectedIds: string[]; onToggle: (id: string) => void }) {
  const { data: expData, isLoading } = useQuery({
    queryKey: ['experiments'],
    queryFn: () => api.getExperiments(1, 50),
  });
  const experiments: any[] = expData?.items ?? [];
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="text-sm font-medium">Select Runs</h2>
        <p className="text-xs text-text-muted mt-0.5">Pick 2–5 completed runs to compare</p>
      </div>
      <div className="divide-y divide-border max-h-72 overflow-y-auto">
        {isLoading && <div className="p-4 text-xs text-text-muted flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>}
        {experiments.map((exp) => (
          <ExperimentRunGroup key={exp.id} experiment={exp} selectedIds={selectedIds} onToggle={onToggle} />
        ))}
        {!isLoading && experiments.length === 0 && <p className="p-4 text-xs text-text-muted">No experiments found.</p>}
      </div>
    </div>
  );
}

// ─── Parameter diff ──────────────────────────────────────────────────────────
function getVal(run: any, key: string) {
  if (key === 'seed') return run.seed;
  if (key === 'totalSteps') return run.totalSteps;
  const cfg = run.experiment?.config ?? {};
  if (key.startsWith('config.')) return cfg[key.replace('config.', '')] ?? '—';
  const params = cfg.parameters ?? {};
  if (key.startsWith('param.')) return params[key.replace('param.', '')] ?? '—';
  return '—';
}

function ParamDiff({ runs }: { runs: any[] }) {
  const keys = ['seed', 'totalSteps', 'param.global_coupling', 'param.gain', 'param.noise_sigma', 'param.tau'];
  const labelMap: Record<string, string> = {
    'seed': 'Seed', 'totalSteps': 'Total Steps',
    'param.global_coupling': 'Global Coupling', 'param.gain': 'Gain',
    'param.noise_sigma': 'Noise σ', 'param.tau': 'τ (time constant)',
  };
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-2 pr-4 text-text-muted font-medium">Parameter</th>
          {runs.map((r, i) => (
            <th key={r.id} className="text-left py-2 px-3 font-mono" style={{ color: PALETTE[i % PALETTE.length] }}>
              {r.id.slice(0, 8)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const vals = runs.map((r) => String(getVal(r, key)));
          const allSame = vals.every((v) => v === vals[0]);
          return (
            <tr key={key} className={cn('border-b border-border/50', !allSame && 'bg-accent-amber/5')}>
              <td className="py-1.5 pr-4 text-text-muted">{labelMap[key] ?? key}</td>
              {vals.map((v, i) => (
                <td key={i} className={cn('py-1.5 px-3 font-mono', !allSame && 'font-semibold text-text-primary')}>
                  {v}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Stat bar chart ──────────────────────────────────────────────────────────
function BrainStateSummary({ runs, allMetrics, selectedIds }: { runs: any[]; allMetrics: Record<string, any[]>; selectedIds: string[] }) {
  // Compute final-state stats for each run
  const stats = selectedIds.map((id, i) => {
    const metrics = allMetrics[id] ?? [];
    if (metrics.length === 0) return null;
    // Use last 10% of data as "steady state"
    const tail = metrics.slice(Math.max(0, metrics.length - Math.ceil(metrics.length * 0.1)));
    const parse = (m: any) => typeof m.metrics === 'string' ? JSON.parse(m.metrics) : m.metrics;
    const means = tail.map((m: any) => parse(m)?.mean_activity ?? 0);
    const maxes = tail.map((m: any) => parse(m)?.max_activity ?? 0);
    const divs = tail.map((m: any) => parse(m)?.std_across_regions ?? 0);
    const stds = tail.map((m: any) => parse(m)?.std_activity ?? 0);
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const label = runs.find((r: any) => r.id === id)?.experiment?.name?.replace(/^[^\w]*/, '').slice(0, 22) ?? id.slice(0, 8);
    return {
      id, label, color: PALETTE[i % PALETTE.length],
      mean: avg(means),
      max: avg(maxes),
      divergence: avg(divs),   // std across regions — how DIFFERENT regions are from each other
      noise: avg(stds),
    };
  }).filter(Boolean) as any[];

  const metrics2 = [
    { key: 'mean', label: 'Mean Activity', desc: 'Overall brain activation level', yDomain: [0, 1] as [number, number] },
    { key: 'max', label: 'Peak Regional Activity', desc: 'Most active single region', yDomain: [0, 1] as [number, number] },
    { key: 'divergence', label: 'Regional Divergence (σ)', desc: 'How different regions are from each other — Coma≈0, Seizure>0.1', yDomain: [0, 0.25] as [number, number] },
    { key: 'noise', label: 'Temporal Noise (σ)', desc: 'Run-to-run fluctuation — noisy states have high values', yDomain: [0, 0.1] as [number, number] },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="text-sm font-medium flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4 text-accent-purple" />
          Brain State Summary
        </h2>
        <p className="text-xs text-text-muted mt-0.5">Steady-state (last 10%) values compared across runs</p>
      </div>
      <div className="card-body grid grid-cols-2 gap-6">
        {metrics2.map((m) => (
          <div key={m.key}>
            <div className="text-xs font-medium text-text-secondary mb-1">{m.label}</div>
            <div className="text-xs text-text-muted mb-2">{m.desc}</div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={stats} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={9} angle={-20} textAnchor="end" interval={0} />
                <YAxis stroke="#64748b" fontSize={9} domain={m.yDomain} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #1e293b', borderRadius: 4, fontSize: 11 }}
                  formatter={(v: number) => v.toFixed(4)}
                />
                <Bar dataKey={m.key} radius={[3, 3, 0, 0]}>
                  {stats.map((s, idx) => <Cell key={idx} fill={s.color} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export function CompareRunsPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [transientZoom, setTransientZoom] = useState(false);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev,
    );
  };

  const compareMutation = useMutation({
    mutationFn: () => api.compareRuns(selectedIds),
  });

  const runs: any[] = compareMutation.data?.runs ?? [];
  const allMetrics: Record<string, any[]> = compareMutation.data?.metrics ?? {};

  // Build merged chart data: one entry per step, one key per run
  const chartData = useMemo(() => {
    if (!compareMutation.data?.metrics) return [];
    const merged: Record<number, any> = {};

    for (const [runId, metrics] of Object.entries(allMetrics)) {
      const label = runId.slice(0, 8);
      for (const m of metrics) {
        const step = m.step as number;
        if (!merged[step]) merged[step] = { step };
        const parsed = typeof m.metrics === 'string' ? JSON.parse(m.metrics) : m.metrics;
        merged[step][`${label}_mean`] = parsed?.mean_activity ?? null;
        merged[step][`${label}_max`] = parsed?.max_activity ?? null;
        merged[step][`${label}_divergence`] = parsed?.std_across_regions ?? null;
        merged[step][`${label}_std`] = parsed?.std_activity ?? null;
      }
    }
    return Object.values(merged).sort((a, b) => a.step - b.step);
  }, [compareMutation.data]);

  // Transient zoom: show only first N steps
  const displayData = useMemo(() => {
    if (!transientZoom) return chartData;
    const cutoff = Math.ceil(chartData.length * 0.15);
    return chartData.slice(0, cutoff);
  }, [chartData, transientZoom]);

  const tooltipStyle = { backgroundColor: '#111827', border: '1px solid #1e293b', borderRadius: 4, fontSize: 11 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-accent-purple" />
          Compare Runs
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Overlay metric traces across simulation runs
        </p>
      </div>

      <RunBrowser selectedIds={selectedIds} onToggle={toggle} />

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {selectedIds.map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono"
              style={{ backgroundColor: `${PALETTE[i % PALETTE.length]}20`, color: PALETTE[i % PALETTE.length], border: `1px solid ${PALETTE[i % PALETTE.length]}40` }}>
              {id.slice(0, 10)}
              <button className="ml-1 opacity-70 hover:opacity-100" onClick={() => toggle(id)}>×</button>
            </span>
          ))}
          <button className="btn-primary flex items-center gap-2 ml-auto"
            disabled={selectedIds.length < 2 || compareMutation.isPending}
            onClick={() => compareMutation.mutate()}>
            {compareMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
            {compareMutation.isPending ? 'Loading…' : `Compare ${selectedIds.length} runs`}
          </button>
        </div>
      )}

      {compareMutation.isError && (
        <div className="card card-body text-accent-red text-sm">{(compareMutation.error as Error).message}</div>
      )}

      {chartData.length > 0 && (
        <>
          {/* ── Brain State Summary (most informative first) ── */}
          <BrainStateSummary runs={runs} allMetrics={allMetrics} selectedIds={selectedIds} />

          {/* ── Chart controls ── */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTransientZoom(!transientZoom)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors',
                transientZoom
                  ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue'
                  : 'bg-transparent border-border text-text-muted hover:text-text-primary')}
            >
              {transientZoom ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
              {transientZoom ? 'Show full run' : 'Zoom: transient (first 15%)'}
            </button>
            <span className="text-xs text-text-muted">
              {transientZoom ? 'Showing onset dynamics — where the brain reaches its attractor' : 'Showing full run — toggle zoom to see the dramatic onset'}
            </span>
          </div>

          {/* ── Mean activity overlay ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-sm font-medium">Mean Activity — Overlay</h2>
              <p className="text-xs text-text-muted">Mean neural activity per timestep · flat at the right = steady state reached</p>
            </div>
            <div className="card-body h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="step" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[0, 1]} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v?.toFixed(4)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {selectedIds.map((id, i) => (
                    <Line key={id} type="monotone" dataKey={`${id.slice(0, 8)}_mean`}
                      name={runs.find((r: any) => r.id === id)?.experiment?.name?.slice(0, 30) ?? id.slice(0, 8)}
                      stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Regional divergence (KEY chart) ── */}
          <div className="card" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
            <div className="card-header">
              <h2 className="text-sm font-medium flex items-center gap-2">
                Regional Divergence (σ across regions)
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent-purple/15 text-accent-purple font-normal">Most informative</span>
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                How different regions are from each other at each timestep · Coma ≈ 0 (all flat) · Seizure/NDE &gt; 0.05 (regions diverge)
              </p>
            </div>
            <div className="card-body h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="step" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[0, 'auto']} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v?.toFixed(5)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#334155" />
                  {selectedIds.map((id, i) => (
                    <Line key={id} type="monotone" dataKey={`${id.slice(0, 8)}_divergence`}
                      name={runs.find((r: any) => r.id === id)?.experiment?.name?.slice(0, 30) ?? id.slice(0, 8)}
                      stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Max activity overlay ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-sm font-medium">Peak Regional Activity — Overlay</h2>
              <p className="text-xs text-text-muted">Most active single region per timestep</p>
            </div>
            <div className="card-body h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="step" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[0, 1]} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v?.toFixed(4)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {selectedIds.map((id, i) => (
                    <Line key={id} type="monotone" dataKey={`${id.slice(0, 8)}_max`}
                      name={runs.find((r: any) => r.id === id)?.experiment?.name?.slice(0, 30) ?? id.slice(0, 8)}
                      stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ── Parameter diff ── */}
      {runs.length >= 2 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-medium">Parameter Diff</h2>
            <p className="text-xs text-text-muted">Highlighted rows differ between runs</p>
          </div>
          <div className="card-body"><ParamDiff runs={runs} /></div>
        </div>
      )}

      {/* ── Run cards ── */}
      {runs.length > 0 && (
        <div className={cn('grid gap-4', runs.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {runs.map((run: any, i: number) => (
            <div key={run.id} className="card card-body" style={{ borderLeftColor: PALETTE[i % PALETTE.length], borderLeftWidth: 3 }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                <span className="text-xs font-mono text-text-muted flex-1">{run.id.slice(0, 14)}…</span>
              </div>
              <div className="space-y-1 text-xs">
                {[
                  ['Experiment', run.experiment?.name],
                  ['Status', run.status],
                  ['Seed', run.seed],
                  ['Steps', run.totalSteps?.toLocaleString()],
                  ['Coupling', run.experiment?.config?.parameters?.global_coupling ?? '—'],
                  ['Gain', run.experiment?.config?.parameters?.gain ?? '—'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between">
                    <span className="text-text-muted">{k}</span>
                    <span className="text-text-secondary font-mono">{v ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!compareMutation.data && selectedIds.length < 2 && (
        <div className="card card-body text-center py-12">
          <GitCompare className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted">Select at least 2 completed runs above to compare.</p>
          <p className="text-xs text-text-muted mt-2">Tip: try Coma + NDE for the most dramatic contrast</p>
        </div>
      )}
    </div>
  );
}
