import {
  Check,
  CircleDot,
  Eye,
  Flag,
  FlaskConical,
  Gavel,
  GitPullRequest,
  Hammer,
  Inbox,
  List,
  Map as MapIcon,
  RotateCcw,
  Scale,
  Search,
  ScrollText,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { OverviewCard } from '../lib/overview-nav';

/**
 * Each card kind's colour and its legend words. Keyed by the generated kind enum, so a kind the
 * schema gains fails type-check here until it has both. The colours are the console's node
 * tokens, as the live map's groups are.
 */
export const KINDS: Record<OverviewCard['kind'], { color: string; label: string; words: string }> =
  {
    input: { color: 'var(--node-command)', label: 'Input', words: 'Where work comes from' },
    stage: { color: 'var(--node-wait)', label: 'Stage', words: 'A stage of the factory' },
    check: { color: 'var(--node-loop)', label: 'Check', words: 'A check on the change' },
    person: { color: 'var(--node-prompt)', label: 'You', words: 'A person steps in' },
    gate: { color: 'var(--node-bash)', label: 'Gate', words: 'A gate that decides' },
    outcome: { color: 'var(--success)', label: 'Outcome', words: 'What comes out' },
  };

/** Every icon a card may name. Keyed by the generated icon enum, so a new one fails type-check until mapped. */
export const ICONS: Record<OverviewCard['icon'], LucideIcon> = {
  inbox: Inbox,
  issue: CircleDot,
  order: ScrollText,
  search: Search,
  scale: Scale,
  map: MapIcon,
  list: List,
  hammer: Hammer,
  'git-pull-request': GitPullRequest,
  check: Check,
  flask: FlaskConical,
  eye: Eye,
  sparkles: Sparkles,
  gavel: Gavel,
  users: Users,
  flag: Flag,
  rotate: RotateCcw,
};
