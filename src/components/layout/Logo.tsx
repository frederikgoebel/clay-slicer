const WIDTHS = [16, 14, 18, 22, 24, 22, 18, 14, 16];

/** Layer-line mark: stacked clay beads whose widths trace a vase. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {WIDTHS.map((w, i) => (
        <rect
          key={i}
          x={16 - w / 2}
          y={3 + i * 3.1}
          width={w}
          height={2.3}
          rx={1.15}
          fill="currentColor"
          opacity={0.55 + (i / WIDTHS.length) * 0.45}
        />
      ))}
    </svg>
  );
}
