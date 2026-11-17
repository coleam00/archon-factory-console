import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../lib/format';
import type { FactoryItem } from '../skills/factory';
import { describeAnswer, linkWords } from './lib/item-answers';
import { runHref } from './lib/timeline';
import { factoryPath } from './lib/views';
import { SectionTitle } from './ItemTimeline';

/** The item's links to other items, from this item's side, each to that item's page. */
export function ItemLinks({
  projectId,
  links,
}: {
  projectId: string;
  links: FactoryItem['links'];
}): ReactElement {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle>Links</SectionTitle>
      {links.length === 0 ? (
        <p className="text-sm text-text-secondary">No links to other items.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {links.map(link => (
            <li key={link.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span
                className={
                  link.ended === null ? 'text-text-secondary' : 'text-text-tertiary line-through'
                }
              >
                {linkWords(link)}
              </span>
              <Link
                to={factoryPath(projectId, `/items/${encodeURIComponent(link.other.key)}`)}
                className="font-mono text-console-12 text-accent-bright hover:underline"
              >
                {link.other.key}
              </Link>
              {link.ended === null ? null : (
                <span className="text-console-12 text-text-tertiary">ended</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Rulings and answers given on the item, oldest first, as the item read orders them. */
export function ItemAnswers({
  projectId,
  answers,
}: {
  projectId: string;
  answers: FactoryItem['answers'];
}): ReactElement {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle>Rulings and answers</SectionTitle>
      {answers.length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing has been ruled or answered yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {answers.map((entry, index) => {
            const line = describeAnswer(entry);
            return (
              // Answers carry no shared id; their order is the read's and stable.
              <li key={index} className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2 text-console-12 text-text-tertiary">
                  <span className="font-medium text-text-secondary">{line.label}</span>
                  <span>{formatDateTime(line.at)}</span>
                  {line.runId === null ? null : (
                    <Link to={runHref(projectId, line.runId)} className="hover:underline">
                      the run
                    </Link>
                  )}
                </div>
                <p
                  className={`break-words text-sm ${line.withdrawn ? 'text-text-tertiary line-through' : 'text-text-primary'}`}
                >
                  {line.text}
                </p>
                {line.details.map(detail => (
                  <p key={detail} className="break-words text-console-12 text-text-secondary">
                    {detail}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
