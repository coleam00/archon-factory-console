# The factory view for Wirasm/archon-software-factory

`factory-view.json` is the curated factory view for the pack `Wirasm/archon-software-factory` at
commit `b62ec7b20830c1675e1946d3003dcc3085ac3b0f`: the words, the How it works picture, the
drill-down cards and the story wording the console draws the factory with. Its shape is
`packages/workflows/src/schemas/factory-view.ts`. The Overview map lays itself out from the pack
graph (its document groups and arrows); the file says only which stage items leave it by
(`merged`).

On `spike-a` and `spike-ab`, a stage's label, short line and blurb, its steps' labels and its outcomes' labels
and stories live in the pack's workflow YAML (`display:`), and the console reads them from the
pack graph before this file (`packages/web/src/experiments/console/factory/lib/graph-words.ts`).
The pack at b62ec7b carries no `display:` yet: `../pack-spike/` holds its changed workflow files
at their pack-relative paths. A step inside an `include:` takes its words in the included
workflow's YAML, not on the include node (the loader refuses `display:` there), so Build's step
word lives in `build/build.yaml`. Copy that folder over the installed pack directory, then this file
into its `.shared/`, to get the spiked pack. Without the overlay the console still draws, with
step ids and stage names where the words were, and `check:factory-view` warns that each stage
has no words.

A pack ships this file as `<pack>/.shared/factory-view.json`. This copy is the source: copy it into
`<installed pack>/.shared/` for the demo until the owner's own copy of the pack ships it.

Check it against a pack tree (an installed one at `plugins/packs/<owner>/<name>/<commit>`):

```
bun run check:factory-view <pack dir> --view docs/factory-console/pack-view/factory-view.json
```

An entry naming something the pack graph lacks (a stage, step, outcome, option, group, progress
workflow or loop, or a How it works edge the graph no longer connects) is dropped: the console
draws the rest of the file, and the check and the view route list it as a `dropped:` warning. A
pack that declares no groups drops the file's group words, and its map draws one card per stage.
What drift cannot cause is still an error, and the console refuses the file on it: a step two
drill-down cards cover, a workflow `rounds` or `change` names twice, a `retired` entry the graph
has or that is listed twice, and "returned" said by an outcome or a `returns` point but not the
other. An in-flow stage with no words is a warning.

The file also says where a board card finds an item's progress in its runs' records: `retired`
(workflows the pack no longer has whose runs still count, here `deliver`), `rounds` (the
`deliver` loop and the `stage-check` result's `/round` and `/allowance`), `returns` and
`approves` (the steps whose outcome sends an item back or approves its round) and `change`
(where a run names its pull request). Those names are checked against the graph as well; a
retired workflow's steps cannot be, since the graph lacks them.
