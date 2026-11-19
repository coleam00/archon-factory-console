import type { ReactElement } from 'react';

// The two marks an option can carry (DESIGN.md, Visual standard rule 9; owner change 2026-11-19
// point 1). Recommended is green and never looks chosen; selected is the accent border with a
// check, and depends only on the pick. Border and background are separate so a tile that is
// both carries exactly one border colour.
export const RECOMMENDED_BORDER = 'border-success/40';
export const RECOMMENDED_BG = 'bg-[color:var(--success-soft)]';
export const RECOMMENDED = `${RECOMMENDED_BORDER} ${RECOMMENDED_BG}`;
export const SELECTED_BORDER = 'border-accent';

export function RecommendedBadge(): ReactElement {
  return <span className="shrink-0 text-console-12 font-medium text-success">Recommended</span>;
}
