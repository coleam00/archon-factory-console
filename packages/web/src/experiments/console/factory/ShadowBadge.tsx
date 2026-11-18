import type { ReactElement } from 'react';

/**
 * Rule 10's shadow badge: what it marks says what it would do and does nothing (a drain that
 * decides what it would file, a setting whose stage runs as a shadow).
 */
export function ShadowBadge(): ReactElement {
  return (
    <span className="rounded border border-dashed border-[color:var(--node-opaque)] px-1.5 text-console-12 text-[color:var(--node-opaque)]">
      shadow
    </span>
  );
}
