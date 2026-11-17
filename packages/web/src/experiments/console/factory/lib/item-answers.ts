import type { FactoryItem } from '../../skills/factory';

type ItemAnswer = FactoryItem['answers'][number];
type ItemLink = FactoryItem['links'][number];

/** One recorded answer or ruling, in words. */
export interface AnswerLine {
  label: string;
  text: string;
  /** Further lines: the option chosen, the note given with it, who gave it. */
  details: string[];
  at: string;
  runId: string | null;
  /** A withdrawn ruling or ask: shown, struck through. */
  withdrawn: boolean;
}

/**
 * The free text of an answer (`attentionAnswerSchema`: every form carries `text`). The
 * generated API types read the field as `unknown`, because the generator collapses a nullable
 * union, so it is narrowed here; anything else reads as none.
 */
function answerText(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('text' in value)) return null;
  return typeof value.text === 'string' && value.text.trim() !== '' ? value.text : null;
}

/** Who answered (`attentionAnswererSchema`), as the read records them; null when unsaid. */
function answererName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  if ('declared' in value && typeof value.declared === 'string') return value.declared;
  if ('userId' in value && typeof value.userId === 'string') return 'a signed-in user';
  return null;
}

const by = (value: unknown): string[] => {
  const name = answererName(value);
  return name === null ? [] : [`by ${name}`];
};

const present = (lines: (string | null)[]): string[] =>
  lines.filter((line): line is string => line !== null);

export function describeAnswer(entry: ItemAnswer): AnswerLine {
  const at = entry.at;
  switch (entry.kind) {
    case 'ruling':
      return {
        label: entry.withdrawn === null ? 'Ruling' : 'Ruling, withdrawn',
        text: entry.text,
        details: by(entry.by),
        at,
        runId: null,
        withdrawn: entry.withdrawn !== null,
      };
    case 'ask':
      return {
        label: entry.withdrawn ? 'Ask withdrawn' : 'Ask answered',
        text: entry.question,
        details: [
          ...present([entry.chosen?.does ?? null, answerText(entry.answer)]),
          ...by(entry.by),
        ],
        at,
        runId: entry.runId,
        withdrawn: entry.withdrawn,
      };
    case 'asks_settled':
      return {
        label: 'Asks settled',
        text: `${entry.answered.toString()} answered, ${entry.withdrawn.toString()} withdrawn`,
        details: [],
        at,
        runId: entry.runId,
        withdrawn: false,
      };
    case 'gate':
      return {
        label: 'Gate',
        text: entry.decision ?? 'resolved',
        details: present([entry.text]),
        at,
        runId: entry.runId,
        withdrawn: false,
      };
    case 'attention':
      return {
        label: 'Answer',
        text: answerText(entry.answer) ?? 'answered, with no text',
        details: by(entry.by),
        at,
        runId: entry.runId,
        withdrawn: false,
      };
  }
}

const LINK_WORDS: Record<ItemLink['kind'], Record<ItemLink['direction'], string>> = {
  depends_on: { outgoing: 'Depends on', incoming: 'Needed by' },
  part_of: { outgoing: 'Part of', incoming: 'Has part' },
  duplicate_of: { outgoing: 'Duplicate of', incoming: 'Duplicated by' },
};

/** A link in plain words, from this item's side. */
export function linkWords(link: Pick<ItemLink, 'kind' | 'direction'>): string {
  return LINK_WORDS[link.kind][link.direction];
}
