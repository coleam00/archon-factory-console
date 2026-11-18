---
title: The Factory tab
description: What the console's Factory tab shows, and how a workflow pack declares the factory view it draws.
category: guides
area: web
audience: [user]
status: current
sidebar:
  order: 16
---

A pack that runs work items through stages (an issue comes in, stages work it, and it ends as
a landed change, a question for a person, or a clean stop) can present itself in the web
console as a factory. The pack's author writes a *factory view*: a JSON declaration that names
the pack's stages, the workflows and steps that work each one, and which outcomes move an item
where. The console reads it beside the engine's own records. It never names a pack's stages,
workflows or steps in its own code. The section's visual standard (type, cards, lines,
states, words) is written in the repository's design document:
[Visual standard](https://github.com/coleam00/archon-factory-console/blob/main/docs/factory-console/DESIGN.md#visual-standard-owner-2026-11-18).

## What the tab shows

A project gets a **Factory** tab after Runs, Chat and Metrics when a factory view applies to
it. Inside it:

- **Overview**: the view's title and summary (on a phone, its first three lines and **More**),
  then a strip of numbers, then **Needs you**: every open question an item is waiting on, one
  line each with its recommended option. **Open** a line to answer it in place, the
  recommended option first. The newest few show;
  **N more · show all** lists the rest. Paused runs' waits appear there too. Under the open
  asks, **Answered lately** lists the last asks an item settled and the stage that answer
  started again, linking to that run, or that no run started from those answers (a run started by hand after them is not one). Then **the map**: the stages `map.cards` lists, in
  `stages` order in one row (two on a screen too narrow to read one), coloured by group, with
  the arrows `map.arrows` declares and no others. A forward hand-off runs between two cards;
  every send-back (an arrow into an earlier stage: a return, a replan) runs in one feedback lane under the row,
  labelled once where it returns to. Each card says how many items are in it now, pulsing while
  a run works one, and how many need a person. Drag to pan, and scroll or use the buttons to zoom. **Fit** shows
  the whole map when it fits at a readable size; with a card's details open, or on a narrow
  screen, it stops at the smallest readable size, so drag, zoom out or close the details to
  see the rest. Click a card for its stage page; its details button (ⓘ) shows its items and
  workflows beside the map.
- **Needs you**: its own page, reached from the sub-navigation, which shows how many wait.
  Every open question and paused wait on this project's items, all of them, each answerable
  in place as on the Overview.
- **Board**: one column per declared stage, each item one card in the column of the stage it
  is in. A card shows the item's state (Running, Needs you, Failed, Waiting, Landed), the
  round it is on, the stage and step running now ("Checks · Code review · round 2"), how often
  checks sent it back, its pull request, and the work order it is part of.
  A **Table** view lists the same fields as sortable columns. The filter box finds an item by
  key, title or the key of its work order.
  A **work order** is an item other items are `part_of`. An item's order is its active `part_of`
  link (`archon workflow link --item <member> --kind part_of --to <order>`), else the order its
  latest run of the `partOf` workflow that completed with its declared outcome named (a refused
  run never makes it a member); a link wins. Above the columns, one row
  per order with a member on the board names it (its own title, else "Work order <key>"), says how many of its members landed, shows each member's
  state as a dot, and lights its members on the board on demand; a member's "part of" chip does
  the same. A row appears once one of the order's members has a run; until then the order and its
  members, each "Not started", show on the order's item page (`/factory/items/<order key>`). An order with no
  run of its own is not a card and counts in no number. The console shows links; it never
  records or ends one.
- **Item page**: one item's state, open asks, a timeline of every run and round, its links to
  other items (on a work order, its members with their state and how many landed; an item no run
  has started yet says "Not started"), and the
  rulings and answers given on it. The timeline words an outcome from the
  declaration: a run that ended in an `asked` outcome, or that left asks on the item, reads
  "asked you" (its questions on hover); otherwise a run outcome in `placement` reads as where it
  sent the item ("sent to Plan"), and one in `endings` as its label. A step outcome in `returns`
  or `approves` reads "returned" or "approved", and one in `verdicts` as its meaning's words
  ("approved", "returned", "asked you"). An outcome the declaration does not map shows as the
  pack's own name for it.
- **Stage page**: what a stage does, told as its drill-down when the view gives one: numbered
  phases of plain cards, a card glowing and naming the items on its steps now, and a click on a
  card listing the real steps it stands for, each linking to its step page. "Show the real
  steps" (or, for a stage without a drill-down, the page itself) draws the step graph of each
  workflow behind it: the stage's own steps stand out, steps another stage works are dimmed,
  and a step running for an item now glows.
- **Step page**: the step by its name, with its engine id under it, the items on it now, when
  it runs (its `when:` in words, such as "if Verdict = return", the expression on hover), its
  prompt, its YAML and the model it runs on.
- **How it works**: the pack's [factory overview](#the-factory-overview), when it ships one: a
  hand-written picture of how the factory runs, for explaining it to someone who has never
  seen it.

Views update within a few seconds of a run starting, changing step or ending, and of a
question opening or closing.

### The numbers

| Number | Counts |
|---|---|
| in flight | Items on the board outside the landed stage |
| items need you | Items with an open question |
| landed today | Items whose change merged today, in the browser's local time |
| N of M done | N items landed out of M on the board. Items an `endings` outcome closed are not in M |
| median from first run to landed | Over landed items, the median time from an item's first run of a workflow the view names to its change merging |

Each number opens the board filtered to the items it counts.

### Where an item sits

Nothing stores an item's column. The console derives it from the item's runs, its open
questions and whether its change merged, taking the first rule that matches:

1. A run of a workflow the view names is running on it: the stage whose `workflows` (and
   `nodes`, when given) match the run's workflow and running step. On a step no stage names
   (a loop between rounds, or between steps) the item stays where it was on the last read,
   when that stage lists the workflow; else it goes to the workflow's first stage.
2. Its change merged: the `landed` stage.
3. Its last completed run's `workflow:outcome` is a key of `placement`, else its
   `workflow:*`: that stage. `workflow:*` also places a run that returns no outcome.
4. Its last run's outcome is a key of `endings`: off the board, in a folded row under it.
5. Its last run failed or was cancelled: the stage whose `nodes` name the step it failed at,
   else the first stage of its workflow.
6. Otherwise the first stage.

The board, the map and the item page all place an item by these same rules.

## Where the declaration lives

For a project, the console looks for, in order:

1. The project's own file `.archon/packs/<pack key>.factory-view.json`, where the pack key is
   `owner.name` for an installed pack, else the pack's folder name. A project can present an
   installed pack it cannot edit this way.
2. `<pack>/.shared/factory-view.json` in any pack the project can run: the project's, the
   global ones, installed ones and bundled ones.

A view applies to a project when its project file exists, or when the declaration is found
and the project has at least one run of a workflow the view names. A declaration that fails to
parse or validate shows on the Factory tab with its path and the error.

## Fields

| Field | Required | What it does |
|---|---|---|
| `version` | yes | Always `1`. |
| `pack` | yes | The pack the view draws: `owner/name` when installed, else its folder name. |
| `title` | yes | The factory's name, at the top of every Factory page. |
| `summary` | yes | One paragraph in plain words: what goes in, what comes out, where people step in. Shown on the Overview. |
| `stages` | yes | The board's columns, left to right. Each stage has an `id` (a lowercase slug), a `label`, a one-line `blurb`, a colour `group` (`intake`, `build`, `check` or `land`), the `workflows` whose runs count in it (empty for a stage no run works, such as Landed), and optionally `nodes`: the steps that count in it while they run. A step matches a node equal to its id, or one its id begins with followed by `.`, so `rounds` matches `rounds.fix`. A step of an included workflow is `<include>__<node>`. A stage may carry a `drilldown`: what it does step by step, as numbered `phases` (each a `label` and one to six `cards`), and an optional `loop` (`label`, `from` and `to` phase numbers, and the loop group's `workflow` and `step`) around the phases a loop group repeats. A card has a `title`, one line of `text`, an `icon` (one of `inbox`, `scale`, `link`, `ruler`, `scissors`, `database`, `clipboard-list`, `pencil`, `wrench`, `git-branch`, `search-code`, `flask-conical`, `monitor-check`, `gavel`, `message-square`, `circle-alert`, `git-pull-request`, `flag`, `send`, `shield-check` or `git-merge`), a `kind` (`agent`, `check`, `script` or `you`), and `covers`: the real steps it stands for, as `{ "workflow", "steps" }` for a workflow its stage lists. The stage page draws it: the phases as numbered columns of cards, the loop as one labelled frame around its phases, and a card glows while an item is on a step it covers. Clicking a card lists its real steps; "Show the real steps" draws each workflow's step graph below. A stage without a drill-down shows the graphs. |
| `placement` | yes | Where an item waits after a run ends: `workflow:outcome` to a stage id, or `workflow:*` for every completed run of the workflow no exact key takes, a run that returns no outcome (a gate that only records) included. |
| `endings` | yes | Outcomes that end an item without a change: `workflow:outcome`, or `workflow:*` for every outcome `placement` does not take, to the label of the folded row. Use `{}` for none. |
| `landed` | yes | `{ "stage": <id> }`: the stage an item whose change merged sits in. |
| `rounds` | no | `{ "workflow", "loop" }`: the loop whose iterations the board counts as rounds ("round 2 of 3"). |
| `returns` | no | Steps whose outcome sends an item back: each `{ "workflow", "node", "outcome" }`. The board counts them as "returned ×N" and colours that round returned. |
| `approves` | no | Steps whose outcome approves a round, in the same shape. A round with neither a declared return nor a declared approval reads as needing a decision. |
| `verdicts` | no | What other steps' outcomes mean, so the item page's timeline words them: `{ "<workflow>": { "<step id>": { "<outcome>": "approved" } } }`, each meaning one of `approved`, `returned` or `asked`. A check's outcome then reads "approved", "returned" or "asked you", the words the board's round dots use. It decides nothing: only `returns` and `approves` decide a round, and an entry that restates one of theirs is rejected. An outcome no entry means reads as the pack's own token, in mono. The coverage check reports a step the workflow does not have. |
| `asked` | no | Completed outcomes that stop to ask you: `workflow:outcome`, or `workflow:*` for every outcome (not a run without one). A run that ended so reads "asked you" on the item page's timeline, as does any run that left asks on the item, with its questions on hover. `placement` still decides where the item waits. |
| `change` | no | `{ "workflow", "pointer" }`: the JSON pointer to the pull request URL in that workflow's result. |
| `partOf` | no | `{ "workflow", "pointer", "outcome" }`: the JSON pointer to the item's work order (an item key) in that workflow's result, read only from runs that completed with `outcome` (the one that accepts the item), so a refused run never makes an item a member. Read only for an item with no active `part_of` link; the newest such run decides, and an empty value there means none. |
| `itemTitle` | no | `{ "input" }`: the run input whose title line is the item's title: its first non-empty line after any `---` front matter, without a leading `#<n> ` or markdown heading marker. Without it, the item's key is its title. |
| `steps` | no | Display names for steps, by workflow: `{ "<workflow>": { "<step id>": "Writes the change" } }`, keyed by the step id as the engine records it (`build__build`, `rounds.fix`, the bare loop id `rounds`). Every page prints a step by this name. A step with no name reads as its cleaned id: a doubled include name collapses (`build__build` reads "build"), an include reads `include: inner`, a loop prefix is dropped (a step of the declared `rounds` loop adds its round where it is known), and `_` and `-` become spaces. The raw id shows on hover and on the step page. A key that names no real step names nothing a page shows; the coverage check reports it. |
| `map` | yes | The layout of the factory map: `cards` name the stages the map draws (`{ "stage" }`; it draws them in `stages` order, and accepts and ignores the `col` and `row` an older file has), `arrows` are every arrow it draws (`from`, `to`, an optional `label`, and `person: true` for a step a person takes, such as a replan, that no hand-off of the pack starts; an arrow into its own stage or an earlier one in `stages` order is a send-back, and a `back` flag an older file has is accepted and ignored), and optional `notes` sit near a stage or near `needs-you`. The map draws no arrow the file does not declare, between workflows included. The map draws a stage's notes on its card; a `needs-you` note is not drawn yet. A forward arrow runs side to side between cards next to each other; every send-back runs in one feedback lane under the row. The cards take one row wherever it fits at a readable size, and two rows on a narrower screen. |

Every stage a field names must be declared in `stages`, and every workflow named in
`placement`, `endings`, `rounds`, `returns`, `approves` and `change` must be listed by a stage.
A drill-down card and loop must name a workflow their own stage lists.

## Coverage check

The schema cannot see a pack's workflows, so a separate check compares a view file with them.
It is a script of an Archon checkout, `bun run check:factory-view`, and it checks only the
project files in that checkout's own `.archon/packs/` (`<pack key>.factory-view.json`), not
another project's files or a pack's `.shared/factory-view.json`. It reads each pack's stage
graph (what `archon pack graph <pack key> --json` prints) from two places:

- the snapshot `<pack key>.pack-graph.json` committed beside the view file, which CI checks
  against since it has no installed pack; a missing snapshot fails the check;
- the installed pack, when a home is named: the `plugins/` directory of the home
  `ARCHON_FACTORY_LIVE_HOME` names, else of `ARCHON_HOME`. The view is then checked against the
  installed pack, and a snapshot that differs from it fails the check, so a reinstall that
  changes the pack is caught where it is installed. With neither variable set, the check says
  it used the snapshots only. When `archon pack graph` cannot find the pack in the named home
  (including when it has no `plugins/`), the check fails with that reason rather than falling
  back to the snapshot: install the pack there, or unset both variables to check against the
  snapshot.

It reads the installed pack on a throwaway home holding a copy of that `plugins/` directory and
nothing else, so the install is only read, and with no trigger files every arrow is one the
pack declares. It reports, each with its path in the view file:

- every real step of a workflow a stage lists that no drill-down card or loop covers, and every
  step two of them cover (a loop group counts as a step);
- every step a card, a loop, a stage's `nodes`, `steps` or `verdicts` names that the workflow
  does not have,
  and every listed workflow the pack does not have;
- every hand-off between two stages that the pack declares (each of its bindings, whether or
  not a trigger file on this machine installs it) that `map.arrows` does not declare, and
  every declared arrow no such hand-off backs, unless it is `person: true`, joins two different
  stages of one workflow, or runs into the `landed` stage from another. An arrow back into its
  own stage is a rerun only a hand-off starts, so it is always checked.

It compares only the workflows the view's stages list, steps and hand-offs alike, and names
the pack's other workflows on one informational line that is not a failure.

After reinstalling the pack, refresh the snapshot from the installed pack with
`bun run check:factory-view --write <pack key>`, then fix what the check reports in the view
file and commit both.

## Example

```json
{
  "version": 1,
  "pack": "acme/release-kit",
  "title": "Release factory",
  "summary": "Issues come in as items. Plan writes down the approach, Build writes the change and opens a pull request, and a review sends it back until it approves. A person lands the change.",
  "stages": [
    {
      "id": "plan",
      "label": "Plan",
      "blurb": "Works out how to build the item.",
      "group": "intake",
      "workflows": ["plan"]
    },
    {
      "id": "build",
      "label": "Build",
      "blurb": "Writes the change and opens a pull request, then fixes what comes back.",
      "group": "build",
      "workflows": ["deliver"],
      "nodes": ["build", "rounds.fix"]
    },
    {
      "id": "review",
      "label": "Review",
      "blurb": "Reads the change and sends it back when something is wrong.",
      "group": "check",
      "workflows": ["deliver"],
      "nodes": ["rounds.review"]
    },
    {
      "id": "landed",
      "label": "Landed",
      "blurb": "The change merged.",
      "group": "land",
      "workflows": []
    }
  ],
  "placement": { "plan:planned": "build", "deliver:ready": "review" },
  "endings": { "plan:declined": "Declined at planning" },
  "landed": { "stage": "landed" },
  "rounds": { "workflow": "deliver", "loop": "rounds" },
  "returns": [{ "workflow": "deliver", "node": "rounds.review", "outcome": "return" }],
  "approves": [{ "workflow": "deliver", "node": "rounds.review", "outcome": "approve" }],
  "asked": ["deliver:ask"],
  "change": { "workflow": "deliver", "pointer": "/change" },
  "itemTitle": { "input": "item" },
  "map": {
    "cards": [
      { "stage": "plan" },
      { "stage": "build" },
      { "stage": "review" },
      { "stage": "landed" }
    ],
    "arrows": [
      { "from": "plan", "to": "build", "label": "planned" },
      { "from": "build", "to": "review" },
      { "from": "review", "to": "build", "label": "returned" },
      { "from": "review", "to": "landed", "label": "merged" }
    ],
    "notes": [{ "text": "You answer questions here", "near": "needs-you" }]
  }
}
```

## The factory overview

A factory overview explains how a factory runs, for presenting it. It is written by hand: it
is not live, not exhaustive, and never generated from the pack's workflows. The Factory tab
shows it under **How it works** (`factory/how-it-works`) when the pack the tab draws has one.

It is a root view and drill-downs. Each view lays out cards on a grid, in labelled groups,
joined by lines; a card marked ⤢ opens a closer look. A sidebar lists every view with its
number of cards (on a phone, a menu above the map), a breadcrumb leads back up, and **Full
screen** draws the overview over the whole console until **Esc**. Drag to pan, scroll or use the
buttons to zoom, and **Fit** to see a whole view.

The file is found as the view file is: the project's
`.archon/packs/<pack key>.factory-overview.json` first, then the pack's own
`.shared/factory-overview.json`. A file that does not validate is listed with its path and the
field at fault on every Factory page.

Lines are drawn straight, so a view validates only when its picture is clean:

- A `feeds` or `calls` line joins two ends that share a row or a column, and runs along it.
- A `loops-back` line joins two cards. It drops from the bottom of its source into a lane under
  everything, runs along it, and rises into its target. A view has one at most, and the root
  view exactly one.
- No line may run through a card other than its ends, through a group that holds neither end,
  or into another line. Move a card to give a line a clear row or column.

A group stacked in one column, met only along rows, whose cards no line names, is drawn as
parallel: its cards are as tall as their text, and a line into or out of the group branches to
each card.

## Overview fields

| Field | Required | What it does |
|---|---|---|
| `version` | yes | Always `1`. |
| `pack` | yes | The pack the overview explains: `owner/name` when installed, else its folder name. |
| `title` | yes | The overview's name: its heading, and the first entry of the breadcrumb. |
| `caption` | yes | One paragraph in plain words, shown under the root view's map on the page. Full screen does not show it: whoever presents says it. |
| `root` | yes | The id of the view the page opens on. |
| `views` | yes | Every view by id (a lowercase slug). A view has `cards`, `edges`, and optionally `groups`. A drill-down view may also have its own `caption`, shown under its map as the root's is; the root view takes none, since its line is the top-level `caption`. A card has an `id` (unique across the file), a `title`, one line of `text`, an `icon`, a `kind` (`input`, `stage`, `check`, `person`, `gate` or `outcome`, which sets its colour and legend entry), its grid cell `col` and `row` (from 1), and optionally the `group` it sits in and the view it `opens`. A group has an `id` and a `label`; its box wraps its cards and may hold no other card. An edge has `from` and `to` (a card or group of the same view), a `kind` (`feeds`, `calls` or `loops-back`), and an optional `label`. Every view but the root is opened by exactly one card. |

The icons are `inbox`, `issue`, `order`, `search`, `scale`, `map`, `list`, `hammer`,
`git-pull-request`, `check`, `flask`, `eye`, `sparkles`, `gavel`, `users`, `flag` and `rotate`.

## Overview example

```json
{
  "version": 1,
  "pack": "acme/factory",
  "title": "How the factory works",
  "caption": "An issue comes in. Build writes the change, Review reads it, and a change Review approves lands. What Review finds goes back to Build.",
  "root": "factory",
  "views": {
    "factory": {
      "cards": [
        { "id": "issue", "title": "An issue", "text": "What someone wants built", "icon": "issue", "kind": "input", "col": 1, "row": 2 },
        { "id": "build", "title": "Build", "text": "Writes the change", "icon": "hammer", "kind": "stage", "col": 2, "row": 2, "opens": "build" },
        { "id": "review", "title": "Review", "text": "Reads the change", "icon": "eye", "kind": "check", "col": 3, "row": 2 },
        { "id": "landed", "title": "Landed", "text": "The change is merged", "icon": "flag", "kind": "outcome", "col": 4, "row": 2 },
        { "id": "you", "title": "You", "text": "Answer what it asks", "icon": "users", "kind": "person", "col": 2, "row": 1 }
      ],
      "edges": [
        { "from": "issue", "to": "build", "kind": "feeds" },
        { "from": "build", "to": "review", "kind": "feeds" },
        { "from": "review", "to": "landed", "kind": "feeds" },
        { "from": "build", "to": "you", "kind": "calls", "label": "asks" },
        { "from": "review", "to": "build", "kind": "loops-back", "label": "sent back" }
      ]
    },
    "build": {
      "caption": "Build writes the change in its own checkout.",
      "cards": [
        { "id": "build-write", "title": "Write it", "text": "Code and tests", "icon": "hammer", "kind": "stage", "col": 1, "row": 1 },
        { "id": "build-pr", "title": "Pull request", "text": "Opened as a draft", "icon": "git-pull-request", "kind": "outcome", "col": 2, "row": 1 }
      ],
      "edges": [{ "from": "build-write", "to": "build-pr", "kind": "feeds" }]
    }
  }
}
```
