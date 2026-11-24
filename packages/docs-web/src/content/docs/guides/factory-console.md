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

The factory adds no page or tab for asks of its own. An open question on a factory item is
answered where Archon answers it, through Archon's own ask section (the question, its context,
each option with what it does and costs, and the recommendation): on the Overview, on the
item's board card and on its item page. Items an `awaits` outcome left waiting on a person with
no question open are listed by the board's **needs you** show and on their item page, with
what to do (the view's `next`) and the questions to settle.

A project gets a **Factory** tab after Runs, Chat and Metrics when a pack with a factory
overview file lists it among the projects a factory view of the pack applies to (the
`/api/factory/packs` read the sidebar's **Factory** entry also makes). A project whose pack has
no overview file, or whose own view file is broken, gets no tab. Its sub-navigation, on the
line of the view's title, has two pages: **Overview** and **Board**. How it works is the pack's
page under **Factory** in the console's sidebar. Inside the tab:

- **Overview**: the view's title and summary (on a phone, its first three lines and **More**),
  then a strip of numbers (its **need you** number counts the factory's open asks and waits and
  the items waiting on you), then **Needs you**: the open asks of the newest three items that
  asked, in Archon's own ask section and answerable in place, and a link to the board's
  **needs you** show saying how many more wait there. Then **the map**: one card per board column (one per stage
  when the view declares no `columns`), in one row, always. A card of several stages lists each
  as a row. A card shows its group's colour, icon and kind, each stage's label and `short` line,
  and chips for how many items are there now ("2 here", its dot pulsing while a run works one)
  and how many need a person. The map counts what the board counts: an item the board sets
  aside is in no card's count and in no stage's "Items here now". The arrows are the pack graph's
(`GET /api/packs/{pack}/graph`): each arrow between two workflows the view's stages list, drawn
between their stages and labelled in the view's `map.arrows` words. The map shows its loading
shape until the graph is read, which can take a while the first time. A
  forward hand-off is a short line between neighbouring cards, labelled on a pill. Every
  send-back (an arrow into an earlier card, or into its own stage or an earlier one of its card:
  a return, a replan) runs dashed in one feedback lane under the row, with one pill per stage it
  returns to. While a run works an item, a dot travels along the hand-off into its card. The map
  draws its text at full size, so on a screen too narrow for the whole row it pans sideways,
  opening on the card with the most items in flight. Drag to pan, and scroll or use the buttons
  to zoom; **Fit** goes back to how it opened. Click a card, or a stage's row, for its stage
  page. A card's details button (ⓘ) shows each of its stages' items and workflows beside the map.
- **Board**: one column per declared `columns` entry (one per stage when the view declares
  none), each item one card in the column holding the stage it is in. The board fills the
  screen and each column scrolls on its own under a header with its label, its `blurb` ("last 7 days" on the column holding the `landed` stage), its
  count and a chip per state ("running 2", "needs you 1"). A card names its stage, or the
  stage and step running now ("Checks · Code review · round 2"), and shows the item's state
  (Running, Needs you, Failed, the label of an `awaits` outcome such as "Needs shaping", Parked,
  Waiting, Merged), the round it is on, how often checks sent it
  back, its pull request, and the work order it is part of. The column holding the `landed`
  stage lists the items merged in the last 7 days (local time), newest first, with "N earlier
  · show all" opening the Table filtered to every merged item; its cards are compact (key,
  title, pull request, when it merged). On a phone the columns stack and each shows its first
  three cards, with "show all N" for the rest.
  A **Table** view lists the same fields as sortable columns, the stage and the board column
  among them. The filter box finds an item by
  key, title or the key of its work order.
  A **work order** is an item other items are `part_of`. An item's order is its active `part_of`
  link (`archon workflow link --item <member> --kind part_of --to <order>`), else the order its
  latest run of the `partOf` workflow that completed with its declared outcome named (a refused
  run never makes it a member); a link wins. Above the Pipeline's columns, a **Work orders**
  section lists the orders with a member on the board under a header that counts them ("2 work
  orders · 1 open"; open means not every member merged) and folds the list. Each row shows the
  order's name (its own title, else "Work order <key>"), how many of its members merged ("3 of 5
  merged") and each member's state as a dot; clicking the row opens the order's page.
  **Highlight members** lights its members on the board without leaving it; a member's "part of"
  chip does the same. While an order is lit, the header says "highlighting <key>" with **Clear
  highlight**. An order is listed once one of its members has a run; until then the order and its
  members, each "Not started", show on the order's item page (`/factory/items/<order key>`). An order with no
  run of its own is not a card and counts in no number. The console shows links; it never
  records or ends one.
  Under the board, in both views, sits one line holding **Found by the factory** and **Set
  aside** with one toggle, **show them**, that opens both together below the board or table,
  never over it: the board keeps its height and the page scrolls to them. Switching Pipeline and
  Table leaves them open or closed.
  When the view declares `discoveries`, **Found by the factory** is on that line whatever the
  filter ("14 filed, not on the board yet"); the toggle, or a board
  address with `?show=found` (which also scrolls the line into view), opens the full panel: how many findings the discoveries drains decided to file
  that no item on the project carries yet (an item carries one when its title is the finding's,
  ignoring case), with chips counting every finding they decided to file, held and dropped,
  and how many are already on the board, then each finding: its kind, its title,
  the item whose drain decided it and when, and how the drain verified it, on hover. The panel
  only reads: it files, starts
  and dismisses nothing.
  Beside it, the columns' items with nothing left to happen fold into **Set aside** ("3 set
  aside"), which the toggle opens to list each item's key, title, why it was set aside and
  when its last run ended. An item is set aside when an `endings` outcome took it off the
  board, when its last run ended in a `parked` outcome, or when its last run ended more than 3
  days ago and it never proposed a change (or its change's merge state could not be read);
  never while a run works it, it has an open question, an `awaits` outcome leaves it waiting on
  you, or a start is queued or held for it. It is a reading of the items, not a state: nothing
  is stored or written, and a new run brings the item back to its column at once. An item set
  aside counts in no column, not in flight and not in M; an open question on it still shows on
  the Overview.
- **Item page**: the story of one item. A header band gives its number and title, its state
  pill, its pull request, where it is (a parked item reads its declared `parked` label and its
  run's reason, an item waiting on you its `awaits` label and reason) and its key facts: the time from its order to its merge (or to now), its cost,
  the check rounds used of those allowed, and the asks answered. A journey strip shows its path
  through the board's columns with the time it spent in each, the column it is in now lit, each
  send-back to an earlier column as a loop with its count, each ask it waited on as a pause,
  and where it stopped when it was parked, waiting on you, ended, failed or held (every ask it left answered,
  and nothing started after the answer, nor waits to: "Nothing started after your answer"). Then the story: one panel per
  stage visit in the order it ran (an item waiting on you opens it with a panel saying what it
  waits on, what to do and the questions to settle; a stage met again is numbered, "Plan (2)"), each opening
  with one plain sentence from the declaration's `story` (the console adds the pull request a
  run opened, why the checks sent it back, and what you answered), then its details (when, how
  long, cost, models, runs). A build that fixed what a check sent back
  folds into that check's panel. A Checks panel shows its rounds as a grid: a row per check whose outcome the
  declaration means (`returns`, `approves`, `verdicts`), the builder's fixes, what CI and the
  reviews said after the last round; a column per round, numbered by its order since the item was last planned and bounded by the allowance its run recorded; each
  cell an icon and a word ("Sent back", "Approved", "Fixed", "Not run"), with a legend and, for
  each round sent back, why in one sentence (the rest behind "More"). An ask sits in the panel
  of the stage that asked it: the question, the option chosen, who chose it and what that
  started; an open one in Archon's own ask section, answerable in place. Beside the story: the item's
  links to other items (on a work order, its members with their state and how many merged; an
  item no run has started yet says "Not started") and the rulings and answers given on it.
  An outcome the declaration does not tell reads as a neutral sentence from `placement`,
  `endings`, `awaits` and `parked` ("Plan finished: sent to Build"), or the pack's own name for it.
- **A stage**, opened over the Overview map: where items go from it (each arrow the pack graph
  draws out of it, in the view's words), then what it does, told as its drill-down when the view
  gives one: numbered phases of plain cards, a card glowing and naming the items on its steps
  now. **The real workflow** lists the steps of each workflow behind it, from the pack graph,
  as plain text by their names (the engine id on hover); a step running for an item now is
  marked and names the item. A step has no page of its own.

**How it works**, the pack's [factory overview](#the-factory-overview) when it has one, is a
hand-written picture of how the factory runs, for explaining it to someone who has never seen
it. It explains the pack, not the project, so it lives on the pack's page under **Factory** in
the console's sidebar, not in the project's Factory tab.

Views update within a few seconds of a run starting, changing step or ending, and of a
question opening or closing.

### The numbers

| Number | Counts |
|---|---|
| in flight | Items in a board column outside the landed stage; items set aside are not |
| items need you | Open questions and waits, and items an `awaits` outcome left waiting on a person; the Overview's **need you** number |
| merged today | Items whose change merged today, in the browser's local time |
| N of M merged | N items merged out of M in the board's columns, however long ago. Items set aside (ended, parked or idle) are not in M |
| median from first run to merged | Over merged items, the median time from an item's first run of a workflow the view names to its change merging |
| found by the factory | Findings the discoveries drains decided to file that no item carries yet; shown only when the view declares `discoveries` |

The numbers are plain figures, not links. Each counts with the same filter the board applies
for it (`?show=`), so a number and the board agree. When some items' merge state could not be
read, a line under the numbers says how many and links to the board showing only those items.
A board address that carries a filter can be shared and survives a reload; the board names the
filter on screen, with **Show all** to clear it.

### Where an item sits

Nothing stores an item's column. The console derives it from the item's runs, its open
questions and whether its change merged, taking the first rule that matches:

1. A run of a workflow the view names is running on it: the first stage whose `workflows`
   list the run's workflow.
2. Its change merged: the `landed` stage.
3. Its last completed run's `workflow:outcome` is a key of `placement`, else its
   `workflow:*`: that stage. `workflow:*` also places a run that returns no outcome.
4. Its last run's outcome is a key of `endings`: off the board, in the **Set aside** list with
   its ending label as the reason ("Closed by triage", "Folded into another item"). A `parked`
   outcome is never an ending: rule 3 places it, and the item stays open.
5. Its last run failed or was cancelled: the first stage of its workflow.
6. Otherwise the first stage.

A run that completed with an outcome neither `placement` nor `endings` takes is passed over by
these rules, so the item stays where its earlier runs put it (a stage that starts again on an
item only to find nothing to do changes nothing). The board, the map and the item page all
place an item by these same rules.

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
| `stages` | yes | The stages an item moves through, left to right: the map's cards, the stages they open, and the board's columns when `columns` is absent. Each stage has an `id` (a lowercase slug), a `label`, a one-line `blurb`, an optional `short` line for its map card (at most 24 characters, what one row of a card holding several stages shows whole; without it the card shows the blurb, cut to fit), a colour `group` (a name: the console colours `intake`, `build`, `check` and `land`, and draws any other name in a neutral colour), the `workflows` whose runs count in it (empty for a stage no run works, such as Merged; a workflow two stages list counts in the first). Its steps are the pack graph's, never listed here. A stage may carry a `drilldown`: what it does step by step, as numbered `phases` (each a `label` and one to six `cards`), and an optional `loop` (`label`, `from` and `to` phase numbers, and the loop group's `workflow` and `step`) around the phases a loop group repeats. A card has a `title`, one line of `text`, an `icon` (one of `inbox`, `scale`, `link`, `ruler`, `scissors`, `database`, `clipboard-list`, `pencil`, `wrench`, `git-branch`, `search-code`, `flask-conical`, `monitor-check`, `gavel`, `message-square`, `circle-alert`, `git-pull-request`, `flag`, `send`, `shield-check` or `git-merge`), a `kind` (`agent`, `check`, `script` or `you`), and `covers`: the real steps it stands for, by name, as `{ "workflow", "steps" }` for a workflow its stage lists (a step of an included workflow is `<include>__<node>`, a loop body `<group>.<node>`). The stage's modal draws it: the phases as numbered columns of plain cards, the loop as one labelled frame around its phases, and a card glows while an item is on a step it covers. A stage without a drill-down opens on its real workflow's steps. |
| `columns` | no | The board's columns, left to right, each a group of stages: `{ "id", "label", "blurb", "stages": [<stage id>, ...] }`. The `blurb` is the header's one-line subtitle; name the column's stages in it. The column holding the `landed` stage always reads "last 7 days" there instead, and its `blurb` is not shown on the board. Every declared stage is in exactly one column, and the `landed` stage in a column of its own. Placement still decides an item's stage; the board puts its card in the column holding that stage, and the card names the stage. A column takes the colour of the `group` of its last stage, the one an item leaves it from; the `landed` stage's column takes the merged colour. Without `columns`, the board draws one column per stage. |
| `placement` | yes | Where an item waits after a run ends: `workflow:outcome` to a stage id, or `workflow:*` for every completed run of the workflow no exact key takes, a run that returns no outcome (a gate that only records) included. |
| `endings` | yes | Outcomes that end an item without a change: `workflow:outcome`, or `workflow:*` for every outcome `placement` does not take, to the label the Set aside list gives as the reason. Use `{}` for none. Map outcomes that mean different things to their own labels rather than with one `workflow:*`: a wildcard also ends an outcome that keeps the item open. |
| `landed` | yes | `{ "stage": <id> }`: the stage an item whose change merged sits in. |
| `rounds` | no | Where the board counts check rounds ("round 2 of 3"): one source, or a list naming each workflow once. A loop-form source `{ "workflow", "loop" }` counts the loop's iterations. A stage-form source `{ "workflow", "round", "allowance" }` counts each completed run of the workflow as one round, numbered and bounded by its result at those JSON pointers (so the bound can grow, say to 4 after an extra round is allowed); a run still going has no number yet, so the card reads "round N of M, next one running". An item's rounds come from the source whose workflow recorded a round on it most recently; with the stage form, the rounds since its numbers last started again. |
| `returns` | no | Steps whose outcome sends an item back: each `{ "workflow", "node", "outcome" }`. The board counts them as "returned ×N" and colours that round returned. |
| `approves` | no | Steps whose outcome approves a round, in the same shape. A round with neither a declared return nor a declared approval reads as needing a decision. |
| `verdicts` | no | What other steps' outcomes mean, so the item page's rounds grid words them and gives each such step a row: `{ "<workflow>": { "<step id>": { "<outcome>": "approved" } } }`, each meaning one of `approved`, `returned` or `asked`. A check's outcome then reads "Approved", "Sent back" or "Asked you". It decides nothing: only `returns` and `approves` decide a round, and an entry that restates one of theirs is rejected. An outcome no entry means reads as the pack's own token, in mono. `bun run check:factory-view` fails a step the workflow does not have. |
| `parked` | no | Completed outcomes that keep an item open for later, not ended: `workflow:outcome`, or `workflow:*` for every outcome (not a run without one), each to `{ "label", "why" }`. `label` is what the item reads ("Parked by triage") in its header band and where its journey stops, with the Parked state pill; `why`, optional, is the JSON pointer to the run's reason in its result, shown after the label. `placement` must take each key, since it still decides where the item sits, and an exact `endings` key may not name one. The board sets a parked item aside while no start waits for it: it counts in no column, in flight or "N of M merged". |
| `awaits` | no | Completed outcomes after which the item is open and waits on a person, though no question is open (shaped again, say): `workflow:outcome`, or `workflow:*`, each to `{ "label", "why", "questions", "next" }`. `label` is what the item reads ("Needs shaping") on its state pill, in its header band and where its journey stops; `why`, optional, is the JSON pointer to the run's reason in its result; `questions`, optional, points at a list of what the person has to settle: the board card shows the first and how many ("4 questions"), the item page lists them. `next`, optional, is one plain sentence saying what the person does to move the item on (nothing here is answered in place); the item page shows it under "What to do". The item shows in the needs-you colour (soft, never the filled Needs you pill), counts in "items need you", and is listed by the board's **needs you** show. `placement` must take each key and no exact `endings` key may name one, as with `parked`; an outcome is parked or awaits, not both. |
| `retired` | no | Workflows a stage still lists that the installed pack no longer has, so items they delivered before still place, render and count: `["deliver"]`. `bun run check:factory-view` neither requires the pack to have them nor compares their names with the pack, and fails when the pack has one again. Each must be listed by a stage, once. |
| `change` | no | Where the pull request URL is in a workflow's result: one `{ "workflow", "pointer" }`, or a list naming each workflow once. The newest run of any listed workflow with a non-empty URL at its pointer gives the item's change. |
| `partOf` | no | `{ "workflow", "pointer", "outcome" }`: the JSON pointer to the item's work order (an item key) in that workflow's result, read only from runs that completed with `outcome` (the one that accepts the item), so a refused run never makes an item a member. Read only for an item with no active `part_of` link; the newest such run decides, and an empty value there means none. |
| `discoveries` | no | `{ "workflow", "filed", "held", "dropped", "entry": { "title", "kind", "verified" } }`: the workflow that drains what agents noticed outside their work, and where each of its completed runs' result lists what it decided, as JSON pointers: `filed`, `held` and `dropped` into the result (each a list), `entry` into each entry of `filed` (`title` required, `kind` and `verified` optional). Its runs place no item, so no stage need list it. A result recorded as text holding JSON (a script's output) is read as that JSON. A run whose result has no list at a declared pointer, or a filed entry with no title, counts as a drain that could not be read. |
| `itemTitle` | no | `{ "input" }`: the run input whose title line is the item's title: its first non-empty line after any `---` front matter, without a leading `#<n> ` or markdown heading marker. Without it, the item's key is its title. |
| `steps` | no | Display names for steps, by workflow: `{ "<workflow>": { "<step id>": "Writes the change" } }`, keyed by the step id as the engine records it (`build__build`, `rounds.fix`, the bare loop id `rounds`). Every page prints a step by this name. A step with no name reads as its cleaned id: a doubled include name collapses (`build__build` reads "build"), an include reads `include: inner`, a loop prefix is dropped (a step of the declared `rounds` loop adds its round where it is known), and `_` and `-` become spaces. The raw id shows on hover. `bun run check:factory-view` fails a key that names no real step. |
| `story` | no | How the item page tells what each run did, one plain sentence per stage: `{ "outcomes", "steps", "said" }`. `outcomes` maps `workflow:outcome` to a sentence, or to `{ "withChange", "withoutChange" }` when the outcome reads differently with and without a change on the item (a drop answered before any pull request), the page picking by whether the item has one ("Triage judged it worth building"), or `workflow:*` for every completed run of the workflow no exact key takes, a run that recorded no outcome included (as in `placement`); a key may name the `discoveries` workflow. `steps`, optional, words the earlier stages of a run that works several, by the step that starts each part: `{ "<workflow>": { "<step id>": "Build wrote the change" } }`. `said`, optional, lists JSON pointers into a run's result, tried in order, for what the run said in its own words: the page shows it as the reason a panel sent the item back, cut to a sentence with the rest behind "More", when a run sent the item back and no check round gave a reason (a CI send-back, say): on that panel's sentence while it is the panel's last run, else listed under the sentence with the fix that followed. It is not shown otherwise. A sentence is plain text of at most 160 characters with no placeholders; the page adds its own clauses after it (the pull request a run opened, why the checks sent it back, what you answered). With a `story`, `bun run check:factory-view` fails a key or step the workflow does not have, and warns on an outcome a listed workflow declares that no key takes. Without one, the page words each run from `placement`, `endings` and `parked` ("Triage finished: sent to Plan"). |
| `answers` | no | What choosing an option of an ask starts, in plain words: `{ "<workflow>:<option id>": { "starts": "Closes the PR without merging" } }`, keyed exactly (no `*`) by a workflow a stage lists and the option id an ask its runs leave offers. The item page's story shows it in place of "<stage> started again" for an answer that chose it. It decides nothing: the pack's own bindings decide what an answer starts. A sentence is plain text of at most 160 characters. |
| `map` | yes | The layout of the factory map: `cards` name the stages the map draws (`{ "stage" }`; each is drawn in the card of its board column, in the column's order, and the `col` and `row` an older file has are accepted and ignored), `arrows` word the arrows it draws (`{ "from", "to", "label" }`: two stage ids and the label for the arrow between them), and optional `notes` sit near a stage or near `needs-you`. The arrows themselves are the pack graph's: each arrow between two workflows the stages list, from the first stage listing its source to the first listing its target, once per pair of stages. An arrow over a `depends_on` link (one that wakes the link stage on another item) moves no item and is not drawn, and nor is one into a workflow no stage lists. A `map.arrows` entry for a pair the graph does not connect fails `bun run check:factory-view`; a drawn pair with no entry is drawn unlabelled, and the check warns. An arrow into an earlier card is a send-back, and so is one into its own stage or an earlier stage of its own card; one into a later stage of its own card is not drawn, since the card's rows show that order. A forward arrow runs between neighbouring cards; one that would skip cards is drawn as part of the label of the hand-off from its card to the next ("fast → Merged"). Every send-back runs in one feedback lane under the row. The cards always take one row; the map pans where it does not fit. The map lists a stage's notes in its card's details; a `needs-you` note is not drawn yet. |

Every stage a field names must be declared in `stages`, and every workflow named in
`placement`, `endings`, `parked`, `awaits`, `retired`, `rounds`, `returns`, `approves` and `change` must be listed by
a stage; `discoveries` is the exception.
With `columns`, every declared stage must be in exactly one column and the `landed` stage in
one of its own: a stage in no column, a stage in two, a column naming a stage `stages` does
not declare, and a column id used twice are each rejected at their path, and
`bun run check:factory-view` reports them as schema findings.
A drill-down card and loop must name a workflow their own stage lists.

## The check

The view is presentation only: it gives the pack's workflows, steps, outcomes and options
words, a stage and a position. The schema cannot see the pack, so a separate check compares a
view file, and the overview file beside it, with the pack graph. It is a script of an Archon
checkout, `bun run check:factory-view`, and it checks only the project files in that checkout's
own `.archon/packs/` (`<pack key>.factory-view.json` and `<pack key>.factory-overview.json`),
not another project's files or a pack's `.shared/` files. It reads each pack's graph (what
`archon pack graph <pack key> --json` prints, from the same read `GET /api/packs/{pack}/graph`
answers from) from the pack itself, never from a committed capture. The pack's repo and commit
are pinned in one place, `<pack key>.pack-pin.json` beside the view file
(`{ "repo": "<owner>/<name>", "commit": "<sha>" }`):

- with no home named (as in CI), the check fetches the pinned commit from GitHub at depth 1
  into a throwaway home, laid out as `archon plugin add` lays out an install;
- when a home is named (the home `ARCHON_FACTORY_LIVE_HOME` names, else `ARCHON_HOME`), it
  reads the pack installed in that home's `plugins/`, and fails when the install is at another
  commit than the pin, so a reinstall is caught where it is installed. When `archon pack graph`
  cannot find the pack there (including when the home has no `plugins/`), the check fails with
  that reason rather than falling back to the pin: install the pack there, or unset both
  variables to check the pinned commit.

Either way it reads the pack on a throwaway home holding only those plugins, so an install is
only read, and with no trigger files every arrow is one the pack declares. Each finding names
its path in the view or overview file.

It **fails** (exits 1) on:

- a schema error;
- a workflow named anywhere in the view that the pack does not have (the `discoveries`
  workflow included), unless `retired` names it, and a `retired` workflow the pack still has;
- a step a drill-down card, a loop, `steps`, `story.steps`, `verdicts`, `returns`, `approves` or
  a loop-form `rounds` source names that its workflow does not have (a loop and a loop-form
  source must name a loop group), and a `change` or stage-form `rounds` source on a workflow
  that returns no result;
- an exact outcome in `placement`, `endings`, `parked`, `awaits`, `story.outcomes` or `partOf`
  that its workflow does not declare (a workflow that declares none is not compared);
- an option an `answers` key names that no asks-settled hand-off of its workflow leaves on;
- a drill-down card or loop on a workflow its stage does not list or the view retired, and a
  step two cards cover;
- a `map.arrows` entry for a pair of stages the map does not draw;
- an overview edge between two cards whose `opens` names a stage of the view, where the graph
  does not connect those two stages.

It **warns**, and still passes, on what the graph has that the view leaves out:

- a workflow that takes part in the pack's hand-offs and that no stage lists (the
  `discoveries` workflow aside);
- an outcome of a listed workflow that neither `placement` nor `endings` takes (a run that ends
  so leaves its item where its earlier runs put it), and, with a `story`, one no sentence tells;
- a step of a listed workflow no drill-down card covers;
- an arrow the map draws with no `map.arrows` label;
- a stage of the view that no card of the overview opens, so a stage How it works skips is
  always named.

A `retired` workflow is not required of the pack, and none of its names is compared, so its
entries in `placement`, `story` and the rest stay to word its old runs.

After reinstalling the pack, move the pin to the installed commit with
`bun run check:factory-view --pin <pack key>`, then fix what the check reports in the view and
overview files and commit them with the pin.

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
      "short": "Writes the change and PR",
      "group": "build",
      "workflows": ["build"]
    },
    {
      "id": "review",
      "label": "Review",
      "blurb": "Reads the change and sends it back when something is wrong.",
      "group": "check",
      "workflows": ["review"]
    },
    {
      "id": "landed",
      "label": "Merged",
      "blurb": "The change merged.",
      "group": "land",
      "workflows": []
    }
  ],
  "columns": [
    { "id": "work", "label": "Plan & build", "blurb": "Plan, build", "stages": ["plan", "build"] },
    { "id": "review", "label": "Review", "blurb": "Review", "stages": ["review"] },
    { "id": "merged", "label": "Merged", "blurb": "Merged changes", "stages": ["landed"] }
  ],
  "placement": { "plan:planned": "build", "build:built": "review", "review:return": "build" },
  "endings": { "plan:declined": "Declined at planning" },
  "landed": { "stage": "landed" },
  "rounds": { "workflow": "review", "round": "/round", "allowance": "/allowance" },
  "returns": [{ "workflow": "review", "node": "verdict", "outcome": "return" }],
  "approves": [{ "workflow": "review", "node": "verdict", "outcome": "approve" }],
  "change": { "workflow": "build", "pointer": "/change" },
  "discoveries": {
    "workflow": "discoveries",
    "filed": "/filed",
    "held": "/held",
    "dropped": "/dropped",
    "entry": { "title": "/title", "kind": "/kind", "verified": "/verified" }
  },
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
      { "from": "build", "to": "review", "label": "built" },
      { "from": "review", "to": "build", "label": "returned" },
      { "from": "review", "to": "landed", "label": "merged" }
    ],
    "notes": [{ "text": "You answer questions here", "near": "needs-you" }]
  }
}
```

## The factory overview

A factory overview explains how a factory runs, for presenting it. It is written by hand: it
is not live, not exhaustive, and never generated from the pack's workflows. The same pack runs
on many projects, so the overview lives in the console's sidebar: **Factory** (shown once a pack
has an overview file) lists every such pack with how many projects run it, and each pack's
**How it works** page (`/console/factory/<pack key>/how-it-works`) draws its overview. With one
pack, **Factory** opens its page directly.

The pack's page is How it works only: it has no tabs and names no project. The console shows
no pack settings: a project sets them in its `.archon/packs/<pack key>.yaml`.

It is a root view and drill-downs. Each view lays out cards on a grid, in labelled groups,
joined by lines; a card marked ⤢ opens a closer look. A sidebar lists every view with its
number of cards and one line saying what it shows (on a phone, a menu above the map), a
breadcrumb leads back up, and **Full screen** draws the overview over the whole screen, the
legend docked in its bottom-left corner, until **Esc**. Drag to pan, scroll or use the buttons
to zoom, and **Fit** to see a whole view. A view opens at a zoom whose smallest text is at least
12 px; a view wider than the screen at that zoom opens at its start and pans.

A pack's page reads the pack's own `.shared/factory-overview.json` when it ships one. Otherwise
it reads a project's `.archon/packs/<pack key>.factory-overview.json` (the first project by
name that has one) and names that project under its title, so a project can present a pack it
cannot edit. A file that does not validate is listed with its path and the field at fault on
the pack's page; a broken pack file falls back to a project's file, its error still listed.

Lines are drawn straight, so a view validates only when its picture is clean:

- A `feeds` or `calls` line joins two ends that share a row or a column, and runs along it.
- A `loops-back` line sends work back. One from A to B in a view with a `calls` line from B to A
  is the answer to that ask: it runs beside the ask, along the same row or column.
- Every other `loops-back` line joins two cards in different columns. It drops from the bottom
  of its source into a lane under everything, runs along its own track there, and rises into its
  target, labelled where it rises. A view may have several; the root view has at least one.
  Their spans (source to target) must nest or stay apart: a line whose span holds another runs
  under it, and two lines whose spans overlap without one holding the other would cross.
- No line may run through a card other than its ends, through a group that holds neither end,
  or into another line. Move a card to give a line a clear row or column.
- Labels are not part of the check. Each label is drawn on a pill beside its line, and a pill
  wider than the room its line has can cover a card or a line: keep the label of a short line
  short, such as a send-back between neighbouring columns or an answer between neighbouring cards.

A group stacked in one column, met only along rows, whose cards no `feeds` or `calls` line
names, is drawn as parallel: a line into or out of the group branches to each card.

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
  "caption": "An issue comes in. Build writes the change, Review reads it, and a change Review approves is merged. What Review finds goes back to Build, and your answer to a question restarts Build.",
  "root": "factory",
  "views": {
    "factory": {
      "cards": [
        { "id": "issue", "title": "An issue", "text": "What someone wants built", "icon": "issue", "kind": "input", "col": 1, "row": 2 },
        { "id": "build", "title": "Build", "text": "Writes the change", "icon": "hammer", "kind": "stage", "col": 2, "row": 2, "opens": "build" },
        { "id": "review", "title": "Review", "text": "Reads the change", "icon": "eye", "kind": "check", "col": 3, "row": 2 },
        { "id": "merged", "title": "Merged", "text": "The change is in main", "icon": "flag", "kind": "outcome", "col": 4, "row": 2 },
        { "id": "you", "title": "You", "text": "Answer what it asks", "icon": "users", "kind": "person", "col": 2, "row": 1 }
      ],
      "edges": [
        { "from": "issue", "to": "build", "kind": "feeds" },
        { "from": "build", "to": "review", "kind": "feeds" },
        { "from": "review", "to": "merged", "kind": "feeds" },
        { "from": "build", "to": "you", "kind": "calls", "label": "asks" },
        { "from": "you", "to": "build", "kind": "loops-back", "label": "your answer restarts it" },
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
