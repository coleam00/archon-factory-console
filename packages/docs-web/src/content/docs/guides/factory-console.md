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
  every open question an item is waiting on, with the recommended option first, answerable in
  place. Paused runs' waits appear there too.
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
   `nodes`, when given) match the run's workflow and running step.
2. Its change merged: the `landed` stage.
3. Its last completed run's `workflow:outcome` is a key of `placement`: that stage.
4. Its last run's outcome is a key of `endings`: off the board, in a folded row under it.
5. Its last run failed or was cancelled: the stage of the step it failed at.
6. Otherwise the first stage.

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
| `map` | yes | The layout of the factory map: `cards` place each stage on a grid (`stage`, `col`, `row`, from 1), `arrows` join stages (`from`, `to`, an optional `label` and `back: true` for a return), and optional `notes` sit near a stage or near `needs-you`. The console does not draw the map yet. |

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
