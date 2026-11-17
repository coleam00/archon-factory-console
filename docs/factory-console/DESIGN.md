# The Software Factory section of the Archon console

Owner: Cole Medin. Status: proof of concept, started 2026-11-16. This page binds every change in
this repository. Where an issue and this page disagree, this page wins unless the issue says it
changes this page.

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
  | `factory/items/:key` | One item: its timeline, asks, links and change |
  | `factory/stages/:stage` | One stage opened: what it does, the workflows behind it, each workflow's step graph |
  | `factory/steps/:workflow/:node` | One step: its prompt (command file), its YAML, the model it runs on |

- Inside the Factory tab a small sub-navigation switches Overview, Board and Needs you (with a
  count). Item, stage and step pages have a back link to where you came from.

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
    "triage:build": "plan", "triage:narrow": "plan",
    "plan:planned": "build", "plan:ask": "plan",
    "deliver:ready": "ready", "deliver:waiting": "host", "deliver:returned": "build",
    "deliver:replan": "plan", "deliver:ask": "build"
  },
  "endings": { "triage:*": "Closed by triage" },   // outcomes that end an item without a change
  "landed": { "stage": "landed" },                 // the column for an item whose change merged
  "rounds": { "workflow": "deliver", "loop": "rounds" },
  "returns": [ { "workflow": "deliver", "node": "rounds.verdict__verdict", "outcome": "return" },
               { "workflow": "deliver", "node": "hostrounds.host__host", "outcome": "return" } ],
  "approves": [ { "workflow": "deliver", "node": "rounds.verdict__verdict", "outcome": "approve" } ],
                                                   // a round is approved only by a declared
                                                   // approval; with neither, it needs a decision
  "change": { "workflow": "deliver", "pointer": "/change" },   // where the PR URL is in a result
  "itemTitle": { "input": "item" },                // item title = first line of this run input
  "map": {
    "cards": [ { "stage": "build", "col": 3, "row": 1 } ],
    "arrows": [ { "from": "plan", "to": "build", "label": "planned" },
                { "from": "checks", "to": "build", "label": "returned", "back": true } ],
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
pack is later work.

## Data

The engine on this repository's base has `GET /api/items?project&key` (one item, whole) and the
attention routes, but no list of a project's items. Rasmus has open engine work for it (#5815,
`GET /api/items/window`) and for the stage graph (#5848, `GET /api/packs/{pack}/graph`). Until
those land, this section adds **one read-only route file**, `packages/server/src/routes/api.factory.ts`:

- `GET /api/factory/views?codebaseId=` the factory views that apply to the project.
- `GET /api/factory/workflow?codebaseId=&workflow=` one workflow a view names, for the stage and
  step pages: its steps keyed as run events name them, the loop groups and included workflows
  that frame them, and each step's kind, model, `when:`, prompt and authored YAML.
- `GET /api/factory/items?codebaseId=&since=&limit=&after=` a page of the project's items, newest
  activity first. Each entry is the engine's own `ItemRead` (as `GET /api/items` returns it,
  same schema, imported, not restated) plus a `progress` object the board needs and `ItemRead`
  does not carry: the running run's id, workflow and deepest running step, the current loop
  iteration of the declared `rounds` loop, the returned count, the change URL from the declared
  pointer with its pull request number, the title, and each declared run's workflow as the
  view names it with the step it failed at. Shape the page like #5815 (`{ items, next }`) so
  swapping to it later is a change of one skill.
- Whether a change merged comes from the change host through Archon's forge seam (the same
  `pull request view` operation the packs use), read by the server and cached for at least
  60 s. The browser never calls GitHub.

All derivation (column, card fields) is pure TypeScript in the web package, with unit tests,
fed by these reads. Logic worth porting from Mission Control (`C:\Users\colem\OpenSource\factory-mission-control`,
read-only reference): `app/lib/board.ts` (placement and card fields), `app/map/live.ts`
(which card a running step belongs to), `app/map/FactoryMap.tsx` (pan, zoom, fit, details
panel). Port the logic and ideas, not the styling: Mission Control used its own tokens.

## Overview page

1. Title and the declaration's summary paragraph.
2. **Numbers strip:** items in flight, needs you, landed today, landed in total ("N of M done"
   where M excludes items closed by triage), median time from first run to landed.
3. **Needs you:** each open ask on this project's items, newest first: item, question, the
   recommended option first and highlighted, the other options with what each does and costs,
   answered in place through `POST /api/attention/answer`. Paused runs' waits appear here too
   (the attention list already reads both into one shape).
4. **The map.**

## The map

- Cards laid out from `map.cards` on a grid, left to right in the order work flows, with the
  declared arrows between them (labelled with the outcome that moves an item along; back-arrows
  drawn dashed and below). A card shows the stage label, its blurb, and live chips: how many
  items are in it now ("2 here", pulsing while a run works), how many wait on a person.
- Pan by drag, zoom by scroll or buttons, Fit button; opens fitted.
- **Click** a card: a details panel beside the map with the blurb, the items in that stage
  (linking to each item), and the workflows behind it with links to their steps.
- **Double-click** (or the open icon) a card: the stage page, which draws each workflow's steps
  as a graph (the RunGraphPanel pattern: dagre, top to bottom; loop groups drawn as a framed
  group labelled "up to N rounds"; included workflows as nested groups). A step that is running
  now for any item glows. Clicking a step opens the step page.
- A legend under the map names the colour groups in plain words.

## The board

Columns are the declaration's stages in order, then the landed column. Placement of one item,
first rule that matches:

1. A run of a declared workflow is **running** on it: the stage whose `workflows` (and `nodes`,
   when given) match the run's workflow and deepest running step.
2. Its change **merged**: the landed column.
3. Its last completed run's `workflow:outcome` is in `placement`: that stage.
4. Its last run's outcome is in `endings`: not on the board; counted in a folded row
   "N closed by triage" under the board, each linking to its item.
5. Its last run **failed** or was cancelled: the stage of that run's workflow, with the failed
   pill and stop line.
6. Otherwise the first stage.

A card, in this order:

1. Item key and title (title from the declared run input's first line, else the key).
2. State pill: **Running** (a run works it now), **Needs you** (it has an open ask), **Failed**,
   **Waiting** (queued or idle between stages), **Landed**.
3. "round N of M" when the declared rounds loop has run on the item: the latest iteration, with
   one dot per round coloured by that round's verdict: approved (a declared approval),
   returned (a declared return), needs a decision (neither: an ask or a replan), running.
4. While a run works it: the workflow and its running step in mono, "deliver · rounds.review",
   linking to the run in the console (`/console/p/:projectId/r/:runId`).
5. "returned ×N" when checks or the host sent it back, linking to the item page.
6. The change: "PR #123" linking to it, when there is one.
7. In the landed column: when it landed, in local time.
8. For a failed item or one that needs you: one line saying what stopped it or what it asks.

Cards are compact (the board fits seven columns at 1440 px wide; below that the board scrolls
sideways with a hint naming the hidden columns). A card opens the item page. **Table** view: one
row per item with the same fields as columns, sortable. A filter box narrows by key or title.

When an item changes column, the card moves there within 5 s; a brief highlight shows it moved.

## The item page

- Header: key, title, state pill, the change link, the column it is in.
- **Asks** it waits on, answerable in place (same component as Needs you).
- **Timeline:** every run on the item in order: stage label, workflow, how it started (by hand,
  or after which run's outcome), outcome, duration, cost, and for the rounds loop one row per
  round with each check's verdict and what was returned. Each row links to its run.
- **Links:** depends on, part of, duplicate of, from the engine's item links.
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

1. **The map generated from the pack.** When #5848 lands, the stage graph read gives stages,
   outcomes and active hand-offs from the pack's YAML and the install's trigger files. The map
   then draws arrows from that read and uses the declaration only for labels, grouping and
   layout, so the picture is always true. Rasmus's prototype: `evals/graph/graph.ts` in
   `Wirasm/archon-software-factory`. Discussed 2026-11-16: the author's YAML tags map onto the
   view; generation, not agent-written UI code.
2. **Swap the items read** to `GET /api/items/window` (#5815) when it merges; drop our route.
3. **Work orders** as items with `part_of` links: a strip above the board grouping members, an
   order's own column and landing target (`docs/shape.md` in the pack: hypothesis today).
4. **Graph view of the board** (Rasmus's preference): items as a graph by links instead of
   columns, as a third view.
5. **Asks restart stages** once engine #5834 lands: answering shows the stage starting.
6. **Pool of machines** (Rasmus's idea): one console observing several Archon daemons.
7. **Manager:** a Claude Code session with the factory skill as the operator, local or over SSH;
   the console stays the observation pane.
8. **Upstream:** propose the declaration format and this section to Archon dev with Rasmus.
