import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GeometricField, FieldUnit } from "@/lib/fieldData";

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
}

export default function FieldCanvas({
  field,
  activeCluster,
  onSelectCluster,
  onSelectUnit,
  selectedUnit,
}: FieldCanvasProps) {
  const [hoveredUnit, setHoveredUnit] = useState<FieldUnit | null>(null);

  // Map vector2d to canvas coordinates
  const mapToCanvas = useCallback(
    (v: [number, number]) => {
      const padding = 60;
      const xMin = -4, xMax = 4, yMin = -4, yMax = 4;
      return {
        cx: padding + ((v[0] - xMin) / (xMax - xMin)) * (100 - padding * 2 / 10) + "%",
        cy: padding + ((v[1] - yMin) / (yMax - yMin)) * (100 - padding * 2 / 10) + "%",
      };
    },
    []
  );

  // Compute positions as percentages
  const unitPositions = useMemo(
    () =>
      field.units.map((u) => {
        const x = ((u.vector2d[0] + 4) / 8) * 100;
        const y = ((u.vector2d[1] + 4) / 8) * 100;
        return { x: `${Math.max(5, Math.min(95, x))}%`, y: `${Math.max(5, Math.min(95, y))}%` };
      }),
    [field.units]
  );

  const clusterCenterPositions = useMemo(
    () =>
      field.clusters.map((c) => {
        const x = ((c.center[0] + 4) / 8) * 100;
        const y = ((c.center[1] + 4) / 8) * 100;
        return { x: `${x}%`, y: `${y}%` };
      }),
    [field.clusters]
  );

  const displayUnit = hoveredUnit || selectedUnit;

  return (
    <div className="relative w-full h-full field-grid overflow-hidden rounded-lg border border-border bg-field-void">
      {/* Tension gradient background blobs */}
      {field.units
        .filter((u) => u.fz > 0.65)
        .map((u, i) => {
          const pos = unitPositions[field.units.indexOf(u)];
          return (
            <div
              key={`fz-${i}`}
              className="absolute rounded-full pointer-events-none"
              style={{
                left: pos.x,
                top: pos.y,
                width: `${u.fz * 120}px`,
                height: `${u.fz * 120}px`,
                transform: "translate(-50%, -50%)",
                background: `radial-gradient(circle, hsl(25, 90%, 55%, ${u.fz * 0.2}) 0%, transparent 70%)`,
                animation: `tension-ripple ${3 + i * 0.5}s ease-in-out infinite`,
              }}
            />
          );
        })}

      {/* Cluster center labels */}
      {field.clusters.map((cluster, i) => {
        const pos = clusterCenterPositions[i];
        const isActive = activeCluster === null || activeCluster === i;
        return (
          <motion.div
            key={`cl-${i}`}
            className="absolute pointer-events-none select-none"
            style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
            animate={{ opacity: isActive ? 0.5 : 0.1 }}
          >
            <div
              className="rounded-full"
              style={{
                width: `${cluster.unitCount * 25 + 60}px`,
                height: `${cluster.unitCount * 25 + 60}px`,
                background: CLUSTER_COLORS_DIM[i],
                border: `1px solid ${CLUSTER_COLORS[i]}22`,
              }}
            />
            <span
              className="absolute left-1/2 -translate-x-1/2 -bottom-5 font-mono text-[10px] tracking-widest uppercase whitespace-nowrap"
              style={{ color: CLUSTER_COLORS[i] }}
            >
              {cluster.label}
            </span>
          </motion.div>
        );
      })}

      {/* Connection lines between nearby units */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
        {field.units.map((u, i) =>
          field.units.slice(i + 1).map((v, j) => {
            const dist = Math.sqrt(
              (u.vector2d[0] - v.vector2d[0]) ** 2 + (u.vector2d[1] - v.vector2d[1]) ** 2
            );
            if (dist > 2.0) return null;
            const opacity = Math.max(0.02, 0.12 - dist * 0.05);
            const posA = unitPositions[i];
            const posB = unitPositions[i + 1 + j];
            const isActive =
              activeCluster === null || u.clusterId === activeCluster || v.clusterId === activeCluster;
            return (
              <line
                key={`l-${i}-${j}`}
                x1={posA.x}
                y1={posA.y}
                x2={posB.x}
                y2={posB.y}
                stroke={u.clusterId === v.clusterId ? CLUSTER_COLORS[u.clusterId] : "hsl(200,10%,30%)"}
                strokeWidth={0.5}
                opacity={isActive ? opacity : 0.01}
              />
            );
          })
        )}
      </svg>

      {/* Unit nodes */}
      {field.units.map((unit, i) => {
        const pos = unitPositions[i];
        const size = 8 + unit.fz * 16;
        const isActive = activeCluster === null || unit.clusterId === activeCluster;
        const isSelected = selectedUnit?.id === unit.id;
        const isHovered = hoveredUnit?.id === unit.id;
        return (
          <motion.button
            key={unit.id}
            className="absolute rounded-full border-0 cursor-pointer focus:outline-none"
            style={{
              left: pos.x,
              top: pos.y,
              width: size,
              height: size,
              transform: "translate(-50%, -50%)",
              background: CLUSTER_COLORS[unit.clusterId],
              boxShadow: isSelected || isHovered
                ? `0 0 ${unit.fz * 25 + 10}px ${CLUSTER_COLORS[unit.clusterId]}`
                : unit.fz > 0.65
                ? `0 0 ${unit.fz * 15}px hsl(25, 90%, 55%, 0.5)`
                : `0 0 ${unit.fy * 8}px ${CLUSTER_COLORS[unit.clusterId]}44`,
              zIndex: isSelected || isHovered ? 20 : 2,
            }}
            animate={{
              opacity: isActive ? 0.7 + unit.fy * 0.3 : 0.1,
              scale: isSelected ? 1.6 : isHovered ? 1.3 : 1,
            }}
            transition={{ duration: 0.2 }}
            onMouseEnter={() => setHoveredUnit(unit)}
            onMouseLeave={() => setHoveredUnit(null)}
            onClick={() => {
              onSelectUnit(isSelected ? null : unit);
              onSelectCluster(isSelected ? null : unit.clusterId);
            }}
          />
        );
      })}

      {/* Hover tooltip */}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
