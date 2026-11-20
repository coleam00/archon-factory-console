# The Software Factory section of the Archon console

Owner: Cole Medin. Status: proof of concept, started 2026-11-16. This page binds every change in
this repository. Where an issue and this page disagree, this page wins unless the issue says it
changes this page.

## Owner changes of 2026-11-19 (bind every later change; win over everything below, 2026-11-18 included)

From the owner's review of the finished work order #64. The section is close; these make it presentable.

1. **Less purple and pink, more green.** The brand magenta is an accent, not the page's colour. In the factory section and the ask card:
   - the recommended option is marked in **green** (`--success` family, soft background, a "Recommended" badge in green), never in the accent;
   - the option the person has **selected** gets its own selected state (accent border, check icon), and the recommended mark never looks selected, so two tiles never both look chosen;
   - the Confirm button stays the accent pink but **toned down** (a softer fill, for example the accent at reduced strength or `--accent-soft` with accent text), never the full-strength magenta block;
   - elsewhere, purple and pink are for one thing each (the running state, the active tab), not for card borders, headings or chips.
2. **Text never leaves its box.** Every card, tile, chip and heading in the section wraps long unbroken text (paths, URLs, ids: `overflow-wrap: anywhere`, `min-width: 0` on flex and grid children) and clamps where the standard says. A test renders a long unbroken path in an ask card and asserts nothing overflows.
3. **The Factory tab has two pages: Overview and Board.** Its sub-navigation drops Needs you (the project tab "Needs you" is that page) and How it works (the sidebar Factory entry is that page). Old links keep redirecting.
4. **The board is tall enough to use.** At 1440x900 every column shows at least two full cards without scrolling the page; the work-order strip collapses to one line (expand on click) and the found-by panel stays one line.
5. **A stage opens in place, not on its own page.** Clicking a stage on the Overview map opens a large modal over the Overview (Esc and the backdrop close it; the map keeps its position and zoom). The modal says plainly what it shows:
   - "What this stage does": the view file's curated drill-down;
   - "Items here now": the items in the stage, linking to their item pages;
   - "The real workflow": the step graph read from the pack's workflow files, behind a clearly labelled tab with one sentence saying it is generated from the YAML.
   The stage page route stays as a deep link that opens the same content. A failed read shows a retry, never a dead "Could not load".
6. **How it works moves and comes alive.** The sidebar Factory page is the only home of How it works. Its canvas shows the flow as a quiet, looping animation: three dots leave An issue, A work order and Found by agents and travel into Triage, on through Plan, Build, Checks and CI and reviews; there one dot goes on to Merged and one returns along the "unrelated finds" lane to Found by agents; the loop repeats. Off under reduced motion, pausable. Each kind on the canvas has its own colour: "A check on the change" and "What comes out" must differ.
7. **A look of its own, not the default.** The map and the How it works canvas get a considered visual identity: depth (soft shadow and a faint inner glow on cards), a subtle texture or grid on the canvas, light that follows the flow. Restraint is the rule: no neon, no heavy 3D, no motion that competes with the content, and nothing that slows rendering. If a treatment looks gimmicky at 1440x900 on a projector, it is out.

## Owner changes of 2026-11-18 (bind every later change; win over everything below, 2026-11-17 included)

From the owner's beauty review and the meeting with the pack's author (Rasmus) on 2026-11-18. The
goal: this stops looking like a proof of concept. It is what the owner presents on 2026-12-02, and
it goes to Archon `dev` as a draft PR for review, so everything stays generic (driven by the view
file, no pack names in code) and reads well to someone who has never seen Archon.

1. **"Merged", never "Landed", everywhere a person reads** (column, pill, numbers, timeline, How it
   works, work order strips: "3 of 5 merged"). Engine and pack ids keep `land` (`landgate`,
   `landed`); only the words a person reads change. An option id is never shown raw: a person reads
   the option's label.
2. **Needs you is Archon core, not a factory feature.** "The thing used the most, by me and by my
   agent, is the attention queue. It needs to be front and center." It becomes a **project tab,
   "Needs you", left of Runs, on every project** (factory or not): every open ask and paused wait
   on the project's items, from any workflow, answerable in place, its count on the tab. The
   Factory sub-navigation links to it with the same count; `factory/needs-you` redirects there.
   *Superseded by owner change 3 of 2026-11-19: the sub-navigation no longer links to it; the
   redirect stays.*
   The ask card is the one design used everywhere an ask is answered: question, context, option
   tiles with what each does and costs, the recommended option first and marked, "Something else"
   (free text), confirm in place.
3. **The board card is the approval card.** An item with an open ask shows its question and the
   recommended option on its board card, with a visible ping. Clicking it opens the full ask card
   in a popover over the board, answered in place, without leaving the board. *Amended by the
   owner on 2026-11-19 (#91), so the board fits its cards: such a card is short. Its title takes
   2 lines; the question takes 1 line, with the ping and "N questions" on it. The popover holds
   the rest.*
4. **Fewer board columns.** The view file groups stages into columns; the board draws one column
   per group, not per stage. For this pack: **Intake** (order, triage) | **Plan & build** |
   **Checks & review** (the check rounds, CI and PR reviews) | **Ready to merge** | **Merged**.
   Each column scrolls on its own; the page never grows with the longest column. A card still
   names its stage and step ("Checks · Code review · round 2"). Stage pages keep every stage.
5. **Where the factory lives.** Factory-wide things (How it works, and later the pack's settings)
   move to a **Factory** entry in the console's sidebar, next to Settings, one page per installed
   pack. The project's Factory tab keeps the live parts: Overview, Board, item, stage and step
   pages; its How it works link opens the sidebar page for its pack. *Superseded by owner change
   3 of 2026-11-19: the tab has no How it works link; `factory/how-it-works` redirects to the
   sidebar page.*
6. **Shadow steps are shown as shadows.** The pack runs some stages as shadows: they say what they
   would do and do nothing (admit, split, the land gate's would-merge, discoveries filing, the
   project's declared checks, order linking). Wherever one appears (map, board, stage page, item
   timeline) it reads plainly as "would ..." with what it would have done, marked "shadow", never as
   if it acted. Which steps are shadows is declared in the view file, not in code.
7. **Send-backs and found work.** How it works draws several labelled lines going back (returned
   by checks, sent back by CI or review, replan, answered asks restart a stage) and "unrelated finds
   become new work" from the discoveries drain to intake, marked as a shadow while the pack only
   decides what it would file.
8. **Later, not now:** a read-only page of the pack's settings and policies (under the sidebar
   Factory entry); reading engine-reported rounds and limits per item when the engine reports them
   instead of deriving rounds from events. *The read-only settings page is built (#74): the
   Settings tab of the pack's sidebar page.*

Not ours to build: forge views of issues and PRs (Thomas works on those in the existing UI), and a
YAML-to-graph generator for the detailed authoring view (Rasmus has one). Our view and overview files
stay the curated, simplified ones.

## Visual identity, 2026-11-19 (carries out owner change 7; binds the canvases)

Binds the Overview map, the How it works canvas (root and every drill-down) and the cards of the
stage modal's "What this stage does" (rule 2: one card language). The tokens live in
`packages/web/src/experiments/console/theme.css`; the line constants in `factory/canvas-lines.tsx`.
`factory/identity.test.ts` holds the canvas sources to them (no shadow utility, inline
box-shadow, oklch or hex literal), and `factory/tones.test.ts` holds the group colours apart.

**Why the canvases looked generic.** Every card was the same flat box: one 1 px border, one
radius, a flat `--surface` fill, no light and no depth, so the cards read as outlines on a
hole. The canvas was a flat `--surface-inset` box. Every line was the same 1.5 px grey, so the
main flow did not lead the eye. The How it works flow dot was a 4 px off-white circle, easy to
miss on a projector. Intake on the map was purple.

**What is taken, and why each is not a gimmick.**

- **Depth.** `.factory-card` carries `--card-depth`: a 1 px inner rim `oklch(1 0 0 / 0.05)` all
  round (the 3 px accent bar covers the top edge, so it is not a top highlight), a 1 px contact
  line `oklch(0 0 0 / 0.4)` and a fall-off `0 6px 16px -4px oklch(0 0 0 / 0.55)`. A clickable
  card's hover takes `--card-depth-hover` (rim 0.07, fall-off `0 10px 24px -6px` at 0.65) and the
  `--border-bright` border; nothing moves. *Static and small: on a dark canvas a card needs it to
  read as a surface at all.*
- **Tint.** The fill is `--card-tint`: the card's colour mixed 7% into `--surface` under the bar,
  fading to `--surface` by 48 px. *It ties the bar to the card without colouring the text area.*
- **Light.** A map card that holds an item is lit (`data-lit`): `--card-glow`, a 1 px ring of its
  group colour at 30% and a glow `0 8px 28px -8px` at 45%. The Merged card is never lit: it holds
  every merged item for good, so its light would say nothing. A stage drill-down card with items
  on its steps (`data-running`) wears the step graph's running mark, the same as the loop pill
  beside it: `--running-border` and `--running-ring` (a 3 px ring), the tokens StepGraph's
  `RUNNING_GLOW` reads; its tint stays its kind's colour. How it works has no live
  items; its light is the flow loop's glow round the card a dot rests on (rule 7). *Light
  carries information, where work is, and nothing else.*
- **Canvas.** Both viewports take `.factory-canvas`: `--canvas-texture`, a vignette
  (`radial-gradient` to `oklch(0 0 0 / 0.3)` at the edge) over a 24 px dot grid
  (`oklch(1 0 0 / 0.06)`, 1 px dots) on `--surface-inset`. The texture sits on the viewport, not
  the panned layer. *Two static background layers: no image, no filter, nothing repainted while
  panning, and the canvas reads as a surface.*
- **Lines.** A forward line is 2 px (`MAIN_STROKE`) with a gradient along the flow from
  `--border-bright` to `--text-secondary`, its head in the bright end. Send-backs stay 1.5 px
  dashed at 0.85 opacity (`BACK_OPACITY`); asks and shadow lines are unchanged. *The main flow
  leads the eye and the loops step back; no glow, no animation on lines.*
- **Type.** Rule 1's hierarchy on a card (kind 12 uppercase tertiary, title 15 semibold, text 13
  secondary) already holds. Only the map's live chips change, to `tabular-nums`, so a count does
  not jitter. *No new sizes.*
- **Colour.** Intake moves from `--node-prompt` (purple, hue 290) to `--tone-intake`
  `oklch(0.8 0.15 112)`, a lime 27 degrees from warning and 28 from land. The canvases' one
  accent use is the selected map card (a 2 px `--accent-muted` ring, the border unchanged); neither
  canvas, nor the stage drill-down's cards, has purple: the drill-down's Agent kind moves from
  `--node-prompt` to `--node-wait`, the teal How it works gives a stage
  (`stage/drilldown-kinds.test.ts`). *Owner change 1: more green, purple and pink kept for one thing each.*
- **Flow dot.** How it works: a dot 10 px across with a halo 20 px across at 0.28 opacity (a second circle in
  the same moving group, not a blur), in the kind colour of the card it travels to, a shadow move
  in `--node-opaque`. The glow round the card it rests on reaches 6 px out with a 12% fill. The
  map's dot is 10 px across in `--running` with a soft halo (`.map-flow-dot`; the legend's swatch,
  `.map-flow-swatch`, wears the same). *Presence on a projector (the #93 operator note), still
  only position and opacity animate.*

**Ruled out:** WebGL; SVG or CSS filters (blur, drop-shadow) on anything; noise images; animated
backgrounds; card lift or translate on hover. These tokens are named "depth", "glow" and
"tint", never "shadow": a shadow is a step that does nothing (rule 10).

## Visual standard (owner, 2026-11-18)

From the owner's beauty audit of 2026-11-18 (every Factory page at 1440x900 on a copy of the live
database): the section works but reads as a proof of concept. This standard binds every later
change that shows something and every check of one, and wins over every section below it. Where
it and "Owner changes of 2026-11-18" differ, the owner changes win. "The type floor" anywhere on
this page means rule 1's 12 px.

Tokens are named by CSS variable, with the Tailwind utility in brackets where one exists. They
live in two files: `packages/web/src/index.css` (`@theme inline`: `--text-console-*`,
`--radius-console-*`, `--tracking-console-*`; `:root`: `--node-command`, `--node-prompt`,
`--node-bash`, `--node-loop`, `--node-approval`, `--node-wait`) and
`packages/web/src/experiments/console/theme.css` (`.console-root`: surfaces, borders, text, accent,
status colours, `--node-script`, `--node-cancel`, `--node-opaque`, and the canvases' identity:
`--tone-intake`, `--card-depth`, `--card-depth-hover`, `--canvas-texture`, the running mark
(`--running-fill`, `--running-border`, `--running-ring`), and on `.factory-card`
`--card-glow` and `--card-tint`). Where no token exists yet, a
rule names the Tailwind utility or the value instead; the list closing this section names those
gaps.

### 1. Type scale

Geist for everything a person reads; Geist Mono for workflow, step and key names.

| Role | Token | Weight, colour, tracking |
|---|---|---|
| Page title | `--text-console-22` (`text-console-22`) | semibold, `--text-primary`, `--tracking-console-heading` |
| Section heading | `--text-console-17` | semibold, `--text-primary` |
| Card title | `--text-console-15` | semibold, `--text-primary` |
| Body | `--text-console-14` | regular, `--text-secondary` |
| Meta | `--text-console-13` | regular, `--text-tertiary` |
| Label | `--text-console-12` | medium, uppercase, `--tracking-console-label`, `--text-tertiary` |
| Number tile figure | `--text-console-22` | semibold, `tabular-nums` |

- **Floor: nothing a person reads is under 12 px on screen at 1440x900.** `--text-console-9`,
  `--text-console-10` and `--text-console-11` are not used for anything a person reads. Their
  existing uses are fixed by the redesign items, not by this one.
- The floor holds on the map and the How it works canvas at their fitted zoom. The opening zoom
  and the Fit button never scale below the zoom at which the smallest canvas text renders at
  12 px; with canvas text at 12 px or more, that zoom is 1.0. Where the drawing does not fit at
  that zoom, the canvas pans. A person may still zoom out by hand.

### 2. Cards

One card language for the map, How it works, the board, stage drill-downs, Needs you and the ask
card's option tiles (rule 9).

- Box: `--radius-console-12` (`rounded-console-12`), 1 px `--border`, `--surface` background.
  Hover: `--border-bright` border, `--surface-elevated` background. On the map, How it works
  and a stage's drill-down the box is `.factory-card` (theme.css) instead: depth, a top tint in
  its colour and light when it holds work ("Visual identity, 2026-11-19").
- Padding: 12 px (`p-3`); a drill-down card 16 px (`p-4`).
- A 3 px top accent bar in the stage group's colour (rule 5), inside the radius.
- Row 1: a 16 px icon and a kind label in the Label role ("AGENT · LARGE", as in 12-drill-build).
- Then the title in the Card title role, at most 2 lines; on a board card at most 3 (owner,
  2026-11-18: the board is where people find items, and a cut title costs a click).
- Then at most two lines of text at `--text-console-13`, `--text-secondary` (`line-clamp-2`).
- Live chips (rule 5's state colours) sit below the text.
- Minimum width on the map and How it works: **176 px**. A card is wider than tall (height at most
  its width; aim for 176-240 px wide by 120-176 px tall with every row present). A board card
  is as wide as its column.

### 3. Spacing

One 4/8 px grid: Tailwind's 4 px scale, every value a multiple of 4.

- Inside a card: 8 px between rows (`gap-2`).
- Between cards in a list or a column: 12 px (`gap-3`).
- Between canvas cards joined by a labelled line: 48 px, room for a label pill.
- Between page sections: 24 px (`gap-6`). Page padding: 24 px (`p-6`).
- Board columns: 12 px apart (`gap-3`), each at least 208 px wide (owner, 2026-11-18: five
  columns fit beside the sidebar at 1440x900, 5 x 208 + 4 x 12 = 1088 of 1100 px; narrower
  windows scroll sideways).

### 4. Lines

- Stroke 1.5 px; 2 px when hovered or when the line belongs to the selected card. A forward line
  on the map and How it works is 2 px always ("Visual identity, 2026-11-19"). Bends have an 8 px
  corner radius.
- Arrowheads: a 6 px filled triangle in the line's colour.
- Labels: `--text-console-12` on a pill (`--surface-inset` background, 1 px `--border`,
  `rounded-full`, 6 px by 2 px padding). A label never sits on a line.
- Forward lines: solid, a gradient along the flow from `--border-bright` to `--text-secondary`,
  the head in `--text-secondary`. A fan's short bar and stubs are solid `--text-secondary`.
- Send-back lines: dashed `6 4`, all in one colour, `--node-approval` (the colour the How it works
  lane already uses), at 0.85 opacity.
- Asks: dotted `2 3`, `--text-tertiary`.
- No line crosses a card, a label or another line.

### 5. Colour

- Group colours: intake `--tone-intake`, build `--node-wait`, check `--node-approval`, land
  `--node-script` (`factory/tones.ts`, which the board, the item timeline, the map and its
  legend all read). None is purple or pink, and each is at least 25 degrees of hue from the
  others and from `--running` and `--warning` (`tones.test.ts`).
- Board columns (owner change 4): Intake takes intake's colour, Plan & build build's, Checks &
  review check's, Ready to merge land's, and Merged `--success`.
- A group colour appears only as the accent bar, the icon, the legend swatch, the item
  timeline's dot (a swatch-sized marker), and on the canvases a card's faint top tint and its
  light: never a solid fill or a text colour. The one exception is the
  send-back line (rule 4), drawn in `--node-approval`, which the timeline's returned icon shares;
  the legend tells it apart by showing it as a dashed line, not a swatch.
- How it works kind colours (`overview/overview-kinds.ts`): input `--node-command`, stage
  `--node-wait`, check `--node-approval`, a person `--node-script`, gate `--node-bash`, outcome
  `--success`. No two are less than 25 degrees of hue apart and none is purple or pink (owner
  changes 1 and 6 of 2026-11-19); `overview-kinds.test.ts` resolves each token to its oklch value
  and holds both. Besides the uses listed below, a kind colour is a card's faint top tint, the
  faint glow the flow loop draws round a card while a dot rests on it, and the flow dot travelling
  to that card with its halo (rule 7). The check swatch shares `--node-approval` with the
  send-back lines, as the check group does above; the legend tells them apart the same way.
- State colours:
  - running: `--running` on `--running-soft`
  - needs you: `--warning` on `--warning-soft`
  - failed: `--error` on `--error-soft`
  - merged, done: `--success` on `--success-soft`
  - waiting: `--text-tertiary` on `--surface-inset`
  - shadow: `--node-opaque` (rule 10)
- A state pill or chip is the state's colour as text on its soft background.
- **"Needs you" is the one loud colour.** A card's Needs you state pill is the only filled pill
  (`--warning` background, semibold `--surface-inset` text), and only needs-you has the ping
  (rule 7). Chips that count needs-you (a column header, a map card) stay soft like the others.
- The brand gradient only where the console already uses it (the active tab bar).
- Components never write raw hex or oklch: they use `var(--token)` or the token's Tailwind colour
  utility.

### 6. States

- **Loading** shows skeleton shapes of the final layout, never the word "Loading" or "…". A block
  is `--surface-elevated` with `rounded-console-12` at the final card's size; a text line is a
  12 px bar at 60% or 40% width; a number tile shows a 22 px by 48 px bar. Skeletons pulse
  (`motion-safe:animate-pulse`).
- **Empty** shows a 20 px icon in `--text-tertiary`, one sentence at `--text-console-14`,
  `--text-secondary` saying what will appear here, and the most useful link at
  `--text-console-13` (for example "Answered lately").
- **Errors** keep today's wording rules: the alert says what could not be read, and what is
  already drawn stays drawn.

### 7. Motion

- State changes: 150 ms, ease-out (`transition-colors duration-150 ease-out`).
- Running: `animate-pulse` on the running chip's dot only.
- Card moved: an `--accent-soft` background held for 1.5 s, then fading over 300 ms.
- Needs-you ping: `animate-ping` on an 8 px `--warning` dot.
- How it works flow (the overview's flow loop): SVG (SMIL) animation of position and opacity only,
  on one timeline per view, no frame loop and no filter; pausable. A dot's halo is a second,
  faint circle moving with it, never a blur. CSS cannot stop SMIL, so under
  `prefers-reduced-motion` it is not rendered at all.
- Every animation sits behind `motion-safe:` and is off under `prefers-reduced-motion`. There the
  moved highlight still shows for 1.5 s, statically, with no fade.

### 8. Words

- **"Merged" replaces "Landed"** everywhere a person reads: the column, the pill, "merged today",
  the map card, How it works, the item page, "N of M merged". Engine and pack ids keep `land`
  (`landgate`, `landed`).
- **An option id is never shown raw.** A person reads the option's `label` when it has one, else
  the id in sentence case with hyphens as spaces ("send-back-once-more" reads "Send back once
  more"). The one exception is the reserved `other` option (label "Other"), which reads
  "Something else" (rule 9).
- Plain words, never raw enum values: "returned", "needs you", "round 2 of 3".

### 9. The ask card and the column header

**The ask card** (owner change 2), the one design wherever an ask is answered: the Needs you tab,
the Overview, the item page and the board popover.

- Box: `--radius-console-16` (`rounded-console-16`), 1 px `--border`, `--surface` background,
  20 px padding (`p-5`), 12 px between rows (`gap-3`). At most 760 px wide in a page; 480 px wide
  in the board popover.
- Header row in the Meta role: the item key in mono, in neutral text (`--text-secondary`,
  `--text-primary` on hover; never the accent) and always on one line (a long title beside it
  truncates instead), the stage, and the age on the right.
- Question: `--text-console-17`, semibold, at most 2 lines.
- Context: `--text-console-14`, `--text-secondary`, clamped to 3 lines with "More" (the
  ClampedSummary pattern).
- Option tiles: a wrapping row, 8 px apart (`gap-2`), one tile per option the ask carries, in
  its declared order. Each tile is at least 176 px wide, `--radius-console-12`, 1 px `--border`,
  `p-3`, holding the label (rule 8) at `--text-console-14` semibold, then what it does and costs
  (the option's `does` and `cost`, when it has them) at `--text-console-13`, `--text-secondary`,
  clamped to 2 lines.
- An ask with a `recommendation` moves the recommended tile first and marks it **green**: a
  `--success` border at 40% opacity, `--success-soft` background, and a
  "Recommended" badge at `--text-console-12` in `--success`. The green mark never looks
  selected. Under its text, one line at `--text-console-13`, `--text-secondary` gives the
  recommendation's `why`, after its `confidence` when it has one ("High confidence. Review is ready."). An ask
  without a recommendation keeps its declared order and marks no tile.
- **Selected** is its own state and depends only on the pick: a chosen tile gets a `--accent`
  border and a check icon (`--accent`), on `--surface-elevated` (a chosen recommended tile keeps
  its `--success-soft` background and its badge, and takes the accent border in place of the
  green one). Before any pick no tile looks selected, and picking a tile the ask does not
  recommend leaves exactly one tile looking chosen.
- **Nothing leaves the card.** Every text field (question, context, option label, `does`, `cost`,
  the recommendation's `why`, the confirm row's "Answer:" line) wraps long unbroken strings such as
  paths and URLs (`overflow-wrap: anywhere`), flex children that hold text have `min-width: 0`, a
  tile is never wider than its row (`max-width: 100%`), and the card never grows past its
  container.
- "Something else" is the ask's reserved `other` option, not a tile the card adds: it is drawn
  only when the ask carries that option (an ask declared `other: true`; the engine appends it
  last). Its tile reads "Something else" with "Write your own answer" under it, with a dashed
  `--border-bright` border. Choosing it opens a textarea in place (`--text-console-14`, 3 rows).
- Choosing a tile does not send. A confirm row appears under the tiles: "Answer: <label>", a
  Confirm button and a Cancel button. Confirm is the accent at reduced strength, never a
  full-strength block: `--accent-soft` fill, 1 px `--accent-muted` border, semibold `--accent`
  text, `--accent-muted` fill on hover. Cancel stays quiet (`--text-secondary`, no fill). Once
  sent, the card reads "Answered: <label>" in place.
- **The card draws an answer; it does not define one.** Which choices an ask offers, how many
  may be chosen, which need text, and what is refused belong to the ask and its owners: for an
  attention ask, its declared `form`, `options`, `other` and `recommendation`, checked by
  `attentionAnswerProblem` (`packages/workflows/src/schemas/run-wait.ts`) and answered today by
  `AttentionAnswerPanel`; for a paused gate (kind `awaiting_response`), the decisions the gate
  declares and the flow `ApprovalPanel` gives them. The card sends and accepts what those owners
  do, with one exception named below, and draws it in the anatomy above (every choice still goes
  through the confirm row):
  - a choice is a tile, labelled by rule 8 (or by the label its owner gives it, such as
    `ApprovalPanel`'s "Continue" and "Accept & complete");
  - a choice that takes several picks toggles its tiles: each chosen tile shows the selected
    state above, and the confirm row lists the chosen labels ("Answer: <label>, <label>");
  - an answer in words, or a choice whose owner takes text with it (required or optional, as
    `ApprovalPanel`'s comment on approve and its reason on every other decision), opens the textarea in place
    (`--text-console-14`, 3 rows) above the confirm row, and an ask answered only in words has no
    tiles and opens with the textarea;
  - Confirm is enabled when the owner would accept the answer, with one exception: an ask
    answered only in words also needs a non-blank character in its text, although the engine
    accepts blank text (Archon #5903), so a blank answer cannot be sent by mistake.
- A paused run the console cannot answer here (kind `owner_lost` or `unreadable`) has no tiles:
  the context says what happened, and the confirm row is replaced by a link to the run, where it
  is resumed or abandoned.
- Under 520 px wide (the popover, a 390 px phone) the tiles stack full width.
- The Needs you tab's heading reads "N things need you", in the Page title role.
- On a board card (owner change 3, as amended on 2026-11-19): one line holding the ping, the
  question at `--text-console-13` cut to that line (the whole question on hover and in the
  popover), and "N questions" when there are several; under it, the line Needs you shows for it
  at `--text-console-12` ("Recommended: <label>" when the ask recommends one, on the recommended
  tile's green mark), which wraps long unbroken text inside the card, as the Overview's compact
  card does with its tile (from 520 px wide, where the tile sits beside the question, it takes
  at most 45% of the row). The card's title then takes 2 lines, not 3.
- Owner change 2026-11-19, points 1 and 2: the recommended green, the selected state, the toned
  Confirm, the neutral item key and the wrapping above.

**The column header** (owner change 4), one per board column:

- A 3 px top bar in the column's colour (rule 5).
- Label: `--text-console-15`, semibold.
- Subtitle: `--text-console-12`, `--text-tertiary`, one line, truncated, naming the column's stages
  ("order, triage"). The Merged column's subtitle is "last 7 days".
- Count: `--text-console-22`, `tabular-nums`; a skeleton bar while it is not known (rule 6).
- State chips: `--text-console-12`, `rounded-full`, `px-2 py-0.5`, the state's soft background
  with the state's colour as text ("running 2", "needs you 1"). Only a state with a count above 0
  has a chip.
- Each column's body scrolls on its own.
- Empty-column placeholder: dashed 1 px `--border`, `--radius-console-12`, 96 px tall, holding
  rule 6's empty state ("Nothing in <column label> now").

### 10. Shadows

Owner change 6: a shadow step says what it would do and does nothing, and reads that way.

- It carries a "shadow" badge: `--text-console-12`, dashed 1 px `--node-opaque` border,
  `--node-opaque` text, no fill.
- Its line reads "Would <what it would have done>" at `--text-console-13`, `--text-tertiary`.
- On a card the accent bar is `--node-opaque`, not the group colour. A shadow line is drawn in its
  kind's dash (rule 4) in `--node-opaque`, with "shadow" on its label pill.
- Never `--running`, `--success`, `--warning` or `--error` on anything a shadow did: it did
  nothing.

### 11. References

Read-only, outside this repository. Take layout and anatomy from them, never sizes: their canvas
text is under the type floor. Where they differ from the rules above, the rules win (12-drill-build
puts a card's accent on its left edge; ours is the top bar of rule 2).

- `C:\Users\colem\OpenSource\factory-mission-control\docs\design\v3\refs\01-attention.png`: the
  "N things need you" heading; the option-tile row with the recommended tile first and marked;
  "Something else / Write your own answer".
- `...\v3\refs\20-board-pipeline.png`: the column header with label, subtitle, big count and
  state chips; "Merged, last 7 days"; the work order strip with "N of M merged" and its bar.
- `...\v2\refs\01-home-map.png`: the one-line map with the inputs on the left, labelled loops in
  lanes off the line ("fixes", "unrelated problems become new work"), the controls bar and the
  legend.
- `...\v2\refs\12-drill-build.png`: the kind label row above a card's title; labelled branch
  lines; a loop drawn as one labelled dashed line ("another round (max 2)"); a dotted line down to
  the card that asks you.

**Layout.** At 1440x900 the Overview shows Needs you and the top of the map in the first screen.
At 390x844 columns stack and the map pans.

**No token yet.** Spacing, motion (duration, easing), skeleton colour and icon size have no
console token; the rules above name the Tailwind utility or the value. Line strokes, dashes and
colours are constants in `factory/canvas-lines.tsx`; card depth, tint, light and the canvas
texture are tokens in theme.css ("Visual identity, 2026-11-19"). A later change may add a token
when it first needs one, in the files named above.

## Owner changes of 2026-11-17 (bind every later change; win over older text below)

The section has **two separate things**, each with its own file:

1. **The factory overview** (new, its own page). A hand-curated explainer of how the factory runs, for
   presenting: not live, not exhaustive, never generated from workflow YAML. Its own file per pack
   (`.archon/packs/<pack key>.factory-overview.json`, or `<pack>/.shared/factory-overview.json`), in the
   format of Mission Control's `app/map/factory-map.json` (read-only reference at
   `C:\Users\colem\OpenSource\factory-mission-control`): views (a root view and drill-downs), groups,
   cards (title, one line of text, icon, kind), edges (feeds, calls, and "loops back" lines: as many
   as the factory has, nested in one lane under the line, each on its own track and labelled where it
   rises into its target, never crossing a card or each other (the schema refuses a file whose lines
   would; it does not measure labels, so the shipped file's test checks that its label pills meet
   nothing, and a pack author keeps a short line's label short); an answer to an ask is drawn
   beside the ask's line; a line the pack only would act on is marked `shadow`; changed by the owner's
   audit of 2026-11-18, which asked for several labelled send-back lines). Interaction like Eric Tech's
   skill map (https://erictechpro.github.io/super-board/skill-map/): a sidebar listing every view with
   counts and its one line, a breadcrumb, click a card to open its drill-down, a legend, pan/zoom/fit, a
   full-screen mode over the whole screen with the legend docked bottom-left. Style: Mission Control's curated map, beautified (the console's tokens), not a hand-drawn look.
   **The flow loop** (owner change 6 of 2026-11-19), on the root view only: dots leave every input
   card together (An issue, A work order, Found by agents) and reach the first stage (Triage) at the
   same moment; one dot then carries on along the forward line (Plan, Build, Checks, CI and
   reviews, Ready to merge, Merged), resting a beat on each card while a faint halo in the card's
   kind colour shows round it. Where a send-back line returns to an input card, a second dot leaves
   at the same moment and travels it (CI and reviews, along "unrelated finds would become new
   work", to Found by agents), in the shadow colour because that line is a shadow. The loop rests, then starts again. "On to Merged"
   passes Ready to merge, because the dots follow the lines the page draws. Which cards and lines
   it follows is read from card and line kinds (`lib/overview-flow.ts`), never from ids; a view with
   no single input line has no flow. Drill-downs and the other send-back lines stay still. A
   "Pause flow" control beside Full screen stops and resumes it (a pause holds across full screen
   and views); under `prefers-reduced-motion` neither the dots nor the control are drawn. Each dot
  is 10 px across with a faint halo 20 px across, in the kind colour of the card it travels to ("Visual
  identity, 2026-11-19").
2. **The live factory view** (what the Factory tab shows today: Overview numbers, Needs you, the live
   map, Board, items, stages). Driven by the pack's **view file** (`factory-view.json`, below), which
   grows to carry, per stage, a curated drill-down (numbered phase columns of a few plain cards, each
   card `covers` the real step ids it stands for) and display names for steps. A coverage check reads
   the pack's real workflows and fails when a real step is covered by no card or by two. The live map
   is one row of stages with one feedback lane underneath; clicking a stage opens it.

**Step names, everywhere a person reads:** never a raw engine id such as `build__build` or
`rounds.review__review`. One function gives a step's display name: the view file's name when it has
one, else a cleaned id (a doubled include name collapses, a loop prefix becomes "round N", separators
become spaces). The raw id appears only on hover and on the step page.

## What it is for

A factory is Archon running a pack of stages over work items: an item comes in, stages work it,
and it ends as a landed change, a question for a person, or a clean stop. Today the only way to
see one is a run list. This section shows the factory itself:

1. **What the factory is made of.** A map of its stages and how they hand an item on, that you
   can click into: a stage, then the workflow behind it and its steps, then a step's prompt.
2. **Where every item stands.** A board with one column per stage. Each item is one card that
   moves left to right as stages work it, and back when a check returns it.
3. **What needs a person.** The questions (asks) items are waiting on, answerable in place.

The first audience is a live room: on 2026-12-02 Cole teaches a four-hour bootcamp on building
your own AI software factory, and this section is the screen he presents from. Someone who has
never seen Archon must understand, from the map alone, what makes up the factory, and from the
board alone, where their own items are. Plain words over engine vocabulary, everywhere a person
reads.

It replaces a separate dashboard (Factory Mission Control, a Neon app). Two web UIs for one
factory confuse people; this lives inside the console instead. Mission Control's ideas carry
over (map, board, item timeline), its code mostly does not: it read a different pack's state
documents through Neon live queries.

## Rules every change follows

1. **Generic, driven by a declaration.** The console never names a pack's stages, workflows or
   nodes in code (`.archon/direction.md` §web-ui). What a factory looks like comes from a
   *factory view* declaration (below). Code reads the declaration and the engine's records.
2. **The item is the unit; its position is derived.** Where an item stands is computed from its
   runs (the live run and its running step, else the last run's workflow and outcome), its open
   asks and whether its change landed. Nothing stores a column (`.archon/direction.md`
   §software-factory).
3. **Read-only engine additions, no migrations.** New server routes only read. No change to the
   database schema in this repository: the console reads tables the engine already has. The
   live factory and the console share one database.
4. **Console, not a new app.** Use the console's components, tokens (`theme.css`, the
   `text-console-*` and `radius-console-*` scale; `bun run lint` enforces them), the `useEntity`
   cache and skills layer, and the dashboard SSE for live updates. Copy patterns from existing
   pages (RunsPage, RunDetailPage, RunGraphPanel, MetricsPage) before inventing new ones.
5. **Live within 5 seconds.** When a run starts, changes step or ends, or an ask opens or
   closes, every Factory view that shows it updates within 5 s without a reload.
6. **Never start a server on the live factory's home.** Use `bun run dev:console` (a throwaway
   home seeded with a read-only copy of the live database). See ENGINEERING.md.

## Where it lives

- A project tab, **Needs you**, first, left of Runs, on every project (`ProjectViewTabs`, route
  `/console/p/:projectId/needs-you`), with its count of asks and waits as a soft needs-you chip (rule 5; owner
  change 2). It is console core, not part of the Factory section: every page of a project sits
  under one layout (`ProjectAttentionLayout`) holding the project's attention queue and stream.
- A last project tab, **Factory**, after Runs, Chat and Metrics. It shows only when a factory view
  applies to the project (below). Without one, nothing else changes.
- A **Factory** entry in the console's sidebar (`ProjectRail`), directly above Settings, for what
  explains a pack rather than a project (owner change 5). It shows only when at least one
  installed pack has a factory overview file, or a broken one. Its routes:

  | Route | Page |
  |---|---|
  | `/console/factory` | One card per pack with an overview file: the pack's name, its caption, how many projects run it (a factory view of the pack applies to them), each linking to its Factory tab, and "Overview file is broken" when every file for it is. With one pack and no unreadable root or project to report, it opens that pack's page (replace) |
  | `/console/factory/:pack` | Redirects (replace) to `how-it-works` |
  | `/console/factory/:pack/how-it-works` | How it works: the pack's factory overview (`?view=<id>` opens a drill-down, full screen as before), under a header titled by the pack's name as a person reads it (the name part of `owner/name`, its separators made spaces, first letter upper-cased: "Archon software factory"; the raw id on hover; the same on every tab and on the index's card; the overview's own title heads the map as the root of its breadcrumb), with a quiet "Source" toggle beside the title that opens the file it was read from (never a line of the header), and with the pack's tabs (underlined, as the project tabs). `:pack` is the pack key (`owner.name` when installed). The pack's tabs are How it works and Settings |
  | `/console/factory/:pack/settings` | Settings (owner change 8, read-only): one card per setting the pack's `.pack/pack.yaml` declares, in its order, with its name in sentence case, the key, the pack's description (clamped) and default, and each project's value from its `.archon/packs/<pack key>.yaml` ("pack default" when empty or unset). The overview file's `settings` map marks shadows (rule 10's badge) and which values are a policy or the checks file: a path shows as it is written (no forge link), "file not found" when the project has no such file, and a checks file lists its checks. Keys a project sets that the pack does not declare are listed as "Not declared by the pack"; a map key the pack does not declare is an error on the page |

  Which file a pack page reads: the pack's own `.shared/factory-overview.json` (bundled, global
  or installed) when it ships one; else the first project, by name, whose own files give one
  (`.archon/packs/<pack key>.factory-overview.json`, or a pack folder in its checkout), named on
  the page as "Read from <project>" behind the header's Source toggle. A broken pack file falls back to a project's file and its
  error stays listed on the page; a pack whose files are all broken shows only their errors.
  One read-only route lists all of this (`GET /api/factory/packs`).
- Routes, all under `/console/p/:projectId/factory`:

  | Route | Page |
  |---|---|
  | `factory` | Overview: one paragraph saying what this factory does, the numbers strip, the newest three asks as compact cards, then the map. `?stage=<id>` opens that stage as a modal over the map (The map, Click) |
  | `factory/board` | The board (default view Pipeline, with a Table alternative) |
  | `factory/needs-you` | Redirects (replace) to the project tab `needs-you`, keeping the query string, so old links land |
  | `factory/how-it-works` | Redirects (replace) to the sidebar page for the pack the project's view draws (`/console/factory/<pack key>/how-it-works`), keeping the query string and hash, so old links and bookmarks land |
  | `factory/overview` | The same redirect, in one hop |
  | `factory/items/:key` | One item: its timeline, asks, links and change |
  | `factory/stages/:stage` | One stage, full page, as a deep link: the same content the Overview's stage modal shows (its label, blurb and the tabs "What this stage does \| Items here now \| The real workflow"), under a back link to the Overview |
  | `factory/steps/:workflow/:node` | One step: the items on it now, its prompt (command file), its YAML, the model it runs on |
  | `factory/*` | Any other path: "No page here" inside the section, with links to Overview and Board |

- Inside the Factory tab a small sub-navigation, on the line of the view's title, switches
  Overview and Board, each its own route; the tab has no other pages (owner change 3 of
  2026-11-19). Needs you is the project tab beside it and How it works the sidebar Factory page;
  the old `factory/needs-you`, `factory/how-it-works` and `factory/overview` addresses redirect
  there. Item, stage and step pages have a back link to where you came from.

## The factory view declaration

A JSON file that maps a pack onto this section. The pack's author writes it, so a pack can
present itself without the console knowing it. Shape (validated with zod in
`packages/workflows`; the schema is the owner, docs and examples derive from it):

```jsonc
{
  "version": 1,
  "pack": "Wirasm/archon-software-factory",       // the pack this view draws
  "title": "Software factory",
  "summary": "One paragraph, plain words: what goes in, what comes out, where people step in.",
  "stages": [                                      // map cards and stage pages, left to right
    { "id": "order", "label": "Order", "blurb": "Takes a work order and makes it one item.",
      "short": "Turns orders into items",  // optional: the map card's one line, at
      "group": "intake", "workflows": ["order"] },   // most 24 characters; else the blurb
    {
      "id": "build",
      "label": "Build",
      "blurb": "Writes the change and opens a draft pull request.",
      "group": "build",                            // colour group: intake | build | check | land
      "workflows": ["deliver"],                    // pack entrypoints whose runs count here
      "nodes": ["build__build", "rounds.fix", "hostrounds.hostfix"]  // optional: only while one of
                                                   // these steps runs (id or dotted prefix;
                                                   // an included node is <include>__<node>)
    }
  ],
  "columns": [                                     // the board's columns, left to right: each a
    { "id": "plan-build", "label": "Plan & build", // group of stages, every stage in exactly
      "blurb": "Plan, build", "stages": ["plan", "build"] },  // one, the landed stage alone;
    { "id": "merged", "label": "Merged", "blurb": "Merged changes", "stages": ["landed"] }
  ],                                               // absent: one column per stage
  "placement": {                                    // where an idle item sits after a run ended
    "order:ready": "triage",
    "triage:build": "plan", "triage:narrow": "plan",
    "plan:planned": "build", "plan:ask": "plan",
    "deliver:ready": "ready", "deliver:waiting": "host", "deliver:returned": "build",
    "deliver:replan": "plan", "deliver:ask": "build",
    "landgate:*": "ready"                           // workflow:* takes every completed run no
  },                                                // exact key does, one with no outcome too
  "endings": { "triage:*": "Closed by triage", "order:refused": "Refused at intake" },
                                                   // outcomes that end an item without a change
  "landed": { "stage": "landed" },                 // the column for an item whose change merged
  "rounds": { "workflow": "deliver", "loop": "rounds" },
  "returns": [ { "workflow": "deliver", "node": "rounds.verdict__verdict", "outcome": "return" },
               { "workflow": "deliver", "node": "hostrounds.host__host", "outcome": "return" } ],
  "approves": [ { "workflow": "deliver", "node": "rounds.verdict__verdict", "outcome": "approve" } ],
                                                   // a round is approved only by a declared
                                                   // approval; with neither, it needs a decision
  "verdicts": { "deliver": { "rounds.tests__tests": { "sound": "approved", "return": "returned",
                                                      "ask": "asked" } } },
                                                   // what other steps' outcomes mean, for words
                                                   // only (approved | returned | asked)
  "asked": ["plan:ask", "deliver:ask"],            // outcomes that stop to ask you
  "change": { "workflow": "deliver", "pointer": "/change" },   // where the PR URL is in a result
  "partOf": { "workflow": "order", "pointer": "/part_of", "outcome": "ready" },
                                                   // where a result names the item's work order:
                                                   // only runs that completed with `outcome`;
                                                   // read only without a part_of link
  "itemTitle": { "input": "item" },                // item title = title line of this run input
  "map": {
    "cards": [ { "stage": "build" } ],              // the stages the map shows, each in its
                                                   // column's card, one row
    "arrows": [ { "from": "build", "to": "checks", "label": "built" },  // every arrow the
                { "from": "checks", "to": "build", "label": "returned" },  // map draws; leftward
                { "from": "checks", "to": "plan", "label": "replan",  // ones send back;
                  "person": true } ],                // a person's step, no hand-off backs it
    "notes": [ { "text": "You answer asks here", "near": "needs-you" } ]
  }
}
```

**Discovery.** For a project, the console looks for, in order: the project file
`.archon/packs/<pack key>.factory-view.json` (a project may present an installed pack it cannot
edit), then `<pack>/.shared/factory-view.json` in any pack the project can run (project, global,
installed, bundled), the way metric views are found (`packages/workflows/src/metric-views.ts`).
A view applies to a project when the declaration is found and the project has at least one run
of a workflow the view names, or the project file exists. That is the switch Rasmus described:
enable the factory for a project and its view appears.

This repository ships the declaration for `Wirasm/archon-software-factory` as the project file
`.archon/packs/Wirasm.archon-software-factory.factory-view.json`. Proposing it upstream into the
pack is later work. The pack's `discoveries` drain runs after deliver but moves no item, so the
declaration names no stage for it: runs of a workflow no stage lists do not place an item. Its
`discoveries` field names the workflow instead, and where each completed drain's result lists
what it decided: the board's "Found by the factory" panel and the Overview's tile read it (#70).
Its `shadows` field names the steps the pack runs as shadows (admit, split, the project checks,
the land gate and the drain) and how each one's value reads; the item timeline, stage pages,
board and map show their decisions as shadows (#80).

`map.arrows` declares every arrow the map draws, a hand-off from one workflow to another
included; the map reads no other source (see The map). `bun run check:factory-view` keeps the
two true to each other in this repository (#28). It reads the pack graph from the installed pack
where a home is named (failing when the snapshot of `archon pack graph` committed beside
the view file differs from it), and from that snapshot in CI. It fails on a hand-off between two
stages that the pack declares (every binding, installed by a trigger file on this machine or
not; owner ruling of 2026-11-17) that the view does not declare, and on a declared arrow no
such hand-off backs, unless it is marked `person: true` (a replan, a landing), joins two
different stages of one workflow (its steps), or runs into the Merged column (the `landed` stage). An arrow back into its own stage is a rerun only
a hand-off starts, so it is never exempt. The same check fails on a real step no drill-down card
covers or two cover, and on a step or workflow the view names that the pack does not have.

## Data

The items and the stage graph are the engine's own reads, which any API client uses:

- `GET /api/items/window?project=&since=&limit=&after=` (#5815) is the items read: a page of the
  project's items, each read whole (`ItemRead`). The console walks it from a far-back `since`
  (1970, so every item with a run shows) by its `after` cursor, which carries the window, 100
  items a page. The window lists an item once one of its own runs started, so an item whose
  first start is still queued for capacity, or that only a link or ruling created, is on no
  board, map or number until its first run starts; one linked `part_of` a work order counts
  only in that order's "N of M merged" (as not started). Showing those needs the window to
  count queued starts (an engine change), not a second reader here.
  The window pages by item id; the console sorts newest activity first (the latest of each
  item's runs' end, or start while one runs), since a board column keeps the order it is given.
- `GET /api/packs/{pack}/graph?codebaseId=` (#5848, what `archon pack graph` prints) gives the
  pack's stages, outcomes and the arrows between them, each active (a trigger file in this
  install starts it) or only declared by the pack. `{pack}` is the pack's folder key
  (`Wirasm.archon-software-factory`), not `owner/name`. The map does not read it: it draws
  only the view file's arrows (owner ruling of 2026-11-17 on #30); comparing the view file with
  the graph is the coverage check's job (#28).

What those reads do not carry comes from **one read-only route file**,
`packages/server/src/routes/api.factory.ts`:

- `GET /api/factory/views?codebaseId=` the factory views that apply to the project. Each carries
  `packKey` (the graph's `{pack}`) and `runNames` (each workflow a stage lists, as its runs record
  it and the graph names its stage), so the web never re-derives either.
- `GET /api/factory/packs` every pack with a factory overview file across the install, by key:
  the overview its page shows (the pack's own file, else the first project's by name, named in
  `readFrom`), the projects a view of it applies to, and its files that failed; beside them, the
  scope roots and projects that could not be read.
- `GET /api/factory/pack-settings?pack=<key>` the pack's Settings tab: the settings its
  `.pack/pack.yaml` declares (the install's, else a project's pack folder), as the overview's
  `settings` map presents them, and for each project a view of the pack applies to, its value
  of each from `.archon/packs/<key>.yaml`, the policy or checks file a value names looked up in
  its checkout, and the keys the pack does not declare.
- `GET /api/factory/workflow?codebaseId=&workflow=` one workflow a view names, for the stage and
  step pages: its steps keyed as run events name them, the loop groups and included workflows
  that frame them, and each step's kind, model, `when:`, prompt and authored YAML.
- `GET /api/factory/progress?codebaseId=&keys=` (`keys` repeated, up to one window page) the
  progress the board needs and `ItemRead` does not carry, by item key: the running run's id,
  workflow and deepest running step, the current loop iteration of the declared `rounds` loop,
  the returned count, the change URL from the declared pointer with its pull request number,
  the title, each declared run's workflow as the view names it with the step it failed at, and
  `partOf`: the work order the newest run of the declared `partOf` workflow that completed with
  its declared outcome names (an empty value there means none; a refused run is never read), and
  `shadows`: the newest decision of each shadow step the view declares. Beside `progress`, `members` lists for each asked key the
  items with an active `part_of` link to it, so a member with no run yet counts. A key may name
  an item with no runs (a work order). The web joins each window page with it: one reader,
  `factory/lib/factory-items-read.ts`. After the walk it reads every work order an item belongs
  to that the window lacks (no run of its own, or no item row) in one more progress request per
  100 keys, never one per item; a key that request leaves out has no item row.
- `GET /api/factory/discoveries?codebaseId=` what the completed drains of the view's
  `discoveries` workflow decided, read at its pointers: each finding they decided to file with
  its kind, verified line, source item, time and the item whose title covers it (case-insensitive
  exact, over every item on the project), and how many they held and dropped; 404 when the view
  declares none.
- `GET /api/factory/item?codebaseId=&key=` one item, its read and progress, plus what its
  timeline needs per run and neither read carries: the workflow as the view names it (a
  stage's, or the `discoveries` drain's, which places no item), the run's cause, its
  cost, its running step, each round of the declared `rounds` loop with the steps that
  recorded an outcome in it and the deciding step's summary, and what each shadow step decided
  on the run (one per round in a loop; a drain's run included).
- Whether a change merged comes from the change host through Archon's forge seam (the same
  `pull request view` operation the packs use), read by the server and cached for at least
  60 s. The pull request is the one the run's forge records name, else the one on a branch
  the item's runs recorded whose URL is the change (an earlier run may have opened it). An
  empty change URL is no URL: the item takes the latest earlier run that named one. When no
  run named one but a delivery run returned an empty URL, the change is the first pull request
  found on the item's run branches, newest branch first, in the project's registered remote,
  and the item shows
  that pull request's own URL ("the change", unlinked, until the host names it). The
  browser never calls GitHub. A first lookup slower than the server's wait answers `pending`
  for that read only (never cached); the console reads again every few seconds while any item
  is pending. A lookup that failed answers `unknown` and is cached like any other answer.

All derivation (column, card fields) is pure TypeScript in the web package, with unit tests,
fed by these reads. Logic worth porting from Mission Control (`C:\Users\colem\OpenSource\factory-mission-control`,
read-only reference): `app/lib/board.ts` (placement and card fields), `app/map/live.ts`
(which card a running step belongs to), `app/components/FactoryMap.tsx` (pan, zoom, fit, details
panel). Port the logic and ideas, not the styling: Mission Control used its own tokens.

## Overview page

1. Title (Page title role) and the declaration's summary, clamped to two lines with More.
2. **Numbers strip:** items in flight, need you (the Needs you tab's count of asks and waits,
   linking there), merged today, merged in total ("N of M merged", M excluding items closed by
   triage), median time from first run to merged ("median to merged"). Each tile is a number
   tile in the card language: a 16 px icon and its label in the Label role, then the figure at
   `--text-console-22`. Until the items read first answers, each tile shows a skeleton bar
   (Visual standard, rule 6) in place of its figure; while any item's merge state is pending,
   every number but needs you and found by the factory shows the skeleton bar too, never a count
   that may be wrong. A first read that fails replaces the tiles with an alert saying so; a
   refresh that fails says so above the last values read (as the map and the board do).
   When the view declares `discoveries`, a sixth tile, "found by the factory", counts what the
   drains decided to file that no item carries yet and links to the board's panel; it has its
   own read, so it never holds up the other five.
3. **Needs you:** the newest three open asks and waits as compact ask cards (Visual standard rule
   9): the item, the question, the recommended tile (or the first), and **Open**, which leads to
   that card on the project's Needs you tab (`?ask=<ref>`), where it is answered; then "N more on
   Needs you". Nothing shows when nothing waits.

The Needs you tab (`/console/p/:projectId/needs-you`) lists every open ask and paused wait on the
project's items and runs, newest first, grouped under their item, each an ask card answered
through `POST /api/attention/answer` (a paused gate through its run's respond route), and an
answered card says so for 5 s before it folds away. Its heading, the tab and the Overview's
number all read one count, `needsYouCount`. Under the open asks, **Answered
lately** lists the three newest sets of asks an item settled, as folded cards: each question and
what it was answered with, and the stage the settling started again (engine #5834; the workflow on
a project with no factory view), linking to that run with its status, or that no run started
from these answers. It joins the item read's `asks_settled` answer to the run whose `cause` names
the same asking run, so an answer given through the CLI or by an agent shows too. With no
factory view it reads the engine's items window alone. With nothing open, the tab shows rule 6's
empty state, when something was last asked, and those three cards.
4. **The map.**

## The map

Changed by #68 (owner audit of 2026-11-18): the board's columns, always one row, one clean lane.

- **One card per board column** (owner change 4): the view file's `columns`, in order, each
  card holding the stages of its column that `map.cards` lists, in the column's order; a
  column left with none is not drawn. Without `columns`, one card per stage, as the board. For
  the shipped file: Intake, Plan & build, Checks & review, Ready to merge, Merged. `col` and
  `row` on a card are accepted, so an older view file still loads, and ignored.
- **Always one row**, left to right, at zoom 1 (the type floor; rule 1). Where the row does not
  fit the frame, the map pans sideways, opening (and Fit returning) at the row's start, so the
  flow reads left to right from Intake (owner ruling on #71). The shipped map is about 1226 px
  wide with its padding, so at 1440x900 Intake shows whole and Merged is partly off the right;
  it pans more on smaller screens.
- **Cards in the card language** (rule 2), 184 px wide by 168 tall, every card one size so the
  lane under them is straight: a 3 px top bar in the group colour, the group's icon and kind
  label ("Intake", "Build", "Check", "Merge", "Merged"), then:
  - a card of one stage: the stage label (Card title role, two lines at most), its one short
    line (the stage's `short`, at most 24 characters; without one, its blurb clamped to two lines),
    and its chips on the bottom row. The whole card opens the stage.
  - a card of several stages: the column's label, then one row per stage, each opening its
    stage: the stage label with its "here" chip, and under it its short line (or blurb,
    one line), which the stage's needs-you chip takes the place of while one waits there.
- **Live chips** are rule 9's pills at `--text-console-12`: "2 here" (running colour with a
  pulsing dot while a run works an item there, rule 7; the waiting colour otherwise),
  "1 needs you" (soft, rule 5), and "checking…" in place of a count where a board column would
  show a skeleton bar for a pending merge state. The cards and arrows are drawn from the view
  file as soon as it is read: until the items read answers each chip is a skeleton bar (rule 6;
  never "0 here", never "…"), and the chips fill in on the same cards when it does. If that
  first read fails, an alert above the map says so and the cards stay drawn with no chip, their
  details saying the items could not be read.
- The arrows are the view file's `map.arrows` and no others: the map does not read the pack
  graph, so the view file declares every hand-off, between workflows too, and every send-back.
  Direction comes from card order: an arrow into an earlier card is a send-back, into a later
  one a forward hand-off. Inside one card, an arrow to a later stage of the card is not drawn
  (the rows show that order); one into its own stage or an earlier one of the card is a
  send-back. An arrow's `back` flag is accepted, so an older view file loads, and ignored.
- **Forward hand-offs** run only between neighbouring cards: a short straight line at the
  cards' mid-height, its outcomes on one pill above the line (rule 4), one outcome per line
  ("build, narrow" stacks). The gap between two cards is the pill's width plus 8 px each side,
  at least 48 px. A hand-off that would skip cards has no route of its own: its outcomes join
  the label of the hand-off from its source card to the next, as "<outcome> → <target card>",
  and where no such hand-off is declared, one is drawn for it.
- **One feedback lane** under the row carries every send-back, dashed `6 4` in
  `--node-approval` (rule 4). A card has one source leg, near its right edge, and one target leg
  per stage of it something returns to, spread over its left half in its stage order. Each
  send-back drops from its card's source leg to the lane, runs right to left, and rises into
  its target stage's leg; every send-back into one stage shares that leg and one pill under the
  lane ("returned" on Build, "replan, answers" on Plan). A send-back inside one card (an asked
  plan answered) is a short U from the card's source leg into its stage's leg. Where runs
  overlap they are one line, drawn once. Pills sit under the lane, each on the first band down
  where it meets no other pill. Nothing crosses: no line crosses a card, a pill or another line.
- **Flow** (the map's addition to rule 7): while a run works an item on a card, a 10 px dot in
  the running colour, with a soft halo, travels along the hand-off into that card, over and over, fading as it
  arrives, where the running chip's pulsing dot holds it. The first card, with no hand-off into
  it, has none. Off under reduced motion.
- Pan by drag, zoom by scroll or buttons, Fit button; opens fitted.
- **Click** a card or a stage's row: the stage opens as a large modal over the Overview (owner
  change of 2026-11-19, point 5), 40 px inside the window from md up and the whole screen under
  it, its body scrolling on its own. The URL says which (`?stage=<id>`, pushed, so it can be
  linked and Back closes it). Esc, the close button and a press on the backdrop close it too;
  the Overview stays mounted under it, so the page keeps its scroll and the map its pan, zoom
  and open details panel. Focus moves to the close button, stays in the modal, and returns to
  the stage that opened it. The `factory/stages/:stage` route shows the same content full page.
  Under the stage's label and blurb, three tabs, and between the tabs and the open tab one
  notice about the items read, which every tab reads from: a failed first read says why with a
  Retry; a failed refresh says this stage shows the last items read, and why, with a Retry, so
  no tab passes old items off as here now and none glows a step from them; a slow read says it
  is trying again. No tab draws a notice of its own:
  - **What this stage does** (first when the view file gives the stage a drill-down), with the
    line "The factory's summary of this stage, from its view file.": numbered phase columns of
    plain cards, the loop as one labelled frame around the phases it repeats, a card glowing
    and naming the items on a step it covers now, and a click on a card listing the real steps
    it stands for, each linking to its step page. A stage without one says it has no summary
    and that the real workflow shows its steps.
  - **Items here now**: the items in the stage, from the same read as the card's chips, each
    linking to its item page with its state (needs you, the run line of the run working it, or
    the board's merged, failed or waiting); rule 6's empty state when there are none.
  - **The real workflow** (first when the stage has no drill-down), with the line "Generated
    from the pack's workflow files; shows every step.": each workflow's steps drawn as a graph
    (the RunGraphPanel pattern: dagre, top to bottom; loop groups drawn as a framed group
    labelled "up to N rounds"; included workflows as nested groups). A step that is running now
    for any item glows, and above the graph each item running the workflow is named, linking to
    its item page. Clicking a step opens the step page. The graph's read shows its skeleton,
    tries once more after a second when the request got no answer at all (a server
    restarting), and on failure says which workflow could not be read and why, with a Retry
    button. The server keeps a project's discovered workflows for this graph: younger than 30 s
    they are served as they are, older they are served once more while a refresh runs. So an
    edited workflow file shows from the second read made 30 s or more after the last
    discovery; runs never read this list.
- A card's **details** button: a panel beside the map listing each of its stages in turn, with
  its blurb, the notes the view file places by it, its shadow steps (below), the items in it
  (linking to each item), and the workflows behind it with links to their steps (each opens the
  stage on "The real workflow"). A step page's back link opens its stage over the Overview.
- A stage that holds a shadow step (one its drill-down's cards cover, owner change 6) carries
  rule 10's badge: on a card of several stages at the start of its row's second line, so the
  stage's name keeps its width, and beside the name on a card of one stage. The badge marks a step of the stage, not the stage, so it
  says which: its hover, and the stage's details under "Shadow steps", give one line per
  shadow step with what it decided lately ("Project checks · last 5: all passed ×5"), or
  "nothing decided yet"; before the items are read, "…", and "could not be read" once that
  read failed.
- A legend under the map names the cards' colour groups in plain words ("Merging it",
  "Merged"), and draws each kind of line as the map does: solid, "Hands the item on"; dashed,
  "Sends it back, labelled where it returns to"; the running dot, "A dot moves along a line
  while a run works an item there". When a stage holds a shadow step, it shows the badge: "A
  step that decides what it would do and does nothing; hover it for which and what it
  decided".

## The board

Columns are the declaration's `columns` in order, each a group of stages (without them, one
column per stage), the Merged column among them; a card sits in the column holding its stage.
Placement of one item,
first rule that matches. The board, the map and the item page all place through one function
(`factory/lib/placement.ts`), so they never disagree:

1. A run of a declared workflow is **running** on it: the stage whose `workflows` (and `nodes`,
   when given) match the run's workflow and deepest running step. On a step no stage names (a
   loop group between rounds, or none between steps) the board, the map and the item page each
   keep the item in the stage it sat in on their last read when that stage lists the workflow,
   so a card does not hop; else the workflow's first stage. A view opened while a run is
   between named steps has no last read, so for that moment it can show the workflow's first
   stage where a view open longer still holds the item.
2. Its change **merged**: the Merged column.
3. Its last completed run's `workflow:outcome` is in `placement`, else its `workflow:*` (which
   also places a run that returns no outcome, such as the pack's `landgate`): that stage.
4. Its last run's outcome is in `endings`: not on the board; counted in a folded row
   "N closed by triage" at the end of the board's toolbar, opening a list over the board, each
   linking to its item.
5. Its last run **failed** or was cancelled: the stage whose `nodes` name the step it failed at,
   else the first stage of that run's workflow, with the failed pill and stop line.
6. Otherwise the first stage.

A card, in this order:

1. Item key and state pill: **Running** (a run works it now), **Needs you** (it has an open ask),
   **Failed**, **Waiting** (queued or idle between stages), **Merged**.
2. Title (from the declared run input's title line: the first non-empty line after any `---`
   front matter, without a leading `#<n> ` or heading marker; else the key), at most 3 lines;
   2 on a card showing an ask's face (rule 7).
3. The stage line, so a card names its stage inside a column that groups several. While a run
   works it: its stage, the running step's name and the round when the step is of the declared
   rounds loop, "Checks · Code review · round 2", linking to the run in the console
   (`/console/p/:projectId/r/:runId`); the step's engine id shows on hover. Otherwise the label
   of the stage it waits in ("Plan", "CI and review"). Under it, on an item no run works, the
   shadow line (rule 10): the badge and what the newest decision of a verdict shadow its stage's
   workflows declare would do ("would ask you first"), its why on hover. For this pack it shows
   in Ready to merge, from the land gate, and in Triage on an item whose triage run failed after
   admit or split decided, from that decision (#80).
4. "part of <order>" when the item is a member of a work order (see Work orders).
5. "round N of M" when the declared rounds loop has run on the item: the latest iteration, with
   one dot per round coloured by that round's verdict: approved (a declared approval),
   returned (a declared return), needs a decision (neither: an ask or a replan), running.
6. "returned ×N" when checks or the host sent it back, linking to the item page; then the
   change: "PR #123" linking to it, when there is one. When the change host could not say
   whether it merged, the card says "merge state unknown" rather than reading as unmerged;
   while the server is still asking, it says "checking merge state", and the column holding
   it and the Merged column show a skeleton bar (Visual standard, rule 6) instead of a count
   and no state chips; an empty column in that state shows skeleton cards, not its empty
   placeholder.
7. For a failed item: one line saying what stopped it, naming its stage and the step it failed
   at ("Build failed at Writes the change"), never the workflow id. For one that needs you, the approval
   card's face (owner change 3), from the project's attention queue Needs you reads
   (`itemAsks`): on one line the ping, the first one's question cut to that line and "N
   questions" when it holds several; then the line Needs you shows for it ("Recommended:
   <label>"). Until that queue is read, one
   line saying what it asks. The face opens the item's asks in a popover over the board, 480 px
   beside the card from md up and a sheet from the bottom under md: the ask cards Needs you
   draws, answered in place, with an empty slot under them for a later preview of the change.
   Esc or a press outside closes it; focus returns to the card unless the press landed on
   another control. Answering one of several keeps it open on the rest; answering the last
   closes it, and the card reads "Answered: <label>", then "Answered · <stage> started again"
   once the items read records the run the settled asks started, until a read moves the card,
   the item asks something new, or the card has its own stop line to show (the restarted run
   failed). A merged card keeps its compact form and no face.

A merged card, in the Merged column, is compact: its key and pill, its title, then the change
and when it merged, in local time; no stage line, order chip, rounds or returned count. The
Merged column lists the items merged in the last 7 local calendar days, newest first, then
"N earlier · show all" opening the Table filtered to merged. A column with no card to show says why: "No card here
matches the filter" under the filter box or `?show=`, "Nothing merged in the last 7 days" for
a Merged column holding only older merges ("No match merged in the last 7 days" when the filter
matches only older merges), else rule 9's "Nothing in <column> now".

A card is as wide as its column, and columns follow the Visual standard (rules 3 and 9); where
the columns do not fit the width, the board scrolls sideways with a hint naming the hidden
columns, at the end of the toolbar. The Pipeline's toolbar (the filter box, Pipeline/Table, a
`?show=` chip, the work orders' summary, the folded endings, the hint) is one line at 1440x900.
At 1280x720 it is one line on a board with no lit work order and no `?show=` chip; a lit work
order or a `?show=` chip can push its last parts (the folded endings, the hint) to a second
line, and the columns still hold one full card. On a phone it wraps. The
columns take the rest of the window. A card opens the item page, except its links and its ask face. **Table** view: one
row per item with the same fields as columns, a Work order, a Column and a Stage column among
them (a running item's step and round under its stage, as the card's stage line reads; a merged
item's Stage empty, as its card names no stage; Merged as
a short local time, the full one on hover), sortable; a row that needs you has an Answer button beside its state pill opening the same popover. A filter
box narrows by key, title or work order key. Until the items are read, the board draws its
declared columns with skeleton counts and card shapes (Visual standard, rule 6).

**Work orders** (read-only; the console records and ends no link). A work order is an item other
items are `part_of`. An item's order is its newest active `part_of` link, else the order its
newest run of the declared `partOf` workflow that completed with its declared outcome names (a
refused order run never makes an item a member): a link wins over a result that
disagrees (`factory/lib/work-orders.ts`). An order with no run of its own is no card in any
column and counts in no number; its members count as the items they are. Above the Pipeline's
columns, in the toolbar, one line summarises the work orders with a member on the board (one
that has a run): "N work orders · M open" (open: not every member merged), and, while an order
is lit, "highlighting <key>" with Clear highlight, so a card's "part of" link lights something
visible without opening the list. Clicking the line lists, under the toolbar, one row per order: its key (to its item
page) and title (its own when it has one, else "Work order <key>"), "N of M merged" with a small bar, one
dot per member in its pill's colour, and a toggle that lights its members on the board and dims
the rest (`?order=<key>`). An order whose members have not started has no row yet: the order
and its members show on its item page (`factory/items/<order key>`). A member's card says
"part of <order>", which lights its order. An
order's own column, stages and landing target are not built (owner ruling of 2026-11-17).

When an item changes column, the card moves there within 5 s; a brief highlight shows it moved.

## The item page

- Header: key, title (Section heading role), state pill, the column it is in (not for a merged
  item: its pill says so), and the change as a button-style link ("PR #n") with its merge state
  as quiet tertiary words after it ("merged", "open", "merge state unknown"; a skeleton line
  while the host is still asked). The pill is the header's one coloured state. An item no run has
  started yet (a member linked before its first run) says "Not started" instead of a state,
  column and change.
- **Asks** it waits on, answerable in place (the ask card Needs you draws, always open).
- **Timeline:** a vertical timeline of every run on the item in order. Each run is a dot in its
  stage group's colour (`--node-opaque` for a shadow run; a run of the discoveries workflow
  reads "Found by the factory") on one connecting line, an icon for what its outcome did (sent
  on, returned, asked you, failed, running, stopped), the stage label and workflow, the outcome,
  and duration and cost right-aligned in mono; under it how it started (by hand, or after which
  run's outcome; a trigger's id only on hover). For the rounds loop, one compact row per round:
  "round N of M", its verdict, and a chip per check in its verdict's colours, with what was
  returned on one line. Sent on and returned follow the board's order, judged from the furthest
  stage the run's workflow works: a placement into an earlier column, or an earlier stage of
  the same column, reads returned; a placement into a later stage, or into that furthest stage
  itself (the land gate into Ready to merge), reads sent on. Once the change
  merged, a last Merged entry gives when, in local time. Each row links to its run. A check's
  verdict reads in the board's words where the view declares its meaning (`returns`, `approves`,
  `verdicts`): "approved", "returned", "asked you"; an undeclared one stays its mono token. A run
  that stopped to ask (a declared `asked` outcome, or asks it left on the item) reads "asked
  you", with its questions on hover, not the stage it would send the item to.
- **Links:** depends on, part of, duplicate of, from the engine's item links. A member its order
  run placed without a link says "Part of <order>, as its order run recorded". On a work order,
  its members stand for their links: each with its title, state pill and where it sits, under
  "Members: N of M merged". An order with no run of its own has no column or state; its header
  says it is a work order, not worked by the factory itself, and without a title of its own it
  reads "Work order <key>" (the key stays the mono label). An order only a result names has
  no item row: its page is its key, that title and its members, from the items read.
- **Rulings and answers** given on the item.

## Testing

- Pure derivation (placement, card fields, map live chips, declaration parsing) has unit tests
  with `bun test`, with fixtures copied from real runs of the live factory.
- Each route has a server test in the existing harness style.
- Every change that shows something is checked in a browser before it is called done:
  `bun run build:web && bun run dev:console`, then drive it with `agent-browser` at 1440x900 and
  at 390x844 against the Visual standard. The pull request describes what you saw and says which
  of the standard's rules (by number) it touched.

## Later (not in the first slices, written down so they are not lost)

1. **Work orders' own column and landing target** (`docs/shape.md` in the pack: hypothesis
   today). The strip, member chips and order pages are built (#47); an order's stages, landing
   branch and any write from the console belong to the pack and engine.
2. **Graph view of the board** (Rasmus's preference): items as a graph by links instead of
   columns, as a third view.
3. **Pool of machines** (Rasmus's idea): one console observing several Archon daemons.
4. **Manager:** a Claude Code session with the factory skill as the operator, local or over SSH;
   the console stays the observation pane.
5. **Upstream:** propose the declaration format and this section to Archon dev with Rasmus.
