import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { api } from '@/lib/api';
import { subscribeToRun } from '@/lib/websocket';
import { EnvironmentRegistry, EnvironmentType } from '../components/environments';
import { cn } from '@/lib/cn';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { Pause, Play, Square, Activity, Brain, BarChart2, Eye, EyeOff, Gamepad } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MetricPoint {
  step: number;
  mean_activity: number;
  std_activity: number;
  max_activity: number;
  mean_weight?: number;
}

interface RegionCoord {
  id: string;
  name: string;
  hemisphere: string | null;
  atlasIndex: number;
  coordX: number | null;
  coordY: number | null;
  coordZ: number | null;
}

// ─── Live region node ─────────────────────────────────────────────────────────
function LiveRegionNode({
  position, activity, name, hovered, onHover,
}: {
  position: [number, number, number];
  activity: number;
  name: string;
  hovered: boolean;
  onHover: (name: string | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);

  // Plasma colormap sampled live
  const color = useMemo(() => {
    const t = Math.max(0, Math.min(1, activity));
    const stops: [number, number, number][] = [
      [0.05, 0.03, 0.53], [0.56, 0.09, 0.65],
      [0.89, 0.32, 0.29], [0.99, 0.65, 0.11], [0.94, 0.97, 0.13],
    ];
    const idx = t * (stops.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, stops.length - 1);
    const f = idx - lo;
    return new THREE.Color(
      stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f,
      stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f,
      stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f,
    );
  }, [activity]);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const pulse = 1 + activity * 0.2 * Math.sin(clock.elapsedTime * (4 + activity * 8));
      meshRef.current.scale.setScalar(hovered ? 2.0 : pulse);
      // Update material emissive dynamically
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + activity * 1.2;
    }
  });

  const size = 0.6 + activity * 1.2;

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerEnter={(e) => { e.stopPropagation(); onHover(name); }}
      onPointerLeave={() => onHover(null)}
    >
      <sphereGeometry args={[size, 12, 12]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.6 + activity * 1.0}
        metalness={0.1}
        roughness={0.5}
      />
    </mesh>
  );
}

// ─── Live 3D brain scene ─────────────────────────────────────────────────────
function LiveBrainScene({
  regions,
  regionActivity,
}: {
  regions: RegionCoord[];
  regionActivity: number[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const SCALE = 0.12;

  const nodes = useMemo(() => {
    return regions
      .filter(r => r.coordX !== null)
      .map(r => ({
        ...r,
        pos: [
          (r.coordX ?? 0) * SCALE * 10,
          (r.coordZ ?? 0) * SCALE * 10,
          -(r.coordY ?? 0) * SCALE * 10,
        ] as [number, number, number],
        activity: regionActivity[r.atlasIndex] ?? 0,
      }));
  }, [regions, regionActivity, SCALE]);

  return (
    <>


      <ambientLight intensity={0.2} />
      <pointLight position={[0, 50, 50]} intensity={1.2} color="#8080ff" />
      <pointLight position={[0, -30, -30]} intensity={0.6} color="#ff8040" />

      {nodes.map(node => (
        <LiveRegionNode
          key={node.id}
          position={node.pos}
          activity={node.activity}
          name={node.name}
          hovered={hovered === node.name}
          onHover={setHovered}
        />
      ))}

      {hovered && (
        <mesh position={[0, -14, 0]}>
          {/* just use Html from drei for tooltip would need import — skip for now */}
        </mesh>
      )}

      <OrbitControls
        enableDamping dampingFactor={0.08}
        rotateSpeed={0.5}
        autoRotate={regionActivity.length === 0}
        autoRotateSpeed={0.4}
      />
    </>
  );
}

// ─── Fetch persisted metrics ──────────────────────────────────────────────────
async function fetchPersistedMetrics(runId: string): Promise<MetricPoint[]> {
  try {
    const data = await api.getRunMetrics(runId);
    if (!Array.isArray(data)) return [];
    return data.map((m: any) => ({
      step: m.step,
      mean_activity: m.metrics?.mean_activity ?? m.meanActivity ?? 0,
      std_activity: m.metrics?.std_activity ?? m.stdActivity ?? 0,
      max_activity: m.metrics?.max_activity ?? m.maxActivity ?? 0,
      mean_weight: m.metrics?.mean_weight ?? m.meanWeight,
    }));
  } catch { return []; }
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function LiveMonitorPage() {
  const { runId } = useParams<{ runId: string }>();
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [regionActivity, setRegionActivity] = useState<number[]>([]);
  const [status, setStatus] = useState<string>('unknown');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [historicalLoaded, setHistoricalLoaded] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const [showPong, setShowPong] = useState(false);

  const { data: run } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRun(runId!),
    enabled: !!runId,
  });

  // Fetch region coordinates (for 3D view)
  const { data: mapData } = useQuery({
    queryKey: ['activity-map', runId],
    queryFn: async () => {
      const r = await fetch(`/api/runs/${runId}/activity-map`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!runId && show3D,
  });

  const regions: RegionCoord[] = useMemo(
    () => (mapData?.regions ?? []).filter((r: any) => r.coordX !== null),
    [mapData],
  );

  useEffect(() => {
    if (run) { setStatus(run.status); setProgress(run.progress); }
  }, [run]);

  const isTerminal = ['completed', 'failed', 'cancelled'].includes(status);

  // Load historical metrics for completed runs
  useEffect(() => {
    if (!runId || !isTerminal || historicalLoaded) return;
    fetchPersistedMetrics(runId).then(pts => {
      if (pts.length > 0) setMetrics(pts);
      setHistoricalLoaded(true);
    });
  }, [runId, isTerminal, historicalLoaded]);

  // Live WebSocket subscription
  useEffect(() => {
    if (!runId) return;
    const unsub = subscribeToRun(runId, (event: any) => {
      switch (event.type) {
        case 'run_progress':
          setProgress(event.progress);
          setElapsed(event.elapsed);
          break;
        case 'run_metric':
          setMetrics(prev => {
            const next = [...prev, {
              step: event.step,
              mean_activity: event.metrics.mean_activity,
              std_activity: event.metrics.std_activity,
              max_activity: event.metrics.max_activity,
              mean_weight: event.metrics.mean_weight,
            }];
            return next.length > 500 ? next.slice(-500) : next;
          });
          if (event.regionActivity?.length) setRegionActivity(event.regionActivity);
          break;
        case 'run_started':
          setStatus('running');
          break;
        case 'run_completed':
          setStatus('completed');
          setProgress(1);
          setTimeout(() => {
            fetchPersistedMetrics(runId).then(pts => { if (pts.length > 0) setMetrics(pts); });
          }, 1500);
          break;
        case 'run_error':
          if (event.fatal) setStatus('failed');
          break;
      }
    });
    return unsub;
  }, [runId]);

  const handleCommand = useCallback(async (command: any) => {
    if (!runId) return;
    await api.sendRunCommand(runId, command);
    if (command === 'pause') setStatus('paused');
    if (command === 'resume') setStatus('running');
    if (command === 'stop') setStatus('cancelled');
  }, [runId]);

  if (!runId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Live Monitor</h1>
        <p className="text-sm text-text-muted">Select a run from an experiment to monitor in real-time.</p>
      </div>
    );
  }

  const lastMetric = metrics[metrics.length - 1];
  const summaryMean = metrics.length > 0
    ? (metrics.reduce((a, m) => a + m.mean_activity, 0) / metrics.length).toFixed(4)
    : lastMetric?.mean_activity?.toFixed(4) ?? '-';
  const summaryMax = metrics.length > 0
    ? Math.max(...metrics.map(m => m.max_activity)).toFixed(4)
    : '-';
  const summaryStd = lastMetric?.std_activity?.toFixed(4) ?? '-';
  const tooltipStyle = { backgroundColor: '#111827', border: '1px solid #1e293b', borderRadius: 4, fontSize: 11 };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent-green" />
            {isTerminal ? 'Run Results' : 'Live Monitor'}
          </h1>
          <p className="text-xs text-text-muted font-mono mt-0.5">Run: {runId?.slice(0, 12)}…</p>
        </div>
        <div className="flex items-center gap-2">
          {run?.experiment?.config?.environment && (
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPong(!showPong); if (!showPong) setShow3D(false); }}
                className={`p-2 rounded border transition-colors ${showPong ? 'bg-accent-purple/20 border-accent-purple/40 text-accent-purple' : 'bg-bg-secondary/20 border-border/50 text-text-muted hover:text-text-primary'}`}
                title={`Play Interactive Task`}
              >
                <Gamepad className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setShow3D(!show3D); if (!show3D) setShowPong(false); }}
              className={`p-2 rounded border transition-colors ${show3D ? 'bg-accent-cyan/20 border-accent-cyan/40 text-accent-cyan' : 'bg-bg-secondary/20 border-border/50 text-text-muted hover:text-text-primary'}`}
              title="Toggle 3D Brain View"
            >{show3D ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          {isTerminal && (
            <Link to={`/activity-map/${runId}`} className="btn-primary flex items-center gap-1.5 text-sm">
              <Brain className="w-4 h-4" /> Brain Activity Map
            </Link>
          )}
          {status === 'running' && (
            <>
              <button className="btn-secondary flex items-center gap-1.5" onClick={() => handleCommand('pause')}>
                <Pause className="w-3.5 h-3.5" /> Pause
              </button>
              <button className="btn-danger flex items-center gap-1.5" onClick={() => handleCommand('stop')}>
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            </>
          )}
          {status === 'paused' && (
            <button className="btn-primary flex items-center gap-1.5" onClick={() => handleCommand('resume')}>
              <Play className="w-3.5 h-3.5" /> Resume
            </button>
          )}
          <span className={cn(
            'status-badge',
            status === 'running' ? 'bg-accent-green/20 text-accent-green'
              : status === 'completed' ? 'bg-accent-cyan/20 text-accent-cyan'
                : status === 'paused' ? 'bg-accent-amber/20 text-accent-amber'
                  : status === 'failed' ? 'bg-accent-red/20 text-accent-red'
                    : 'bg-text-muted/20 text-text-muted',
          )}>
            {status}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      {showPong && run?.experiment?.config?.environment ? (() => {
        const envConfig = run.experiment.config.environment as any;
        const EnvComponent = EnvironmentRegistry[envConfig.type as EnvironmentType];
        
        if (!EnvComponent) {
          return (
             <div className="h-[400px] flex items-center justify-center bg-[#04060e] border border-border/50 rounded-b-xl border-t-0 text-text-muted">
                <Activity className="w-6 h-6 mr-2 opacity-50" /> Environment "{envConfig.type}" not found in registry.
             </div>
          );
        }

        return (
          <div className="h-[400px]">
            <EnvComponent
              runId={runId as string}
              regionActivity={regionActivity}
              onEmitCommand={handleCommand}
              modelName={run?.experiment?.model?.name}
              sensoryNodes={envConfig.sensoryNodes || [1]}
              motorNodes={envConfig.motorNodes || [30]}
              onReward={(val: number) => handleCommand({ command: 'reward', value: val })}
            />
          </div>
        );
      })() : show3D ? (
        <div className="card overflow-hidden" style={{ height: 400 }}>
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-accent-purple" />
              Live 3D Brain
              {status === 'running' && (
                <span className="flex items-center gap-1 text-xs text-accent-green font-normal">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                  Live · {regionActivity.length} regions
                </span>
              )}
              {regionActivity.length === 0 && status !== 'running' && (
                <span className="text-xs text-text-muted font-normal ml-1">
                  {isTerminal ? '— run completed' : '— waiting for data'}
                </span>
              )}
            </h2>
            <span className="text-xs text-text-muted">Orbit · Scroll zoom · Colors = activity level</span>
          </div>
          <div style={{ height: 340, background: '#04060e' }}>
            {regions.length > 0 ? (
              <Canvas camera={{ position: [0, 20, 65], fov: 50 }} style={{ background: '#04060e' }}>
                <Suspense fallback={null}>
                  <LiveBrainScene regions={regions} regionActivity={regionActivity} />
                </Suspense>
              </Canvas>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-text-muted">
                <Brain className="w-10 h-10 opacity-20" />
                {regions.length === 0 && mapData === null
                  ? 'Loading region coordinates…'
                  : 'No coordinate data for this model'}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Activity Chart (Always Visible) */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-accent-blue" />
            Activity Over Time
            {isTerminal && metrics.length > 0 && (
              <span className="text-xs text-text-muted font-normal ml-1">(historical)</span>
            )}
          </h2>
        </div>
        <div className="card-body h-64">
          {metrics.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="step" stroke="#64748b" fontSize={10}
                  label={{ value: 'Step', position: 'insideBottomRight', offset: -4, fill: '#64748b', fontSize: 10 }} />
                <YAxis stroke="#64748b" fontSize={10} domain={[0, 'auto']} yAxisId="left" />
                <YAxis stroke="#ec4899" fontSize={10} orientation="right" domain={['auto', 'auto']} yAxisId="right" hide={!metrics.some(m => m.mean_weight !== undefined)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => typeof v === 'number' ? v.toFixed(4) : v} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" yAxisId="left" dataKey="mean_activity" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="Mean" />
                <Line type="monotone" yAxisId="left" dataKey="max_activity" stroke="#f59e0b" strokeWidth={1} dot={false} name="Max" opacity={0.7} />
                <Line type="monotone" yAxisId="left" dataKey="std_activity" stroke="#a855f7" strokeWidth={1} dot={false} name="Std" opacity={0.6} />
                {metrics.some(m => m.mean_weight !== undefined) && (
                  <Line type="monotone" yAxisId="right" dataKey="mean_weight" stroke="#ec4899" strokeWidth={2} dot={false} name="Mean Weight" />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-text-muted">
              {isTerminal
                ? <><span>Loading historical data…</span><span className="text-xs opacity-60">Fetching from database</span></>
                : <><span>Waiting for telemetry…</span><span className="text-xs opacity-60">Updates appear as the simulation runs</span></>
              }
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="card card-body">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted">Progress</span>
          <span className="text-xs font-mono text-text-secondary">
            {(progress * 100).toFixed(1)}%
            {!isTerminal && ` | ${elapsed.toFixed(1)}s elapsed`}
            {isTerminal && metrics.length > 0 && ` | ${metrics.length} data points`}
          </span>
        </div>
        <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300',
              status === 'running' ? 'bg-accent-green' : 'bg-accent-blue')}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card card-body">
          <p className="label">Mean Activity</p>
          <p className="metric-value mt-1 text-accent-cyan">{summaryMean}</p>
          {isTerminal && metrics.length > 0 && <p className="text-xs text-text-muted mt-1">avg over run</p>}
        </div>
        <div className="card card-body">
          <p className="label">Std Activity</p>
          <p className="metric-value mt-1 text-accent-purple">{summaryStd}</p>
          {isTerminal && <p className="text-xs text-text-muted mt-1">last timestep</p>}
        </div>
        <div className="card card-body">
          <p className="label">Peak Activity</p>
          <p className="metric-value mt-1 text-accent-amber">{summaryMax}</p>
        </div>
        <div className="card card-body">
          <p className="label">Data Points</p>
          <p className="metric-value mt-1">{metrics.length}</p>
        </div>
      </div>

      {/* Region snapshot (live heatmap) */}
      {regionActivity.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-medium flex items-center gap-1.5">
              Region Activity Snapshot
              <span className="text-xs text-text-muted font-normal">({regionActivity.length} regions · live)</span>
            </h2>
          </div>
          <div className="card-body">
            <div className="flex flex-wrap gap-0.5">
              {regionActivity.map((value, i) => (
                <div key={i}
                  className="w-3 h-3 rounded-sm transition-colors duration-300"
                  style={{ backgroundColor: `hsl(${200 - value * 160}, 80%, ${20 + value * 50}%)` }}
                  title={`Region ${i}: ${value.toFixed(3)}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Brain Activity Map CTA */}
      {isTerminal && (
        <div className="card card-body flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">🧠 Full Brain Activity Map</p>
            <p className="text-xs text-text-muted mt-0.5">
              3D brain · colormaps · flat projection · ranked region list
            </p>
          </div>
          <Link to={`/activity-map/${runId}`} className="btn-primary flex items-center gap-1.5 text-sm shrink-0">
            <Brain className="w-4 h-4" /> Open Activity Map →
          </Link>
        </div>
      )}
    </div>
  );
}
