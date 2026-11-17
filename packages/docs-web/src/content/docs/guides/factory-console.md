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
workflows or steps in its own code.

## What the tab shows

A project gets a **Factory** tab after Runs, Chat and Metrics when a factory view applies to
it. Inside it:

- **Overview**: the view's title and summary, then a strip of numbers, then **Needs you**:
  every open question an item is waiting on, one line each with its recommended option.
  **Open** a line to answer it in place, the recommended option first. The newest few show;
  **N more · show all** lists the rest. Paused runs' waits appear there too. Then **the map**: the declared stages as cards
  on the `map` grid, coloured by group, with the declared hand-offs between them (returns
  dashed, in the gap below a row). Each card says how many items are in it now, pulsing while a run works one,
  and how many need a person. Drag to pan, and scroll or use the buttons to zoom. **Fit** shows
  the whole map when it fits at a readable size; with a card's details open, or on a narrow
  screen, it stops at the smallest readable size, so drag, zoom out or close the details to
  see the rest. Click a card for its stage page; its details button (ⓘ) shows its items and
  workflows beside the map.
- **Needs you**: its own page, reached from the sub-navigation, which shows how many wait.
  Every open question and paused wait on this project's items, all of them, each answerable
  in place as on the Overview.
- **Board**: one column per declared stage, each item one card in the column of the stage it
  is in. A card shows the item's state (Running, Needs you, Failed, Waiting, Landed), the
  round it is on, the step running now, how often checks sent it back, and its pull request.
  A **Table** view lists the same fields as sortable columns.
- **Item page**: one item's state, open asks, a timeline of every run and round, its links to
  other items, and the rulings and answers given on it. The timeline words an outcome from the
  declaration: a run outcome in `placement` reads as where it sent the item ("sent to Plan"),
  one in `endings` as its label, and a step outcome in `returns` or `approves` as "returned" or
  "approved". An outcome the declaration does not map shows as the pack's own name for it.
- **Stage page**: what a stage does and the step graph of each workflow behind it. The
  stage's own steps stand out, steps another stage works are dimmed, and a step running for
  an item now glows.
- **Step page**: the items on a step now, its prompt, its YAML and the model it runs on.
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
3. Its last completed run's `workflow:outcome` is a key of `placement`: that stage.
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
| `stages` | yes | The board's columns, left to right. Each stage has an `id` (a lowercase slug), a `label`, a one-line `blurb`, a colour `group` (`intake`, `build`, `check` or `land`), the `workflows` whose runs count in it (empty for a stage no run works, such as Landed), and optionally `nodes`: the steps that count in it while they run. A step matches a node equal to its id, or one its id begins with followed by `.`, so `rounds` matches `rounds.fix`. A step of an included workflow is `<include>__<node>`. |
| `placement` | yes | Where an item waits after a run ends: `workflow:outcome` to a stage id. |
| `endings` | yes | Outcomes that end an item without a change: `workflow:outcome`, or `workflow:*` for every outcome `placement` does not take, to the label of the folded row. Use `{}` for none. |
| `landed` | yes | `{ "stage": <id> }`: the stage an item whose change merged sits in. |
| `rounds` | no | `{ "workflow", "loop" }`: the loop whose iterations the board counts as rounds ("round 2 of 3"). |
| `returns` | no | Steps whose outcome sends an item back: each `{ "workflow", "node", "outcome" }`. The board counts them as "returned ×N" and colours that round returned. |
| `approves` | no | Steps whose outcome approves a round, in the same shape. A round with neither a declared return nor a declared approval reads as needing a decision. |
| `change` | no | `{ "workflow", "pointer" }`: the JSON pointer to the pull request URL in that workflow's result. |
| `itemTitle` | no | `{ "input" }`: the run input whose first line is the item's title. Without it, the item's key is its title. |
| `map` | yes | The layout of the factory map: `cards` place each stage on a grid (`stage`, `col`, `row`, from 1), `arrows` join stages (`from`, `to`, an optional `label` and `back: true` for a return), and optional `notes` sit near a stage or near `needs-you`. The map draws a stage's notes on its card; a `needs-you` note is not drawn yet. An arrow between cards in different rows and columns, and every return, runs through the gap below the upper row, and a gap grows with the arrows it carries. Four columns fill a 1440px screen at full size; a wider grid fits smaller. |

Every stage a field names must be declared in `stages`, and every workflow named in
`placement`, `endings`, `rounds`, `returns`, `approves` and `change` must be listed by a stage.

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
  "change": { "workflow": "deliver", "pointer": "/change" },
  "itemTitle": { "input": "item" },
  "map": {
    "cards": [
      { "stage": "plan", "col": 1, "row": 1 },
      { "stage": "build", "col": 2, "row": 1 },
      { "stage": "review", "col": 3, "row": 1 },
      { "stage": "landed", "col": 4, "row": 1 }
    ],
    "arrows": [
      { "from": "plan", "to": "build", "label": "planned" },
      { "from": "build", "to": "review" },
      { "from": "review", "to": "build", "label": "returned", "back": true },
      { "from": "review", "to": "landed", "label": "merged" }
    ],
    "notes": [{ "text": "You answer questions here", "near": "needs-you" }]
  }
}
```

## The factory overview

A factory overview explains how a factory runs, for presenting it. It is written by hand: it
is not live, not exhaustive, and never generated from the pack's workflows. The Factory tab
shows it under **How it works** (`factory/overview`) when the pack the tab draws has one.

It is a root view and drill-downs. Each view lays out cards on a grid, in labelled groups,
joined by lines; a card marked ⤢ opens a closer look. A sidebar lists every view with its
number of cards, a breadcrumb leads back up, and **Full screen** draws the overview over the
whole console until **Esc**. Drag to pan, scroll or use the buttons to zoom, and **Fit** to see
a whole view.

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

## Overview fields

| Field | Required | What it does |
|---|---|---|
| `version` | yes | Always `1`. |
| `pack` | yes | The pack the overview explains: `owner/name` when installed, else its folder name. |
| `title` | yes | The overview's name: its heading, and the first entry of the breadcrumb. |
| `caption` | yes | One paragraph in plain words, shown under the root view's map on the page. Full screen does not show it: whoever presents says it. |
| `root` | yes | The id of the view the page opens on. |
| `views` | yes | Every view by id (a lowercase slug). A view has `cards`, `edges`, and optionally `groups` and a `caption`, shown under that view's map as the root's is. A card has an `id` (unique across the file), a `title`, one line of `text`, an `icon`, a `kind` (`input`, `stage`, `check`, `person`, `gate` or `outcome`, which sets its colour and legend entry), its grid cell `col` and `row` (from 1), and optionally the `group` it sits in and the view it `opens`. A group has an `id` and a `label`; its box wraps its cards and may hold no other card. An edge has `from` and `to` (a card or group of the same view), a `kind` (`feeds`, `calls` or `loops-back`), and an optional `label`. Every view but the root is opened by exactly one card. |

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
