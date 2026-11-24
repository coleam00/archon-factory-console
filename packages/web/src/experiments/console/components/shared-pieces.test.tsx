import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { BackLink } from '../factory/BackLink';
import { EmptyNote } from './EmptyNote';
import { SegmentedControl } from './SegmentedControl';
import { SkeletonFigure, SkeletonGroup, SkeletonLine } from './Skeleton';
import { TabLink } from './TabLink';

const routed = (element: React.ReactElement): string =>
  renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

describe('the section-wide pieces of the Visual standard', () => {
  test('a skeleton is shapes a screen reader skips, labelled once by its group', () => {
    const html = renderToStaticMarkup(
      <SkeletonGroup label="Loading the board">
        <SkeletonLine />
        <SkeletonFigure />
      </SkeletonGroup>
    );
    expect(html).toContain('role="status"');
    expect(html.replace(/<[^>]*>/g, '')).toBe('Loading the board');
    expect(html).toContain('data-skeleton="line"');
    expect(html).toContain('data-skeleton="figure"');
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2);
    expect(html).not.toContain('Loading…');
  });

  test('an empty note is an icon, one sentence and its link', () => {
    const html = routed(<EmptyNote sentence="Nothing here yet" link={<a href="/x">More</a>} />);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<p[^>]*>Nothing here yet<\/p>/);
    expect(html).toContain('<a href="/x">More</a>');
  });

  test('a back link is a chevron and its label, leading where it says', () => {
    const html = routed(<BackLink to="/console/p/p1/factory" label="Overview" />);
    expect(html).toContain('href="/console/p/p1/factory"');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html.replace(/<[^>]*>/g, '')).toBe('Overview');
  });

  test('only the active tab carries the bar under it', () => {
    const html = routed(
      <>
        <TabLink to="/a" active>
          A
        </TabLink>
        <TabLink to="/b" active={false}>
          B
        </TabLink>
      </>
    );
    expect(html.match(/data-tab-bar/g)?.length).toBe(1);
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
  });

  test('a segmented control marks its active segment, as a link or a button', () => {
    const links = routed(
      <SegmentedControl
        label="Board view"
        active="table"
        segments={[
          { key: 'pipeline', label: 'Pipeline', to: '?view=pipeline' },
          { key: 'table', label: 'Table', to: '?view=table' },
        ]}
      />
    );
    expect(links).toContain('aria-label="Board view"');
    expect(links.match(/aria-current="page"/g)?.length).toBe(1);
    const buttons = routed(
      <SegmentedControl
        label="Board view"
        active="pipeline"
        segments={[
          { key: 'pipeline', label: 'Pipeline', onSelect: () => {} },
          { key: 'table', label: 'Table', onSelect: () => {} },
        ]}
      />
    );
    expect(buttons).toContain('aria-pressed="true"');
    expect(buttons).toContain('aria-pressed="false"');
  });
});
