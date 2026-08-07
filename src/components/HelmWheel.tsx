import { useCallback, useEffect, useRef } from "react";
import { headingLabel } from "@/lib/helmMath";

interface HelmWheelProps {
  /** Current heading in radians. */
  theta: number;
  onChange: (theta: number) => void;
  size?: number;
}

/**
 * Skeppets ratt — a physical helm. Drag it to turn the field around an axis
 * through intention space. It has weight: release it and it keeps turning
 * briefly before friction stops it.
 */
export default function HelmWheel({ theta, onChange, size = 108 }: HelmWheelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const lastAngle = useRef(0);
  const velocity = useRef(0);
  const lastTime = useRef(0);
  const raf = useRef<number | null>(null);
  const thetaRef = useRef(theta);
  thetaRef.current = theta;

  const angleAt = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2));
  };

  const stopInertia = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const spin = useCallback(() => {
    const step = () => {
      velocity.current *= 0.94; // friction
      if (Math.abs(velocity.current) < 0.0008) {
        raf.current = null;
        return;
      }
      onChange(thetaRef.current + velocity.current);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [onChange]);

  useEffect(() => stopInertia, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    stopInertia();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragging.current = true;
    lastAngle.current = angleAt(e.clientX, e.clientY);
    lastTime.current = performance.now();
    velocity.current = 0;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    const a = angleAt(e.clientX, e.clientY);
    let delta = a - lastAngle.current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    lastAngle.current = a;
    const now = performance.now();
    const dt = Math.max(16, now - lastTime.current);
    lastTime.current = now;
    velocity.current = delta * (16 / dt);
    onChange(thetaRef.current + delta);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    dragging.current = false;
    if (Math.abs(velocity.current) > 0.004) spin();
  };

  const deg = ((theta * 180) / Math.PI + 360) % 360;
  const spokes = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  const r = size / 2;

  return (
    <div className="pointer-events-auto select-none flex flex-col items-center gap-1">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="touch-none cursor-grab active:cursor-grabbing"
        style={{ width: size, height: size }}
        role="slider"
        aria-label="Ratt — vrid fältets axel"
        aria-valuenow={Math.round(deg)}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); onChange(theta - 0.08); }
          if (e.key === "ArrowRight") { e.preventDefault(); onChange(theta + 0.08); }
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* fixed bow marker */}
          <polygon
            points={`${r},2 ${r - 5},12 ${r + 5},12`}
            fill="hsl(var(--field-fz))"
            opacity={0.9}
          />
          <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: "50% 50%" }}>
            <circle cx={r} cy={r} r={r - 14} fill="none" stroke="hsl(var(--border))" strokeWidth={6} />
            <circle cx={r} cy={r} r={r - 14} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} opacity={0.5} />
            {spokes.map((a, i) => {
              const x1 = r + Math.cos(a) * (r - 17);
              const y1 = r + Math.sin(a) * (r - 17);
              const x2 = r + Math.cos(a) * (r - 3);
              const y2 = r + Math.sin(a) * (r - 3);
              return (
                <g key={i}>
                  <line
                    x1={r}
                    y1={r}
                    x2={r + Math.cos(a) * (r - 15)}
                    y2={r + Math.sin(a) * (r - 15)}
                    stroke="hsl(var(--border))"
                    strokeWidth={3}
                  />
                  {/* handle grips */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--muted-foreground))" strokeWidth={4} strokeLinecap="round" />
                </g>
              );
            })}
            <circle cx={r} cy={r} r={8} fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth={1.5} />
            <line x1={r} y1={r} x2={r} y2={16} stroke="hsl(var(--field-fz))" strokeWidth={2} />
          </g>
        </svg>
      </div>
      <div className="text-center font-mono leading-tight">
        <div className="text-[10px] text-primary tabular-nums">{Math.round(deg)}°</div>
        <div className="text-[9px] text-muted-foreground max-w-[120px]">{headingLabel(theta)}</div>
      </div>
    </div>
  );
}
