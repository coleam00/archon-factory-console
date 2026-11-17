/**
 * The factory map's sizes, in world units (px at zoom 1). Their own module because the layout
 * (`map-layout.ts`) and the feedback lane (`map-feedback-lane.ts`) both size from them, and
 * the layout imports the lane.
 *
 * Sized so the shipped eight stages fit one row of the Overview's frame (about 1100px wide at
 * 1440x900): 7 * COL_PITCH + CARD_W = 1592, which fits at k of about 0.66, so card titles draw
 * at about 11px and blurbs, chips and labels at about 10px. A longer row fits smaller, down to
 * READABLE_K (map-camera.ts); below the width that holds the row there, the map takes two rows.
 * The fit is limited by width, so a card can be tall enough to hold a whole blurb.
 */
export const CARD_W = 136;
export const CARD_H = 252;
/** Room between cards for a forward arrow and its one-word label at 15px. */
export const COL_PITCH = 208;
/** The least room between two rows. */
export const ROW_GAP = 48;
/** Vertical distance between lanes, and from a card's edge to the first lane. */
export const LANE = 26;
/** One line of a label at the map's label size. */
export const LINE_H = 18;
/** About how wide one character of a label draws, for a label's extent. */
export const CHAR_W = 9;
/**
 * The longest line a label wraps to, in characters: a label centred on a card stays inside
 * its pitch, clear of the labels on the cards beside it.
 */
export const WRAP = Math.floor((COL_PITCH - 2 * CHAR_W) / CHAR_W);
