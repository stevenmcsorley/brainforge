import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Html, Stars } from '@react-three/drei';
import { Suspense, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegionData {
    id: string;
    name: string;
    abbreviation: string | null;
    hemisphere: string | null;
    atlasIndex: number;
    coordX: number | null;
    coordY: number | null;
    coordZ: number | null;
    meanActivity: number | null;
    maxActivity: number | null;
    stdActivity: number | null;
    finalActivity: number | null;
}

interface ActivityMapData {
    runId: string;
    experimentName: string;
    modelName: string;
    hasData: boolean;
    regions: RegionData[];
}

// ─── Color mapping ────────────────────────────────────────────────────────────

const COLORMAPS = {
    plasma: [[0.05, 0.03, 0.53], [0.56, 0.09, 0.65], [0.89, 0.32, 0.29], [0.99, 0.65, 0.11], [0.94, 0.97, 0.13]],
    viridis: [[0.27, 0.00, 0.33], [0.17, 0.38, 0.53], [0.13, 0.65, 0.46], [0.47, 0.82, 0.26], [0.99, 0.91, 0.14]],
    hot: [[0.0, 0.0, 0.0], [0.5, 0.0, 0.0], [1.0, 0.5, 0.0], [1.0, 1.0, 0.0], [1.0, 1.0, 1.0]],
    coolwarm: [[0.02, 0.19, 0.68], [0.39, 0.57, 0.90], [0.86, 0.86, 0.86], [0.93, 0.46, 0.33], [0.71, 0.02, 0.15]],
    rainbow: [[0.0, 0.0, 1.0], [0.0, 1.0, 1.0], [0.0, 1.0, 0.0], [1.0, 1.0, 0.0], [1.0, 0.0, 0.0]],
} as const;

type ColormapName = keyof typeof COLORMAPS;

function sampleColormap(value: number, name: ColormapName): THREE.Color {
    const stops = COLORMAPS[name];
    const t = Math.max(0, Math.min(1, value));
    const idx = t * (stops.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, stops.length - 1);
    const frac = idx - lo;
    const r = stops[lo][0] + (stops[hi][0] - stops[lo][0]) * frac;
    const g = stops[lo][1] + (stops[hi][1] - stops[lo][1]) * frac;
    const b = stops[lo][2] + (stops[hi][2] - stops[lo][2]) * frac;
    return new THREE.Color(r, g, b);
}

// ─── 3D Region Node ──────────────────────────────────────────────────────────

function RegionNode({
    region, activityValue, scale, colormap, hovered, onHover,
}: {
    region: RegionData;
    activityValue: number;
    scale: number;
    colormap: ColormapName;
    hovered: string | null;
    onHover: (id: string | null) => void;
}) {
    const color = sampleColormap(activityValue, colormap);
    const glowColor = color.clone().multiplyScalar(1.4);
    const isHovered = hovered === region.id;
    const size = 0.8 + activityValue * 1.6;
    const x = (region.coordX ?? 0) * scale;
    const y = (region.coordZ ?? 0) * scale;  // Z in MNI = superior-inferior → Y in 3D
    const z = -(region.coordY ?? 0) * scale; // Y in MNI = anterior-posterior → -Z in 3D

    return (
        <group position={[x, y, z]}>
            {/* Glow sphere */}
            <Sphere args={[size * 1.5, 8, 8]}
                onPointerEnter={() => onHover(region.id)}
                onPointerLeave={() => onHover(null)}>
                <meshStandardMaterial
                    color={glowColor}
                    transparent opacity={isHovered ? 0.35 : 0.12}
                    emissive={glowColor} emissiveIntensity={0.6}
                />
            </Sphere>
            {/* Core sphere */}
            <Sphere args={[size, 16, 16]}>
                <meshStandardMaterial
                    color={color}
                    emissive={color} emissiveIntensity={0.5 + activityValue * 0.8}
                    metalness={0.2} roughness={0.4}
                />
            </Sphere>
            {/* Tooltip */}
            {isHovered && (
                <Html distanceFactor={60} style={{ pointerEvents: 'none' }}>
                    <div style={{
                        background: 'rgba(8,12,28,0.95)',
                        border: '1px solid rgba(120,180,255,0.4)',
                        borderRadius: 8, padding: '8px 12px',
                        color: '#e0e8ff', fontSize: 12, whiteSpace: 'nowrap',
                        backdropFilter: 'blur(8px)',
                    }}>
                        <div style={{ fontWeight: 700, color: '#a8d8ff', marginBottom: 4 }}>
                            {region.name}
                        </div>
                        <div style={{ opacity: 0.8 }}>
                            {region.hemisphere ?? 'unknown'} hemisphere
                        </div>
                        <div style={{ color: color.getStyle(), marginTop: 4 }}>
                            Mean: {(activityValue * 100).toFixed(1)}%
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}

// ─── Connectivity lines ───────────────────────────────────────────────────────

function ConnectivityLines({ regions, scale, show }: {
    regions: RegionData[];
    scale: number;
    show: boolean;
}) {
    if (!show) return null;

    const lines = useMemo(() => {
        const result = [];
        const n = regions.length;
        // Show only strong homologous connections (left↔right same name)
        for (let i = 0; i < n; i++) {
            const r = regions[i];
            if (r.hemisphere !== 'left') continue;
            const mirrorName = r.name.replace(/^L[_\-.]/, 'R$1');
            const pair = regions.find(x => x.name === mirrorName || x.abbreviation === (r.abbreviation ?? '').replace(/^L/, 'R'));
            if (!pair) continue;
            const aPos: [number, number, number] = [
                (r.coordX ?? 0) * scale, (r.coordZ ?? 0) * scale, -(r.coordY ?? 0) * scale,
            ];
            const bPos: [number, number, number] = [
                (pair.coordX ?? 0) * scale, (pair.coordZ ?? 0) * scale, -(pair.coordY ?? 0) * scale,
            ];
            const avgAct = ((r.meanActivity ?? 0) + (pair.meanActivity ?? 0)) / 2;
            result.push({ from: aPos, to: bPos, strength: avgAct });
        }
        return result;
    }, [regions, scale]);

    return (
        <>
            {lines.map((l, i) => (
                <Line
                    key={i}
                    points={[l.from, l.to]}
                    color={new THREE.Color(0.3 + l.strength * 0.5, 0.5 + l.strength * 0.3, 1.0)}
                    lineWidth={0.3 + l.strength * 1.2}
                    transparent
                    opacity={0.15 + l.strength * 0.25}
                />
            ))}
        </>
    );
}

// ─── 2D Flat Map (coronal projection) ────────────────────────────────────────

function FlatMap({ regions, colormap, metric }: {
    regions: RegionData[];
    colormap: ColormapName;
    metric: 'mean' | 'max' | 'final';
}) {
    const svgW = 700, svgH = 380;
    const padding = 40;
    const valid = regions.filter(r => r.coordX !== null && r.coordY !== null);
    if (!valid.length) return <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>No coordinate data</div>;

    const xs = valid.map(r => r.coordX!);
    const ys = valid.map(r => r.coordY!);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const toSvg = (x: number, y: number) => ({
        cx: padding + ((x - minX) / (maxX - minX)) * (svgW - 2 * padding),
        cy: svgH - padding - ((y - minY) / (maxY - minY)) * (svgH - 2 * padding),
    });

    const getActivity = (r: RegionData) =>
        metric === 'mean' ? (r.meanActivity ?? 0)
            : metric === 'max' ? (r.maxActivity ?? 0)
                : (r.finalActivity ?? 0);

    return (
        <svg width={svgW} height={svgH} style={{ display: 'block', margin: '0 auto' }}>
            <rect width={svgW} height={svgH} fill="#04060e" rx={12} />
            {/* Midline */}
            <line
                x1={toSvg(0, minY).cx} y1={padding}
                x2={toSvg(0, minY).cx} y2={svgH - padding}
                stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="4,4"
            />
            {valid.map(r => {
                const act = getActivity(r);
                const color = sampleColormap(act, colormap);
                const { cx, cy } = toSvg(r.coordX!, r.coordY!);
                const radius = 4 + act * 8;
                return (
                    <g key={r.id}>
                        <circle cx={cx} cy={cy} r={radius * 1.8} fill={color.getStyle()} opacity={0.15} />
                        <circle cx={cx} cy={cy} r={radius} fill={color.getStyle()} opacity={0.9} />
                        <title>{r.name}: {(act * 100).toFixed(1)}%</title>
                    </g>
                );
            })}
            <text x={12} y={svgH - 8} fill="rgba(255,255,255,0.3)" fontSize={10}>
                Axial projection (X-Y plane) — hover for labels
            </text>
        </svg>
    );
}

// ─── Colorbar legend ──────────────────────────────────────────────────────────

function Colorbar({ colormap }: { colormap: ColormapName }) {
    const steps = 100;
    const stops = Array.from({ length: steps }, (_, i) => {
        const t = i / (steps - 1);
        return sampleColormap(t, colormap).getStyle();
    });
    const gradient = `linear-gradient(to right, ${stops.join(',')})`;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <span style={{ color: '#888', fontSize: 11 }}>0%</span>
            <div style={{ flex: 1, height: 14, borderRadius: 7, background: gradient, border: '1px solid rgba(255,255,255,0.1)' }} />
            <span style={{ color: '#888', fontSize: 11 }}>100%</span>
        </div>
    );
}

// ─── Heatmap strip ────────────────────────────────────────────────────────────

function HeatmapStrip({ regions, colormap, metric }: {
    regions: RegionData[];
    colormap: ColormapName;
    metric: 'mean' | 'max' | 'final';
}) {
    const getActivity = (r: RegionData) =>
        metric === 'mean' ? (r.meanActivity ?? 0)
            : metric === 'max' ? (r.maxActivity ?? 0)
                : (r.finalActivity ?? 0);

    return (
        <div style={{ display: 'flex', height: 36, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
            {regions.map(r => {
                const act = getActivity(r);
                const color = sampleColormap(act, colormap).getStyle();
                return (
                    <div key={r.id} title={`${r.name}: ${(act * 100).toFixed(1)}%`}
                        style={{ flex: 1, background: color, cursor: 'default' }} />
                );
            })}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ActivityMapPage() {
    const { runId } = useParams<{ runId: string }>();
    const [colormap, setColormap] = useState<ColormapName>('plasma');
    const [metric, setMetric] = useState<'mean' | 'max' | 'final'>('mean');
    const [hovered, setHovered] = useState<string | null>(null);
    const [showEdges, setShowEdges] = useState(true);
    const [view, setView] = useState<'3d' | 'flat' | 'strip'>('3d');
    const SCALE = 0.12;

    // Also fetch the run itself so we know its status independent of activityMap presence
    const { data: runInfo } = useQuery<{ status: string; progress: number }>({
        queryKey: ['run-status', runId],
        queryFn: async () => {
            const r = await fetch(`/api/runs/${runId}`);
            if (!r.ok) throw new Error(await r.text());
            const d = await r.json();
            return { status: d.status, progress: d.progress };
        },
        enabled: !!runId,
        refetchInterval: 5000,
    });

    const isTerminalRun = ['completed', 'failed', 'cancelled'].includes(runInfo?.status ?? '');

    const { data, isLoading, error } = useQuery<ActivityMapData>({
        queryKey: ['activity-map', runId],
        queryFn: async () => {
            const r = await fetch(`/api/runs/${runId}/activity-map`);
            if (!r.ok) throw new Error(await r.text());
            return r.json();
        },
        enabled: !!runId,
        // Only keep polling if run is still active AND no data yet
        refetchInterval: (q) => (!q.state.data?.hasData && !isTerminalRun ? 4000 : false),
    });

    const getActivity = (r: RegionData) =>
        metric === 'mean' ? (r.meanActivity ?? 0)
            : metric === 'max' ? (r.maxActivity ?? 0)
                : (r.finalActivity ?? 0);

    const hasCoords = data?.regions?.some(r => r.coordX !== null) ?? false;

    if (isLoading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#a0b4d0' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
                <div>Loading activity map…</div>
            </div>
        </div>
    );

    if (error) return (
        <div style={{ padding: 40, color: '#f87171' }}>
            Error loading activity map: {String(error)}
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#04060e', color: '#d0dff0', fontFamily: 'Inter, sans-serif' }}>
            {/* Header */}
            <div style={{
                padding: '20px 32px', borderBottom: '1px solid rgba(120,160,255,0.12)',
                background: 'rgba(10,16,40,0.8)', backdropFilter: 'blur(12px)',
                display: 'flex', alignItems: 'center', gap: 20,
            }}>
                <Link to="/experiments" style={{ color: '#6090c0', textDecoration: 'none', fontSize: 13 }}>← Experiments</Link>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#c8daff' }}>
                        🧠 Brain Activity Map
                    </div>
                    <div style={{ fontSize: 12, color: '#88a0c0', marginTop: 2 }}>
                        {data?.experimentName} · {data?.modelName}
                    </div>
                </div>
                {!data?.hasData && !isTerminalRun && (
                    <div style={{
                        background: 'rgba(255,200,50,0.12)', border: '1px solid rgba(255,200,50,0.3)',
                        borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#ffd060',
                    }}>
                        ⏳ Run in progress — map will appear when complete
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', height: 'calc(100vh - 65px)' }}>
                {/* Sidebar controls */}
                <div style={{
                    width: 260, padding: 24, borderRight: '1px solid rgba(120,160,255,0.10)',
                    background: 'rgba(8,12,28,0.6)', overflowY: 'auto',
                    display: 'flex', flexDirection: 'column', gap: 20,
                }}>
                    {/* View toggle */}
                    <div>
                        <label style={{ fontSize: 11, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 1 }}>View</label>
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            {(['3d', 'flat', 'strip'] as const).map(v => (
                                <button key={v} onClick={() => setView(v)} style={{
                                    flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    background: view === v ? 'rgba(80,120,220,0.3)' : 'rgba(255,255,255,0.04)',
                                    border: view === v ? '1px solid rgba(80,140,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                    color: view === v ? '#a0c8ff' : '#607080',
                                }}>
                                    {v === '3d' ? '3D' : v === 'flat' ? 'Flat' : 'Strip'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Metric */}
                    <div>
                        <label style={{ fontSize: 11, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 1 }}>Activity Metric</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                            {[
                                { id: 'mean', label: 'Mean Activity' },
                                { id: 'max', label: 'Peak Activity' },
                                { id: 'final', label: 'Final State' },
                            ].map(m => (
                                <button key={m.id} onClick={() => setMetric(m.id as any)} style={{
                                    padding: '7px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', textAlign: 'left',
                                    background: metric === m.id ? 'rgba(80,120,220,0.25)' : 'transparent',
                                    border: metric === m.id ? '1px solid rgba(80,140,255,0.35)' : '1px solid transparent',
                                    color: metric === m.id ? '#a0c8ff' : '#607080',
                                }}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Colormap */}
                    <div>
                        <label style={{ fontSize: 11, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 1 }}>Colormap</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                            {(Object.keys(COLORMAPS) as ColormapName[]).map(c => {
                                const gradient = `linear-gradient(to right, ${Array.from({ length: 6 }, (_, i) => sampleColormap(i / 5, c).getStyle()).join(',')
                                    })`;
                                return (
                                    <button key={c} onClick={() => setColormap(c)} style={{
                                        padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        background: colormap === c ? 'rgba(80,120,220,0.2)' : 'transparent',
                                        border: colormap === c ? '1px solid rgba(80,140,255,0.35)' : '1px solid transparent',
                                    }}>
                                        <div style={{ width: 50, height: 10, borderRadius: 5, background: gradient, flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, color: colormap === c ? '#a0c8ff' : '#607080' }}>{c}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <Colorbar colormap={colormap} />
                    </div>

                    {/* Edge toggle (3D only) */}
                    {view === '3d' && (
                        <div>
                            <label style={{ fontSize: 11, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 1 }}>Options</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                                <input type="checkbox" checked={showEdges} onChange={e => setShowEdges(e.target.checked)}
                                    style={{ accentColor: '#4080e0' }} />
                                <span style={{ fontSize: 12, color: '#8090b0' }}>Show interhemispheric edges</span>
                            </label>
                        </div>
                    )}

                    {/* Stats */}
                    {data?.hasData && data.regions.length > 0 && (
                        <div style={{ marginTop: 'auto' }}>
                            <label style={{ fontSize: 11, color: '#6080a0', textTransform: 'uppercase', letterSpacing: 1 }}>Global Stats</label>
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {[
                                    { label: 'Regions', value: data.regions.length },
                                    { label: 'Mean Activity', value: `${(data.regions.reduce((a, r) => (a + (r.meanActivity ?? 0)), 0) / data.regions.length * 100).toFixed(1)}%` },
                                    { label: 'Peak Region', value: [...data.regions].sort((a, b) => (b.meanActivity ?? 0) - (a.meanActivity ?? 0))[0]?.abbreviation ?? '--' },
                                    { label: 'Min Region', value: [...data.regions].sort((a, b) => (a.meanActivity ?? 0) - (b.meanActivity ?? 0))[0]?.abbreviation ?? '--' },
                                ].map(s => (
                                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                        <span style={{ color: '#6080a0' }}>{s.label}</span>
                                        <span style={{ color: '#a0c8ff', fontWeight: 600 }}>{s.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Main visualization */}
                <div style={{ flex: 1, position: 'relative' }}>
                    {!data?.hasData ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
                            <div style={{ fontSize: 64 }}>{isTerminalRun ? '📊' : '⏳'}</div>
                            {isTerminalRun ? (
                                <>
                                    <div style={{ color: '#a0b0c0', fontSize: 16, fontWeight: 600 }}>No per-region data for this run</div>
                                    <div style={{ color: '#506070', fontSize: 13, maxWidth: 420, textAlign: 'center' }}>
                                        This run completed before the Brain Activity Map feature was added.
                                        Start a new run from this experiment to get the full 3D visualization.
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ color: '#6080a0', fontSize: 16 }}>Activity map will appear here once the run completes</div>
                                    <div style={{ color: '#405060', fontSize: 13 }}>Checking every 4 seconds…</div>
                                </>
                            )}
                        </div>
                    ) : view === '3d' && hasCoords ? (
                        <Canvas camera={{ position: [0, 20, 60], fov: 50 }} style={{ background: '#04060e' }}>
                            <Suspense fallback={null}>
                                <Stars radius={200} depth={100} count={2000} factor={4} />
                                <ambientLight intensity={0.3} />
                                <pointLight position={[0, 50, 50]} intensity={1.5} color="#8080ff" />
                                <pointLight position={[0, -30, -30]} intensity={0.8} color="#ff8080" />

                                <ConnectivityLines regions={data.regions} scale={SCALE * 10} show={showEdges} />

                                {data.regions.map(r => (
                                    r.coordX !== null && (
                                        <RegionNode
                                            key={r.id}
                                            region={r}
                                            activityValue={getActivity(r)}
                                            scale={SCALE * 10}
                                            colormap={colormap}
                                            hovered={hovered}
                                            onHover={setHovered}
                                        />
                                    )
                                ))}

                                <OrbitControls enablePan enableZoom enableRotate autoRotate autoRotateSpeed={0.4} />
                            </Suspense>
                        </Canvas>
                    ) : view === 'flat' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32 }}>
                            <div style={{ width: '100%' }}>
                                <div style={{ textAlign: 'center', color: '#6080a0', fontSize: 12, marginBottom: 16 }}>
                                    Axial projection — X axis: lateral ↔ · Y axis: anterior–posterior ↕
                                </div>
                                <FlatMap regions={data.regions} colormap={colormap} metric={metric} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: 40 }}>
                            <div style={{ color: '#8090b0', fontSize: 13, marginBottom: 8 }}>
                                All {data.regions.length} regions ordered by atlas index. Color = activity level.
                            </div>
                            <HeatmapStrip regions={data.regions} colormap={colormap} metric={metric} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#405060' }}>
                                <span>{data.regions[0]?.name}</span>
                                <span>{data.regions[data.regions.length - 1]?.name}</span>
                            </div>
                            {/* Ranked list */}
                            <div style={{ marginTop: 32 }}>
                                <div style={{ color: '#8090b0', fontSize: 13, marginBottom: 12 }}>Regions ranked by {metric} activity</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                    {[...data.regions]
                                        .sort((a, b) => (getActivity(b)) - (getActivity(a)))
                                        .slice(0, 30)
                                        .map((r, rank) => {
                                            const act = getActivity(r);
                                            const color = sampleColormap(act, colormap);
                                            return (
                                                <div key={r.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                                    background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                }}>
                                                    <div style={{
                                                        width: 28, height: 28, borderRadius: '50%',
                                                        background: color.getStyle(),
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 10, color: '#000', fontWeight: 700, flexShrink: 0,
                                                    }}>
                                                        {rank + 1}
                                                    </div>
                                                    <div style={{ overflow: 'hidden' }}>
                                                        <div style={{ fontSize: 11, color: '#c0d4ee', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {r.abbreviation ?? r.name}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: '#6080a0' }}>{(act * 100).toFixed(1)}%</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
