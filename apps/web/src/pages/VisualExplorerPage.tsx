import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { api } from '@/lib/api';
import type { ConnectionRow } from '@/lib/wire';

// ─── Individual region node — small faceted icosahedron with emissive glow ──
function NeuronNode({
  position,
  color,
  activity,
  name,
}: {
  position: [number, number, number];
  color: string;
  activity: number;
  name: string;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  // Subtle pulse based on activity level
  useFrame(({ clock }) => {
    if (ref.current) {
      const pulse = 1 + activity * 0.15 * Math.sin(clock.elapsedTime * 3);
      ref.current.scale.setScalar(hovered ? 1.8 : pulse);
    }
  });

  const emissiveIntensity = 0.3 + activity * 0.7;

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        {/* Icosahedron looks like a neuron soma, more angular than a sphere */}
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          roughness={0.4}
          metalness={0.2}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Halo ring on hover */}
      {hovered && (
        <>
          <mesh>
            <ringGeometry args={[0.7, 0.85, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
          <Html center distanceFactor={15} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                background: 'rgba(10,14,23,0.9)',
                border: '1px solid rgba(6,182,212,0.4)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 11,
                whiteSpace: 'nowrap',
                color: '#e2e8f0',
                backdropFilter: 'blur(4px)',
              }}
            >
              {name}
              {activity > 0 && (
                <span style={{ color: '#06b6d4', marginLeft: 6 }}>
                  {activity.toFixed(3)}
                </span>
              )}
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

// ─── Connectivity edges — lines colored by weight ──────────────────────────
function ConnectivityEdges({
  regionNodes,
  connections,
  threshold,
}: {
  regionNodes: Map<string, { pos: [number, number, number]; hemisphere: string }>;
  connections: ConnectionRow[];
  threshold: number;
}) {
  // Only render edges above the weight threshold, subsample for performance
  const edges = useMemo(() => {
    const filtered = connections
      .filter((c) => c.weight >= threshold)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 600); // cap at 600 edges to keep it smooth

    return filtered.map((c) => {
      const src = regionNodes.get(c.sourceRegionId);
      const tgt = regionNodes.get(c.targetRegionId);
      if (!src || !tgt) return null;
      const t = Math.min(1, (c.weight - threshold) / (1 - threshold));
      // Strong connections: cyan (#06b6d4) → purple (#8b5cf6)
      const r = Math.round(6 + t * (139 - 6));
      const g = Math.round(182 + t * (92 - 182));
      const b = Math.round(212 + t * (246 - 212));
      return { src: src.pos, tgt: tgt.pos, weight: c.weight, color: `rgb(${r},${g},${b})`, t };
    }).filter(Boolean) as Array<{ src: [number, number, number]; tgt: [number, number, number]; weight: number; color: string; t: number }>;
  }, [connections, regionNodes, threshold]);

  return (
    <>
      {edges.map((e, i) => (
        <Line
          key={i}
          points={[e.src, e.tgt]}
          color={e.color}
          lineWidth={e.t * 1.5 + 0.2}
          transparent
          opacity={0.15 + e.t * 0.35}
        />
      ))}
    </>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────
export function VisualExplorerPage() {
  const [weightThreshold, setWeightThreshold] = useState(0.35);
  const [showEdges, setShowEdges] = useState(true);
  const [hemisphereFilter, setHemisphereFilter] = useState<'both' | 'left' | 'right'>('both');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => api.getModels(),
  });
  const models = modelsData?.items ?? [];
  const activeModel = models.find((m) => m.id === selectedModelId) ?? models[0];
  const modelId = activeModel?.id ?? null;

  // Auto-select first model on load
  useEffect(() => {
    if (!selectedModelId && models.length > 0) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId]);

  const { data: regions } = useQuery({
    queryKey: ['model-regions', modelId],
    queryFn: () => api.getModelRegions(modelId!),
    enabled: !!modelId,
  });

  const { data: connections } = useQuery({
    queryKey: ['model-connectivity', modelId],
    queryFn: () => api.getModelConnectivity(modelId!),
    enabled: !!modelId && showEdges,
  });

  // Build position lookup map for edges
  const regionNodes = useMemo(() => {
    const map = new Map<string, { pos: [number, number, number]; hemisphere: string }>();
    if (!regions) return map;
    for (const r of regions) {
      map.set(r.id, {
        pos: [(r.coordX || 0) * 0.5, (r.coordZ || 0) * 0.5, (r.coordY || 0) * 0.5],
        hemisphere: r.hemisphere ?? 'midline',
      });
    }
    return map;
  }, [regions]);

  // Visible nodes after hemisphere filter
  const visibleRegions = useMemo(() => {
    if (!regions) return [];
    return regions.filter((r) =>
      hemisphereFilter === 'both' ? true : r.hemisphere === hemisphereFilter,
    );
  }, [regions, hemisphereFilter]);

  const loaded = visibleRegions.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            Visual Explorer
            {activeModel && (
              <span className="text-sm font-normal text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/20 px-2.5 py-0.5 rounded-full">
                {activeModel.name}
              </span>
            )}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            3D connectome — orbit to rotate · scroll to zoom · hover to inspect
            {activeModel && (
              <span className="ml-2 text-text-muted">
                · {visibleRegions.length} regions{connections?.length ? ` · ${connections.filter((c) => c.weight >= weightThreshold).length} edges` : ''}
              </span>
            )}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Model picker */}
          <select
            value={selectedModelId ?? ''}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="text-xs bg-bg-secondary border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent-blue/50"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {/* Hemisphere toggle */}
          <div className="flex rounded overflow-hidden border border-border text-xs">
            {(['both', 'left', 'right'] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHemisphereFilter(h)}
                className={`px-3 py-1 transition-colors ${hemisphereFilter === h
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-text-muted hover:text-text-secondary'
                  }`}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Edge toggle */}
          <button
            onClick={() => setShowEdges((v) => !v)}
            className={`text-xs px-3 py-1 rounded border transition-colors ${showEdges
              ? 'border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10'
              : 'border-border text-text-muted hover:text-text-secondary'
              }`}
          >
            {showEdges ? 'Edges ON' : 'Edges OFF'}
          </button>

          {/* Weight threshold slider */}
          {showEdges && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>Min weight</span>
              <input
                type="range"
                min={0}
                max={0.8}
                step={0.05}
                value={weightThreshold}
                onChange={(e) => setWeightThreshold(Number(e.target.value))}
                className="w-24 accent-cyan-400"
              />
              <span className="tabular-nums w-8">{weightThreshold.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="card overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
        {loaded ? (
          <Canvas
            camera={{ position: [0, 0, 80], fov: 55 }}
            style={{ background: 'radial-gradient(ellipse at center, #0d1526 0%, #060a12 100%)' }}
            gl={{ antialias: true }}
          >
            <ambientLight intensity={0.15} />
            <pointLight position={[60, 60, 60]} intensity={1.2} color="#ffffff" />
            <pointLight position={[-60, -40, -60]} intensity={0.6} color="#1e40af" />

            {/* Connectivity edges */}
            {showEdges && connections && (
              <ConnectivityEdges
                regionNodes={regionNodes}
                connections={connections ?? []}
                threshold={weightThreshold}
              />
            )}

            {/* Region nodes */}
            {visibleRegions.map((r) => {
              const node = regionNodes.get(r.id);
              if (!node) return null;
              return (
                <NeuronNode
                  key={r.id}
                  position={node.pos}
                  color={r.hemisphere === 'left' ? '#06b6d4' : '#8b5cf6'}
                  activity={0}
                  name={r.name}
                />
              );
            })}

            <OrbitControls
              enableDamping
              dampingFactor={0.08}
              rotateSpeed={0.4}
              autoRotate
              autoRotateSpeed={0.3}
            />
          </Canvas>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-text-muted">
            {modelId ? 'Loading connectome data…' : 'No model found — run the seed script first.'}
          </div>
        )}
      </div>

      {/* Legend */}
      {loaded && (
        <div className="flex items-center gap-6 text-xs text-text-muted px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-cyan-400" />
            <span>Left hemisphere</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-violet-500" />
            <span>Right hemisphere</span>
          </div>
          {showEdges && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-0.5 bg-cyan-400" />
                <span>Weak connection</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-0.5 bg-violet-500" style={{ height: 2 }} />
                <span>Strong connection</span>
              </div>
              <span className="ml-auto text-text-muted/60">
                {connections?.filter((c) => c.weight >= weightThreshold).length ?? 0} edges shown
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
