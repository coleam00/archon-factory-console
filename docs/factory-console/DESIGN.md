# The Software Factory section of the Archon console

Owner: Cole Medin. Status: proof of concept, started 2026-11-16. This page binds every change in
this repository. Where an issue and this page disagree, this page wins unless the issue says it
changes this page.

## Owner changes of 2026-11-17 (bind every later change; win over older text below)

The section has **two separate things**, each with its own file:

1. **The factory overview** (new, its own page). A hand-curated explainer of how the factory runs, for
   presenting: not live, not exhaustive, never generated from workflow YAML. Its own file per pack
   (`.archon/packs/<pack key>.factory-overview.json`, or `<pack>/.shared/factory-overview.json`), in the
   format of Mission Control's `app/map/factory-map.json` (read-only reference at
   `C:\Users\colem\OpenSource\factory-mission-control`): views (a root view and drill-downs), groups,
   cards (title, one line of text, icon, kind), edges (feeds, calls, and exactly one "loops back" line
   drawn as a single lane under the line, never crossing dotted lines). Interaction like Eric Tech's
   skill map (https://erictechpro.github.io/super-board/skill-map/): a sidebar listing every view with
   counts, a breadcrumb, click a card to open its drill-down, a legend, pan/zoom/fit, a full-screen
   mode. Style: Mission Control's curated map, beautified (the console's tokens), not a hand-drawn look.
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

- A fourth project tab, **Factory**, after Runs, Chat and Metrics (`ProjectViewTabs`). It shows
  only when a factory view applies to the project (below). Without one, nothing changes.
- Routes, all under `/console/p/:projectId/factory`:

  | Route | Page |
  |---|---|
  | `factory` | Overview: one paragraph saying what this factory does, the numbers strip, the Needs-you list, then the map |
  | `factory/board` | The board (default view Pipeline, with a Table alternative) |
  | `factory/needs-you` | Needs you: every open ask and paused wait on this project's items, answerable in place (the Overview shows the newest few) |
  | `factory/how-it-works` | How it works: the pack's factory overview (`?view=<id>` opens a drill-down), when it has one |
  | `factory/overview` | Redirects (replace) to `factory/how-it-works`, keeping the query string, so old links land |
  | `factory/items/:key` | One item: its timeline, asks, links and change |
  | `factory/stages/:stage` | One stage opened: what it does, told as the view file's drill-down (numbered phases of plain cards, live), with each workflow's step graph behind "Show the real steps"; a stage with no drill-down shows the graphs |
  | `factory/steps/:workflow/:node` | One step: the items on it now, its prompt (command file), its YAML, the model it runs on |
  | `factory/*` | Any other path: "No page here" inside the section, with links to Overview, Board, Needs you and How it works |

- Inside the Factory tab a small sub-navigation switches Overview, Board and Needs you (with a
  count), each its own route, and How it works when the pack has a factory overview file (or a
  broken one). Item, stage and step pages have a back link to where you came from.

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
  "stages": [                                      // map cards and board columns, left to right
    { "id": "order", "label": "Order", "blurb": "Takes a work order and makes it one item.",
      "group": "intake", "workflows": ["order"] },
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
    "cards": [ { "stage": "build" } ],              // drawn in stages order, one row
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
declaration names no stage for it: runs of a workflow no stage lists do not place an item.

`map.arrows` declares every arrow the map draws, a hand-off from one workflow to another
included; the map reads no other source (see The map). `bun run check:factory-view` keeps the
two true to each other in this repository (#28). It reads the pack graph from the installed pack
where a home is named (failing when the snapshot of `archon pack graph` committed beside
the view file differs from it), and from that snapshot in CI. It fails on a hand-off between two
stages that the pack declares (every binding, installed by a trigger file on this machine or
not; owner ruling of 2026-11-17) that the view does not declare, and on a declared arrow no
such hand-off backs, unless it is marked `person: true` (a replan, a landing), joins two
different stages of one workflow (its steps), or runs into Landed. An arrow back into its own stage is a rerun only
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
  only in that order's "N of M landed" (as not started). Showing those needs the window to
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
- `GET /api/factory/overview?codebaseId=` the factory overview of the pack the first applying
  view draws, or null, with any overview file that failed.
- `GET /api/factory/workflow?codebaseId=&workflow=` one workflow a view names, for the stage and
  step pages: its steps keyed as run events name them, the loop groups and included workflows
  that frame them, and each step's kind, model, `when:`, prompt and authored YAML.
- `GET /api/factory/progress?codebaseId=&keys=` (`keys` repeated, up to one window page) the
  progress the board needs and `ItemRead` does not carry, by item key: the running run's id,
  workflow and deepest running step, the current loop iteration of the declared `rounds` loop,
  the returned count, the change URL from the declared pointer with its pull request number,
  the title, each declared run's workflow as the view names it with the step it failed at, and
  `partOf`: the work order the newest run of the declared `partOf` workflow that completed with
  its declared outcome names (an empty value there means none; a refused run is never read). Beside `progress`, `members` lists for each asked key the
  items with an active `part_of` link to it, so a member with no run yet counts. A key may name
  an item with no runs (a work order). The web joins each window page with it: one reader,
  `factory/lib/factory-items-read.ts`. After the walk it reads every work order an item belongs
  to that the window lacks (no run of its own, or no item row) in one more progress request per
  100 keys, never one per item; a key that request leaves out has no item row.
- `GET /api/factory/item?codebaseId=&key=` one item, its read and progress, plus what its
  timeline needs per run and neither read carries: the declared workflow, the run's cause, its
  cost, its running step, and each round of the declared `rounds` loop with the steps that
  recorded an outcome in it and the deciding step's summary.
- Whether a change merged comes from the change host through Archon's forge seam (the same
  `pull request view` operation the packs use), read by the server and cached for at least
  60 s. The pull request is the one the run's forge records name, else the one on a branch
  the item's runs recorded whose URL is the change (an earlier run may have opened it). The
  browser never calls GitHub. A first lookup slower than the server's wait answers `pending`
  for that read only (never cached); the console reads again every few seconds while any item
  is pending. A lookup that failed answers `unknown` and is cached like any other answer.

All derivation (column, card fields) is pure TypeScript in the web package, with unit tests,
fed by these reads. Logic worth porting from Mission Control (`C:\Users\colem\OpenSource\factory-mission-control`,
read-only reference): `app/lib/board.ts` (placement and card fields), `app/map/live.ts`
(which card a running step belongs to), `app/components/FactoryMap.tsx` (pan, zoom, fit, details
panel). Port the logic and ideas, not the styling: Mission Control used its own tokens.

## Overview page

1. Title and the declaration's summary paragraph.
2. **Numbers strip:** items in flight, needs you, landed today, landed in total ("N of M done"
   where M excludes items closed by triage), median time from first run to landed. Until the
   items read first answers, each tile shows "…" in place of its number, above its label; while
   any item's merge state is pending, every number but needs you shows loading, never a count
   that may be wrong. A first read that fails replaces the tiles with an alert saying so; a
   refresh that fails says so above the last values read (as the map and the board do).
3. **Needs you:** each open ask on this project's items, newest first, as one line (item,
   question, recommended option) until opened. Opened, it shows the recommended option first and
   highlighted, the other options with what each does and costs, answered in place through
   `POST /api/attention/answer`. The list shows the newest few and says how many more there
   are, with "show all"; a line the operator opened stays shown. Paused runs' waits appear here
   too (the attention list already reads both into one shape). The item page shows its own asks
   opened. Under the open asks, **Answered lately** lists the three newest sets of asks an item
   settled, with how many were answered and withdrawn and the stage the settling started again
   (engine #5834), linking to that run with its status, or that no run started from these answers. It
   joins the item read's `asks_settled` answer to the run whose `cause` names the same asking
   run, so an answer given through the CLI or by an agent shows too.
4. **The map.**

## The map

- One card per stage `map.cards` lists, in `stages` order (the board's), in one row left to
  right. The map wraps into two rows (the first half above) only where one row would draw its
  text under the type floor; below that it pans. `col` and `row` on a card are accepted, so an
  older view file still loads, and ignored. A card shows the stage label, its blurb, and live
  chips: how many items are in it now ("2 here", pulsing while a run works), how many wait on
  a person. Where a board column would show "…" for a pending merge state, the card says
  "checking…" instead of how many are here. The cards and arrows are drawn from the view file
  as soon as it is read: until the items read answers each card's chip is "…" (never
  "0 here"), and the chips fill in on the same cards when it does. If that first read fails,
  an alert above the map says so and the cards stay drawn with no chip, their details saying
  the items could not be read rather than loading.
- The arrows are the view file's `map.arrows` and no others: the map does not read the pack
  graph, so the view file declares every hand-off, between workflows too, and every send-back.
  Forward arrows, labelled with the outcome that moves an item along, run side to side between
  cards next to each other; one that skips cards runs in a lane off the row's outer edge.
- **One feedback lane** under the row carries every send-back: an arrow into its own card or
  an earlier one in `stages` order (a return, a replan). Direction comes from that order only;
  an arrow's `back` flag is accepted, so an older view file loads, and ignored. Each send-back drops from its source to the lane, runs right to left along it, and
  rises into its target; every send-back into one card shares one leg, labelled once with all
  their outcomes. An arrow into its own card is a short U on the lane under it. In one row
  nothing crosses: no line crosses another or a card. In two rows the lane runs in the gap
  below the forward hand-offs between the rows; those hand-offs cross it, and the upper row's
  send-back legs cross them, at right angles.
- Pan by drag, zoom by scroll or buttons, Fit button; opens fitted.
- **Click** a card: the stage page. It opens on the stage's drill-down: numbered phase columns
  of plain cards, the loop as one labelled frame around the phases it repeats, a card glowing
  and naming the items on a step it covers now, and a click on a card listing the real steps
  it stands for, each linking to its step page. Its "Show the real steps" toggle (or, for a
  stage with no drill-down, the page itself) draws each workflow's steps
  as a graph (the RunGraphPanel pattern: dagre, top to bottom; loop groups drawn as a framed
  group labelled "up to N rounds"; included workflows as nested groups). A step that is running
  now for any item glows, and above the graph each item running the workflow is named, linking
  to its item page. Clicking a step opens the step page.
- Its **details** button: a panel beside the map with the blurb, the items in that stage
  (linking to each item), and the workflows behind it with links to their steps.
- A legend under the map names the colour groups and what each kind of line means, in plain
  words.

## The board

Columns are the declaration's stages in order, then the landed column. Placement of one item,
first rule that matches. The board, the map and the item page all place through one function
(`factory/lib/placement.ts`), so they never disagree:

1. A run of a declared workflow is **running** on it: the stage whose `workflows` (and `nodes`,
   when given) match the run's workflow and deepest running step. On a step no stage names (a
   loop group between rounds, or none between steps) the board, the map and the item page each
   keep the item in the stage it sat in on their last read when that stage lists the workflow,
   so a card does not hop; else the workflow's first stage. A view opened while a run is
   between named steps has no last read, so for that moment it can show the workflow's first
   stage where a view open longer still holds the item.
2. Its change **merged**: the landed column.
3. Its last completed run's `workflow:outcome` is in `placement`, else its `workflow:*` (which
   also places a run that returns no outcome, such as the pack's `landgate`): that stage.
4. Its last run's outcome is in `endings`: not on the board; counted in a folded row
   "N closed by triage" under the board, each linking to its item.
5. Its last run **failed** or was cancelled: the stage whose `nodes` name the step it failed at,
   else the first stage of that run's workflow, with the failed pill and stop line.
6. Otherwise the first stage.

A card, in this order:

1. Item key and title (title from the declared run input's title line: the first non-empty line
   after any `---` front matter, without a leading `#<n> ` or heading marker; else the key).
2. State pill: **Running** (a run works it now), **Needs you** (it has an open ask), **Failed**,
   **Waiting** (queued or idle between stages), **Landed**.
3. "round N of M" when the declared rounds loop has run on the item: the latest iteration, with
   one dot per round coloured by that round's verdict: approved (a declared approval),
   returned (a declared return), needs a decision (neither: an ask or a replan), running.
4. While a run works it: its stage, the running step's name and the round when the step is of the
   declared rounds loop, "Checks · Code review · round 2", linking to the run in the console
   (`/console/p/:projectId/r/:runId`). The step's engine id shows on hover.
5. "returned ×N" when checks or the host sent it back, linking to the item page.
6. The change: "PR #123" linking to it, when there is one. When the change host could not say
   whether it merged, the card says "merge state unknown" rather than reading as unmerged;
   while the server is still asking, it says "checking merge state", and the column holding
   it and the landed column show "…" instead of a count.
7. In the landed column: when it landed, in local time.
8. For a failed item or one that needs you: one line saying what stopped it or what it asks.

Cards are compact (the board fits eight columns at 1440 px wide; below that the board scrolls
sideways with a hint naming the hidden columns). A card opens the item page. **Table** view: one
row per item with the same fields as columns, a Work order column among them, sortable. A filter
box narrows by key, title or work order key.

**Work orders** (read-only; the console records and ends no link). A work order is an item other
items are `part_of`. An item's order is its newest active `part_of` link, else the order its
newest run of the declared `partOf` workflow that completed with its declared outcome names (a
refused order run never makes an item a member): a link wins over a result that
disagrees (`factory/lib/work-orders.ts`). An order with no run of its own is no card in any
column and counts in no number; its members count as the items they are. Above the Pipeline's
columns, a **Work orders** strip has one row per order with a member on the board (one that
has a run): its key (to its item
page) and title (its own when it has one, else "Work order <key>"), "N of M landed" with a small bar, one
dot per member in its pill's colour, and a toggle that lights its members on the board and dims
the rest (`?order=<key>`). An order whose members have not started has no row yet: the order
and its members show on its item page (`factory/items/<order key>`). A member's card says
"part of <order>", which lights its order. An
order's own column, stages and landing target are not built (owner ruling of 2026-11-17).

When an item changes column, the card moves there within 5 s; a brief highlight shows it moved.

## The item page

- Header: key, title, state pill, the change link, the column it is in. An item no run has
  started yet (a member linked before its first run) says "Not started" instead of a state,
  column and change.
- **Asks** it waits on, answerable in place (the same answer form as Needs you, always open).
- **Timeline:** every run on the item in order: stage label, workflow, how it started (by hand,
  or after which run's outcome), outcome, duration, cost, and for the rounds loop one row per
  round with each check's verdict and what was returned. Each row links to its run. A check's
  verdict reads in the board's words where the view declares its meaning (`returns`, `approves`,
  `verdicts`): "approved", "returned", "asked you"; an undeclared one stays its mono token. A run
  that stopped to ask (a declared `asked` outcome, or asks it left on the item) reads "asked
  you", with its questions on hover, not the stage it would send the item to.
- **Links:** depends on, part of, duplicate of, from the engine's item links. A member its order
  run placed without a link says "Part of <order>, as its order run recorded". On a work order,
  its members stand for their links: each with its title, state pill and where it sits, under
  "Members: N of M landed". An order with no run of its own has no column or state; its header
  says it is a work order, not worked by the factory itself, and without a title of its own it
  reads "Work order <key>" (the key stays the mono label). An order only a result names has
  no item row: its page is its key, that title and its members, from the items read.
- **Rulings and answers** given on the item.

## Visual rules

- The console's surfaces, borders and text tokens. The brand gradient only where the console
  already uses it (active tab bar).
- One colour per stage group on the map (intake, build, check, land), taken from the console's
  existing `--node-*` or status tokens. State colours are the console's status colours: running,
  needs you, failed, done. "Needs you" is the one loud colour on the page.
- Mono (Geist Mono) for workflow, step and key names; Geist for everything a person reads.
- Plain words: "returned", "needs you", "landed", "round 2 of 3", never raw enum values.
- At 1440x900 the Overview shows the Needs-you list and the top of the map in the first screen.
  Phone width: columns stack, map pans.

## Testing

- Pure derivation (placement, card fields, map live chips, declaration parsing) has unit tests
  with `bun test`, with fixtures copied from real runs of the live factory.
- Each route has a server test in the existing harness style.
- Every change that shows something is checked in a browser before it is called done:
  `bun run build:web && bun run dev:console`, then drive it with `agent-browser` at 1440x900 and
  at phone width, and describe what you saw in the pull request.

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
