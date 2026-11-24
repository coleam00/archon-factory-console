import { afterAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Scale } from 'lucide-react';
import { DocumentColumns, Panel, SectionHeading } from './document';
import { documentPageProblems } from './document.test-helpers';

const dom = new Window();
afterAll(async () => {
  await dom.happyDOM.close();
});

function render(element: ReactElement): HTMLElement {
  const root = dom.document.createElement('div');
  root.innerHTML = renderToStaticMarkup(element);
  return root as unknown as HTMLElement;
}

describe('documentPageProblems', () => {
  const section = (heading: boolean) => (
    <section data-doc-section="">
      {heading ? (
        <SectionHeading icon={Scale} eyebrow="E" title="T" tone="var(--node-wait)" />
      ) : null}
      <ul>
        <Panel as="li">a</Panel>
      </ul>
    </section>
  );

  test('passes a page of panels and headed sections', () => {
    const page = render(
      <div data-doc-page="">
        <Panel>band</Panel>
        {section(true)}
      </div>
    );
    expect(documentPageProblems(page)).toEqual([]);
  });

  test('finds a section with no heading row and a bare box', () => {
    const page = render(
      <div data-doc-page="">
        {section(false)}
        <p>loose text</p>
      </div>
    );
    expect(documentPageProblems(page)).toEqual([
      'section 0 does not open with a heading row',
      'top-level box 1 <p> is no panel or section',
    ]);
  });

  test('looks into a main column and aside: headed sections pass, a bare box does not', () => {
    const page = render(
      <div data-doc-page="">
        <DocumentColumns
          main={
            <>
              {section(true)}
              <p>loose text</p>
            </>
          }
          aside={<Panel>facts</Panel>}
          asideLabel="About"
        />
      </div>
    );
    expect(documentPageProblems(page)).toEqual([
      'column 0 of box 0: top-level box 1 <p> is no panel or section',
    ]);
  });

  test('a page with no body is reported', () => {
    expect(documentPageProblems(render(<Panel>x</Panel>))).toEqual([
      'expected one [data-doc-page], found 0',
    ]);
  });
});
