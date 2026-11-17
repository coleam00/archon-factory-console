import type { ReactElement } from 'react';
import { Link } from 'react-router';

/** The link item, stage and step pages lead back with. */
export function BackLink({ to, label }: { to: string; label: string }): ReactElement {
  return (
    <Link to={to} className="self-start text-console-12 text-accent-bright underline">
      {label}
    </Link>
  );
}
