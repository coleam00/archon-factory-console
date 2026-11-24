import type { ReactElement } from 'react';
import { Factory } from 'lucide-react';
import { RailNavLink } from './ui/RailNavLink';
import { useFactoryPacks } from './useFactoryPacks';

/**
 * The sidebar's Factory entry, shown once an installed pack has a factory overview file (or
 * a broken one). Nothing shows while the read loads or after it fails: the entry has nowhere
 * to go without a pack. `/console/factory` itself says why the read failed, and every page it
 * leads to shows the files and projects the read could not see.
 */
export function FactoryRailLink(): ReactElement | null {
  const { data } = useFactoryPacks();
  if (data === undefined || data.packs.length === 0) return null;
  return <RailNavLink to="/console/factory" icon={Factory} label="Factory" />;
}
