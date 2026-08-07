import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GeometricField, FieldUnit } from "@/lib/fieldData";
import { distanceFromAnchor } from "@/lib/anchorMath";
import { computeDepths, applyHelm } from "@/lib/helmMath";
import HelmWheel from "./HelmWheel";



const CLUSTER_COLORS = [
  "hsl(180, 70%, 50%)",
  "hsl(280, 60%, 60%)",
  "hsl(25, 90%, 55%)",
  "hsl(140, 60%, 45%)",
  "hsl(340, 65%, 55%)",
];

const CLUSTER_COLORS_DIM = [
  "hsl(180, 70%, 50%, 0.15)",
  "hsl(280, 60%, 60%, 0.15)",
  "hsl(25, 90%, 55%, 0.15)",
  "hsl(140, 60%, 45%, 0.15)",
  "hsl(340, 65%, 55%, 0.15)",
];

interface FieldCanvasProps {
  field: GeometricField;
  activeCluster: number | null;
  onSelectCluster: (id: number | null) => void;
  onSelectUnit: (unit: FieldUnit | null) => void;
  selectedUnit: FieldUnit | null;
  anchorUnit?: FieldUnit | null;
  onSetAnchor?: (unit: FieldUnit | null) => void;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;

export default function FieldCanvas({
  field,
  activeCluster,
  onSelectCluster,
  onSelectUnit,
  selectedUnit,
  anchorUnit = null,
  onSetAnchor,
}: FieldCanvasProps) {

  const [hoveredUnit, setHoveredUnit] = useState<FieldUnit | null>(null);

  // View transform (pan + zoom). Applied to inner content wrapper.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalizedQuery) return new Set<string>();
    const out = new Set<string>();
    for (const u of field.units) {
      if (u.text?.toLowerCase().includes(normalizedQuery)) out.add(u.id);
    }
    return out;
  }, [normalizedQuery, field.units]);

  // Helm: heading angle (radians) through 5D intention space
  const [heading, setHeading] = useState(0);

  // Compute positions as percentages (in untransformed content space).
  const basePositions = useMemo(() => {
    if (!anchorUnit) {
      return field.units.map((u) => {
        const x = ((u.vector2d[0] + 4) / 8) * 100;
        const y = ((u.vector2d[1] + 4) / 8) * 100;
        return { x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) };
      });
    }
    const ax = anchorUnit.vector2d[0];
    const ay = anchorUnit.vector2d[1];
    const RADIUS_SCALE = 3.6;
    return field.units.map((u, idx) => {
      if (u.id === anchorUnit.id) {
        const x = ((ax + 4) / 8) * 100;
        const y = ((ay + 4) / 8) * 100;
        return { x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) };
      }
      let dx = u.vector2d[0] - ax;
      let dy = u.vector2d[1] - ay;
      let len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) {
        const theta = idx * 2.399963;
        dx = Math.cos(theta);
        dy = Math.sin(theta);
        len = 1;
      }
      const dirX = dx / len;
      const dirY = dy / len;
      const newLen = distanceFromAnchor(anchorUnit, u) * RADIUS_SCALE;
      const nx = ax + dirX * newLen;
      const ny = ay + dirY * newLen;
      const x = ((nx + 4) / 8) * 100;
      const y = ((ny + 4) / 8) * 100;
      return { x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) };
    });
  }, [field.units, anchorUnit]);

  // Depth along the current heading — resolves stacked nodes into near/far layers.
  const depths = useMemo(() => computeDepths(field.units, heading), [field.units, heading]);

  const unitPositions = useMemo(
    () => basePositions.map((p, i) => applyHelm(p, depths[i] ?? 0, heading)),
    [basePositions, depths, heading]
  );

  const pctX = (i: number) => `${unitPositions[i].x}%`;
  const pctY = (i: number) => `${unitPositions[i].y}%`;


  const clusterCenterPositions = useMemo(
    () =>
      field.clusters.map((c) => {
        const x = ((c.center[0] + 4) / 8) * 100;
        const y = ((c.center[1] + 4) / 8) * 100;
        return { x: `${x}%`, y: `${y}%` };
      }),
    [field.clusters]
  );

  // Center the view on a percentage point in content space, at a target scale.
  const centerOn = useCallback((px: number, py: number, targetScale?: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = targetScale ?? Math.max(scale, 2.2);
    const cx = (px / 100) * rect.width;
    const cy = (py / 100) * rect.height;
    setScale(s);
    setTx(rect.width / 2 - cx * s);
    setTy(rect.height / 2 - cy * s);
  }, [scale]);

  const resetView = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  // Keyboard shortcuts: / = search, R = reset, Esc = close selection/search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !searchOpen) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        resetView();
      }
      if (e.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery("");
        }
        if (selectedUnit || hoveredUnit) {
          onSelectUnit(null);
          setHoveredUnit(null);
        }
        if (activeCluster !== null) {
          onSelectCluster(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, selectedUnit, hoveredUnit, activeCluster, resetView, onSelectUnit, onSelectCluster]);

  // Jump to the first search match whenever query changes
  useEffect(() => {
    if (!normalizedQuery) return;
    const idx = field.units.findIndex((u) => matches.has(u.id));
    if (idx >= 0) centerOn(unitPositions[idx].x, unitPositions[idx].y, 2.6);
  }, [normalizedQuery, matches, field.units, unitPositions, centerOn]);

  // Wheel zoom around cursor
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    // keep mouse point fixed
    const k = newScale / scale;
    setTx(mx - (mx - tx) * k);
    setTy(my - (my - ty) * k);
    setScale(newScale);
  }, [scale, tx, ty]);

  // Pan via pointer drag + pinch via two pointers
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; scale: number; tx: number; ty: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = viewportRef.current!.getBoundingClientRect();
      pinchRef.current = {
        dist,
        cx: (a.x + b.x) / 2 - rect.left,
        cy: (a.y + b.y) / 2 - rect.top,
        scale,
        tx,
        ty,
      };
    }
  }, [scale, tx, ty]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinchRef.current) {
      const pts = Array.from(pointers.current.values()).slice(0, 2);
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < 4) return; // ignore noise on weak touch digitizers
      const p = pinchRef.current;
      const rawScale = p.scale * (dist / p.dist);
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));
      // Use the *clamped* ratio so position doesn't drift past zoom limits
      const k = newScale / p.scale;
      setScale(newScale);
      setTx(p.cx - (p.cx - p.tx) * k);
      setTy(p.cy - (p.cy - p.ty) * k);
    } else if (pointers.current.size === 1 && !pinchRef.current) {
      setTx((v) => v + (e.clientX - prev.x));
      setTy((v) => v + (e.clientY - prev.y));
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    // After a pinch, ignore any leftover single-finger drag until all fingers are up
    if (pinchRef.current && pointers.current.size === 0) {
      pinchRef.current = null;
    }
  }, []);

  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    const k = newScale / scale;
    setTx(cx - (cx - tx) * k);
    setTy(cy - (cy - ty) * k);
    setScale(newScale);
  };

  const displayUnit = hoveredUnit || selectedUnit;

  return (
    <div className="relative w-full h-full field-grid overflow-hidden rounded-lg border border-border bg-field-void">
      {/* Toolbar overlay (not transformed) */}
      <div className="absolute top-2 left-2 right-2 z-40 flex items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-1 pointer-events-auto bg-card/80 backdrop-blur-sm border border-border rounded-md px-1 py-1">
          <button
            onClick={() => zoomBy(0.75)}
            className="w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-secondary text-sm font-mono"
            title="Zoom out"
            aria-label="Zoom out"
          >−</button>
          <button
            onClick={() => zoomBy(1.33)}
            className="w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-secondary text-sm font-mono"
            title="Zoom in"
            aria-label="Zoom in"
          >+</button>
          <button
            onClick={resetView}
            className="px-2 h-7 rounded text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground hover:bg-secondary font-mono"
            title="Reset view"
          >Reset</button>
          <span className="px-1 text-[10px] text-muted-foreground font-mono tabular-nums">{scale.toFixed(1)}×</span>
        </div>
        <div className="pointer-events-auto flex-1 max-w-xs">
          {searchOpen ? (
            <div className="flex items-center gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-md px-2 py-1">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Sök nod (t.ex. Malin, Conny)…"
                className="flex-1 bg-transparent outline-none text-xs font-mono text-foreground placeholder:text-muted-foreground/60"
              />
              {matches.size > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">{matches.size}</span>
              )}
              <button
                onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
                className="text-muted-foreground hover:text-foreground text-xs px-1"
                aria-label="Close search"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="bg-card/80 backdrop-blur-sm border border-border rounded-md px-2 h-7 text-[10px] tracking-wider uppercase font-mono text-muted-foreground hover:text-foreground"
              title="Search nodes"
            >🔍 Sök</button>
          )}
        </div>
      </div>

      {/* Pan/zoom viewport */}
      <div
        ref={viewportRef}
        className="absolute inset-0 touch-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: pointers.current.size > 0 ? "grabbing" : "grab" }}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        >
          {/* Tension gradient background blobs */}
          {field.units
            .filter((u) => u.fz > 0.65)
            .map((u, i) => {
              const idx = field.units.indexOf(u);
              return (
                <div
                  key={`fz-${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: pctX(idx),
                    top: pctY(idx),
                    width: `${u.fz * 120}px`,
                    height: `${u.fz * 120}px`,
                    transform: "translate(-50%, -50%)",
                    background: `radial-gradient(circle, hsl(25, 90%, 55%, ${u.fz * 0.2}) 0%, transparent 70%)`,
                    animation: `tension-ripple ${3 + i * 0.5}s ease-in-out infinite`,
                  }}
                />
              );
            })}

          {/* CTI critical node markers */}
          {field.units
            .filter((u) => (u.cti ?? 0) > 0.35)
            .map((u) => {
              const idx = field.units.indexOf(u);
              const cti = u.cti ?? 0;
              const ringSize = 28 + cti * 30;
              return (
                <div
                  key={`cti-${u.id}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: pctX(idx),
                    top: pctY(idx),
                    width: `${ringSize}px`,
                    height: `${ringSize}px`,
                    transform: "translate(-50%, -50%)",
                    border: `1.5px solid hsl(340, 80%, 60%, ${0.3 + cti * 0.5})`,
                    boxShadow: `0 0 ${cti * 20}px hsl(340, 80%, 60%, ${cti * 0.3}), inset 0 0 ${cti * 12}px hsl(340, 80%, 60%, ${cti * 0.15})`,
                    animation: `tension-ripple ${2 + cti * 2}s ease-in-out infinite`,
                    zIndex: 1,
                  }}
                />
              );
            })}

          {/* Cluster centers */}
          {field.clusters.map((cluster, i) => {
            const pos = clusterCenterPositions[i];
            const isActive = activeCluster === null || activeCluster === i;
            const isSelected = activeCluster === i;
            return (
              <motion.div
                key={`cl-${i}`}
                className="absolute select-none"
                style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
                animate={{ opacity: isActive ? 0.5 : 0.1 }}
              >
                <div
                  className="rounded-full pointer-events-none"
                  style={{
                    width: `${cluster.unitCount * 25 + 60}px`,
                    height: `${cluster.unitCount * 25 + 60}px`,
                    background: CLUSTER_COLORS_DIM[i],
                    border: `1px solid ${CLUSTER_COLORS[i]}22`,
                  }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCluster(isSelected ? null : i);
                  }}
                  className={`absolute left-1/2 -translate-x-1/2 -bottom-5 font-mono text-[10px] tracking-widest uppercase whitespace-nowrap px-2 py-0.5 rounded transition-colors ${
                    isSelected
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "hover:bg-secondary/60"
                  }`}
                  style={{ color: isSelected ? undefined : CLUSTER_COLORS[i] }}
                  title={isSelected ? "Klicka för att visa alla kluster" : `Fokusera klustret ${cluster.label}`}
                >
                  {cluster.label}
                </button>
              </motion.div>
            );
          })}

          {/* Connection lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            {field.units.map((u, i) =>
              field.units.slice(i + 1).map((v, j) => {
                const dist = Math.sqrt(
                  (u.vector2d[0] - v.vector2d[0]) ** 2 + (u.vector2d[1] - v.vector2d[1]) ** 2
                );
                if (dist > 2.0) return null;
                const opacity = Math.max(0.02, 0.12 - dist * 0.05);
                const isActive =
                  activeCluster === null || u.clusterId === activeCluster || v.clusterId === activeCluster;
                return (
                  <line
                    key={`l-${i}-${j}`}
                    x1={pctX(i)}
                    y1={pctY(i)}
                    x2={pctX(i + 1 + j)}
                    y2={pctY(i + 1 + j)}
                    stroke={u.clusterId === v.clusterId ? CLUSTER_COLORS[u.clusterId] : "hsl(200,10%,30%)"}
                    strokeWidth={0.5 / scale}
                    opacity={isActive ? opacity : 0.01}
                  />
                );
              })
            )}
          </svg>

          {/* Anchor rays */}
          {anchorUnit && (() => {
            const anchorIdx = field.units.findIndex((u) => u.id === anchorUnit.id);
            if (anchorIdx < 0) return null;
            return (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                {field.units.map((u, i) => {
                  if (u.id === anchorUnit.id) return null;
                  const d = distanceFromAnchor(anchorUnit, u);
                  const opacity = Math.max(0.05, Math.min(0.55, d * 0.7));
                  return (
                    <line
                      key={`anchor-ray-${u.id}`}
                      x1={pctX(anchorIdx)}
                      y1={pctY(anchorIdx)}
                      x2={pctX(i)}
                      y2={pctY(i)}
                      stroke="hsl(340, 90%, 60%)"
                      strokeWidth={(d > 0.5 ? 1 : 0.5) / scale}
                      opacity={opacity}
                    />
                  );
                })}
              </svg>
            );
          })()}

          {/* Anchor ring */}
          {anchorUnit && (() => {
            const idx = field.units.findIndex((u) => u.id === anchorUnit.id);
            if (idx < 0) return null;
            return (
              <div
                key="anchor-ring"
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: pctX(idx),
                  top: pctY(idx),
                  width: 44,
                  height: 44,
                  transform: "translate(-50%, -50%)",
                  border: "2px dashed hsl(340, 90%, 65%)",
                  boxShadow: "0 0 18px hsl(340, 90%, 60%, 0.6)",
                  animation: "tension-ripple 3s ease-in-out infinite",
                  zIndex: 3,
                }}
              />
            );
          })()}

          {/* Unit nodes */}
          {field.units.map((unit, i) => {
            const size = 8 + unit.fz * 16;
            const isActive = activeCluster === null || unit.clusterId === activeCluster;
            const isSelected = selectedUnit?.id === unit.id;
            const isHovered = hoveredUnit?.id === unit.id;
            const isMatch = matches.has(unit.id);
            return (
              <motion.button
                key={unit.id}
                className="absolute rounded-full border-0 cursor-pointer focus:outline-none transition-[left,top] duration-700 ease-out"
                style={{
                  left: pctX(i),
                  top: pctY(i),
                  width: size,
                  height: size,
                  transform: "translate(-50%, -50%)",
                  background: CLUSTER_COLORS[unit.clusterId],
                  boxShadow: isMatch
                    ? `0 0 ${18}px hsl(48, 100%, 60%), 0 0 0 2px hsl(48, 100%, 60%)`
                    : isSelected || isHovered
                    ? `0 0 ${unit.fz * 25 + 10}px ${CLUSTER_COLORS[unit.clusterId]}`
                    : unit.fz > 0.65
                    ? `0 0 ${unit.fz * 15}px hsl(25, 90%, 55%, 0.5)`
                    : `0 0 ${unit.fy * 8}px ${CLUSTER_COLORS[unit.clusterId]}44`,
                  zIndex: isMatch ? 15 : isSelected || isHovered ? 20 : 2,
                }}
                animate={{
                  opacity: normalizedQuery
                    ? isMatch ? 1 : 0.15
                    : isActive ? 0.7 + unit.fy * 0.3 : 0.1,
                  scale: isSelected ? 1.6 : isHovered ? 1.3 : isMatch ? 1.4 : 1,
                }}
                transition={{ duration: 0.2 }}
                onMouseEnter={() => setHoveredUnit(unit)}
                onMouseLeave={() => setHoveredUnit(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectUnit(isSelected ? null : unit);
                  onSelectCluster(isSelected ? null : unit.clusterId);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Hover tooltip (not transformed) */}
      <AnimatePresence>
        {displayUnit && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute bottom-4 left-4 right-4 z-30 bg-card/95 backdrop-blur-sm border border-border rounded-lg p-4 font-mono"
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: CLUSTER_COLORS[displayUnit.clusterId] }}
              />
              <span className="text-xs tracking-wider uppercase text-muted-foreground">
                {field.clusters[displayUnit.clusterId]?.label} · {displayUnit.id}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {onSetAnchor && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const isAnchor = anchorUnit?.id === displayUnit.id;
                      onSetAnchor(isAnchor ? null : displayUnit);
                    }}
                    className={`px-2 py-1 rounded text-[10px] tracking-wider uppercase border transition-colors ${
                      anchorUnit?.id === displayUnit.id
                        ? "border-rose-400/60 text-rose-300 bg-rose-500/10"
                        : "border-border text-muted-foreground hover:text-rose-300 hover:border-rose-400/40"
                    }`}
                    title="Use this unit as the rotation axis for the field"
                  >
                    {anchorUnit?.id === displayUnit.id ? "✕ Clear anchor" : "⊕ Set as anchor"}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectUnit(null);
                    setHoveredUnit(null);
                  }}
                  className="w-7 h-7 flex shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                  title="Close info panel"
                  aria-label="Close info panel"
                >
                  ✕
                </button>
              </div>
            </div>

            <p className="text-sm text-foreground mb-3 italic">"{displayUnit.text}"</p>
            <div className="flex gap-6 text-[11px] flex-wrap">
              <div>
                <span className="text-field-fz font-semibold">FZ</span>
                <span className="text-muted-foreground ml-1">{displayUnit.fz.toFixed(2)}</span>
                <div className="w-16 h-1 bg-secondary rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-field-fz"
                    style={{ width: `${displayUnit.fz * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <span className="text-field-fy font-semibold">FY</span>
                <span className="text-muted-foreground ml-1">{displayUnit.fy.toFixed(2)}</span>
                <div className="w-16 h-1 bg-secondary rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-field-fy"
                    style={{ width: `${displayUnit.fy * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-muted-foreground">
                type: <span className="text-foreground">{displayUnit.type}</span>
              </div>
            </div>
            {displayUnit.intention && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                  Intentionsanalys
                </div>
                <div className="flex gap-4 text-[11px] flex-wrap">
                  <div className="text-muted-foreground">
                    talakt: <span className="text-foreground">{displayUnit.intention.speechAct}</span>
                  </div>
                  <div>
                    <span className="text-purple-400 font-semibold">Sanning</span>
                    <span className="text-muted-foreground ml-1">{displayUnit.intention.truthTension.toFixed(2)}</span>
                    <div className="w-14 h-1 bg-secondary rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-purple-400" style={{ width: `${displayUnit.intention.truthTension * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <span className="text-emerald-400 font-semibold">Visshet</span>
                    <span className="text-muted-foreground ml-1">{displayUnit.intention.epistemicCertainty.toFixed(2)}</span>
                    <div className="w-14 h-1 bg-secondary rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${displayUnit.intention.epistemicCertainty * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <span className="text-rose-400 font-semibold">Kraft</span>
                    <span className="text-muted-foreground ml-1">{displayUnit.intention.intentionalForce.toFixed(2)}</span>
                    <div className="w-14 h-1 bg-secondary rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-rose-400" style={{ width: `${displayUnit.intention.intentionalForce * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {displayUnit.triangulation && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <div className="text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                  Triangulering av sanningsspänning
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-purple-300">LLM</span>
                    <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-purple-300" style={{ width: `${displayUnit.triangulation.llmTension * 100}%` }} />
                    </div>
                    <span className="text-muted-foreground w-7 text-right">{displayUnit.triangulation.llmTension.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-300">Lexikal</span>
                    <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-amber-300" style={{ width: `${displayUnit.triangulation.lexicalTension * 100}%` }} />
                    </div>
                    <span className="text-muted-foreground w-7 text-right">{displayUnit.triangulation.lexicalTension.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-rose-300">Diskrepans</span>
                    <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-rose-300" style={{ width: `${displayUnit.triangulation.discrepancy * 100}%` }} />
                    </div>
                    <span className="text-muted-foreground w-7 text-right">{displayUnit.triangulation.discrepancy.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-cyan-300">Kluster Δ</span>
                    <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-cyan-300" style={{ width: `${displayUnit.triangulation.clusterDeviation * 100}%` }} />
                    </div>
                    <span className="text-muted-foreground w-7 text-right">{displayUnit.triangulation.clusterDeviation.toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                  <span className="text-purple-400 font-semibold">Σ Triangulerad</span>
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-amber-400" style={{ width: `${displayUnit.triangulation.triangulated * 100}%` }} />
                  </div>
                  <span className="text-foreground font-semibold">{displayUnit.triangulation.triangulated.toFixed(2)}</span>
                </div>
              </div>
            )}
            {displayUnit.cti != null && displayUnit.cti > 0.15 && (
              <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2 text-[11px]">
                <span className={`font-bold ${displayUnit.cti > 0.4 ? "text-rose-400" : displayUnit.cti > 0.25 ? "text-amber-400" : "text-muted-foreground"}`}>
                  CTI
                </span>
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${displayUnit.cti * 100}%`,
                      background: displayUnit.cti > 0.4
                        ? "linear-gradient(90deg, hsl(340, 80%, 55%), hsl(25, 90%, 55%))"
                        : "hsl(340, 60%, 50%)",
                    }}
                  />
                </div>
                <span className="text-foreground font-semibold">{displayUnit.cti.toFixed(2)}</span>
                {displayUnit.cti > 0.4 && (
                  <span className="text-rose-400 text-[9px] tracking-wider uppercase">kritisk nod</span>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
