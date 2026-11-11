const TITLES: Record<string, string> = {
  print: 'Print setting',
  texture: 'Texture',
  brush: 'Painted mask',
  profile: 'Profile',
  move: 'Moved',
  scale: 'Scaled',
  rotate: 'Rotated',
  points: 'Points',
  height: 'Height',
  corner: 'Corner radius',
  twist: 'Twist',
  circle: 'Circle',
  add: 'Added',
  remove: 'Removed',
  reorder: 'Reordered',
  select: 'Selected',
};

/** Paths on a 16×16 grid, drawn as outlines. */
const PATHS: Record<string, string> = {
  print: 'M3 4h10M3 8h10M3 12h10M6 2.5v3M10 6.5v3M7 10.5v3',
  texture: 'M2 11c2-6 4-6 6 0s4 6 6 0',
  brush: 'M3 13c1 0 2-.5 2.5-1.5L12 5l-1-1-6.5 6.5C3.500 11 3 12 3 13zM11 3l2 2',
  profile: 'M3 3h10v10H3zM3 6.500h10M6.500 6.500V13',
  move: 'M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2',
  scale: 'M3 13V9M3 13h4M3 13l10-10M13 3v4M13 3H9',
  rotate: 'M13 8a5 5 0 1 1-1.500-3.500M13 2.500v3h-3',
  points: 'M3 12l3-7 5 4 3-5M3 12h0M6 5h0M11 9h0M14 4h0',
  height: 'M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3',
  corner: 'M3 13V8a5 5 0 0 1 5-5h5',
  twist: 'M4 3c6 0 6 5 0 5s-6 5 0 5M12 3c-6 0-6 5 0 5s6 5 0 5',
  circle: 'M8 2.500a5.500 5.500 0 1 0 0 11 5.500 5.500 0 0 0 0-11z',
  add: 'M8 3v10M3 8h10',
  remove: 'M3 8h10',
  reorder: 'M5 3v10M5 13l-2-2M5 13l2-2M11 13V3M11 3l-2 2M11 3l2 2',
  select: 'M3 8.500l3.500 3.500L13 4.500',
};

export function StepIcon({ kind }: { kind: string }) {
  const d = PATHS[kind];
  if (!d) return null;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.400"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={TITLES[kind]}
    >
      <title>{TITLES[kind]}</title>
      <path d={d} />
    </svg>
  );
}
