import type { ReactElement } from 'react';

/**
 * Rule 10's shadow badge: what it marks says what it would do and does nothing (a drain that
 * decides what it would file, a setting whose stage runs as a shadow, a shadow step's
 * decision). A dashed `--node-opaque` outline and text, no fill, never a state colour.
 */
export function ShadowBadge({ className = '' }: { className?: string }): ReactElement {
  return (
    <span
      data-shadow-badge="true"
      className={`shrink-0 rounded border border-dashed border-[color:var(--node-opaque)] px-1.5 text-console-12 text-[color:var(--node-opaque)] ${className}`}
    >
      shadow
    </span>
  );
}
