# The factory view for Wirasm/archon-software-factory

`factory-view.json` is the curated factory view for the pack `Wirasm/archon-software-factory` at
commit `b62ec7b20830c1675e1946d3003dcc3085ac3b0f`: the Overview map, the How it works picture,
the drill-down cards and the words that have no home in the pack's workflow YAML. Its shape is
`packages/workflows/src/schemas/factory-view.ts`.

On `spike-a`, a stage's label, short line and blurb, its steps' labels and its outcomes' labels
and stories live in the pack's workflow YAML (`display:`), and the console reads them from the
pack graph before this file (`packages/web/src/experiments/console/factory/lib/graph-words.ts`).
The pack at b62ec7b carries no `display:` yet: `../pack-spike/` holds its changed workflow files
at their pack-relative paths. Copy that folder over the installed pack directory, then this file
into its `.shared/`, to get the spiked pack. Without the overlay the console still draws, with
step ids and stage names where the words were, and `check:factory-view` warns that each stage
has no words.

A pack ships this file as `<pack>/.shared/factory-view.json`. This copy is the source: copy it into
`<installed pack>/.shared/` for the demo until the owner's own copy of the pack ships it.

Check it against a pack tree (an installed one at `plugins/packs/<owner>/<name>/<commit>`):

```
bun run check:factory-view <pack dir> --view docs/factory-console/pack-view/factory-view.json
```

A name the pack graph lacks is an error; an in-flow stage the map leaves unplaced is a warning.

The file also says where a board card finds an item's progress in its runs' records: `retired`
(workflows the pack no longer has whose runs still count, here `deliver`), `rounds` (the
`deliver` loop and the `stage-check` result's `/round` and `/allowance`), `returns` and
`approves` (the steps whose outcome sends an item back or approves its round) and `change`
(where a run names its pull request). Those names are checked against the graph as well; a
retired workflow's steps cannot be, since the graph lacks them.
