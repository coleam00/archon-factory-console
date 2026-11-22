import { describe, expect, test } from 'bun:test';
import { boardModel, filterBoard } from './board';
import { BOARD_SHOW, BOARD_SHOWS, boardShowSearch, parseBoardShow } from './board-show';
import { PAGE, VIEW } from './board.test-fixtures';

describe('the board shows a number opens', () => {
  test('each of the shows parses; an unknown one is none, and leaves the whole board', () => {
    expect([...BOARD_SHOWS]).toEqual([
      'in-flight',
      'needs-you',
      'landed-today',
      'landed',
      'landed-of-all',
      'median-to-land',
      'found',
    ]);
    for (const show of BOARD_SHOWS) expect(parseBoardShow(show)).toBe(show);
    expect(parseBoardShow('bogus')).toBeUndefined();
    const model = boardModel(VIEW, 'cb-1', PAGE.items, new Map());
    expect(filterBoard(model, '', parseBoardShow('bogus'))).toBe(model);
  });

  test('Found opens a panel and narrows nothing; every other show narrows', () => {
    const model = boardModel(VIEW, 'cb-1', PAGE.items, new Map());
    expect(filterBoard(model, '', 'found')).toBe(model);
    for (const show of BOARD_SHOWS.filter(s => s !== 'found'))
      expect(BOARD_SHOW[show].narrows).toBe(true);
  });

  test('a show that opens the Table carries the Table view in its address', () => {
    expect(BOARD_SHOWS.map(boardShowSearch)).toEqual([
      '?show=in-flight',
      '?show=needs-you',
      '?show=landed-today',
      '?show=landed',
      '?view=table&show=landed-of-all',
      '?view=table&show=median-to-land',
      '?show=found',
    ]);
  });
});
