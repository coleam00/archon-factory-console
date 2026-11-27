import type { PackGraph } from '../skills/items';
import type { ViewFile } from './api';
import { curatedView, type CuratedView } from './lib/curated-view';
import { mapArrows, type MapArrow } from './lib/graph-structure';
import { smallGraph } from './__fixtures__/small-pack';
import { smallViewFile } from './__fixtures__/small-view';

/** The tests' view file: a small How it works picture drawn over `testGraph`. */
export const testFile: ViewFile = smallViewFile;

/** The tests' pack graph: the Wirasm factory's shape in a few stages, written by hand. */
export const testGraph: PackGraph = smallGraph;

export const testView: CuratedView = curatedView(testFile, testGraph);

export const testArrows: MapArrow[] = mapArrows(testView, testGraph);
