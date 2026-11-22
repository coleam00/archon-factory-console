/**
 * How an ask card names what it is about: the item (linked to its factory page when a view
 * applies, else to the run) and the stage or workflow it came from.
 */
import type { AskSubject } from '../components/ask-card/AskCard';
import { stageOfWorkflow } from '../factory/lib/placement';
import { TONES, type Tone } from '../factory/tones';
import type { FactoryItem } from '../skills/factory';
import { factoryPath, type FactoryViewListed } from '../factory/lib/views';
import { shortWorkflow } from './ask-card';
import { askRunId, askWorkflow, type NeedsYouItem } from './needs-you';

export interface AskNaming {
  subject: (ask: NeedsYouItem) => AskSubject;
  where: (ask: NeedsYouItem) => string | undefined;
  /** The group of the stage the ask came from, its colour and icon; undefined without a view or a stage. */
  tone: (ask: NeedsYouItem) => Tone | undefined;
}

/**
 * The naming for one project. `view` is its factory view, when one applies; `titles` the
 * item titles its items read names, by key.
 */
export function askNaming(
  projectId: string,
  view: Pick<FactoryViewListed, 'declaration'> | undefined,
  titles: ReadonlyMap<string, string> = new Map()
): AskNaming {
  const runHref = (ask: NeedsYouItem): string | undefined => {
    const runId = askRunId(ask);
    return runId === undefined ? undefined : `/console/p/${projectId}/r/${runId}`;
  };
  return {
    subject: ask => {
      const href = runHref(ask);
      // A wait no item holds is on a run: named as that run, so the workflow (`where`) is
      // named once, and a run never reads as an item.
      if (ask.item === undefined) {
        const runId = askRunId(ask);
        return {
          key: runId === undefined ? 'A run' : `Run ${runId.slice(0, 8)}`,
          ...(href === undefined ? {} : { href }),
        };
      }
      const key = ask.item.key;
      const title = titles.get(key);
      const itemHref =
        view === undefined ? href : factoryPath(projectId, `/items/${encodeURIComponent(key)}`);
      return {
        key,
        ...(title === undefined || title === key ? {} : { title }),
        ...(itemHref === undefined ? {} : { href: itemHref }),
      };
    },
    where: ask => {
      const workflow = askWorkflow(ask);
      if (workflow === undefined) return undefined;
      const name = shortWorkflow(workflow);
      if (view === undefined) return name;
      return stageOfWorkflow(view.declaration, name, null)?.label ?? name;
    },
    tone: ask => {
      const workflow = askWorkflow(ask);
      if (view === undefined || workflow === undefined) return undefined;
      const stage = stageOfWorkflow(view.declaration, shortWorkflow(workflow), null);
      return stage === undefined ? undefined : TONES[stage.group];
    },
  };
}

/** The titles the board's progress names, by item key, for `askNaming`. */
export function itemTitles(
  items: readonly Pick<FactoryItem, 'item' | 'progress'>[] | undefined
): Map<string, string> {
  return new Map(
    (items ?? []).flatMap(item => {
      const title = item.progress?.title ?? null;
      return title === null ? [] : [[item.item.key, title] as const];
    })
  );
}
