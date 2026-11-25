# The factory view for Wirasm/archon-software-factory

`factory-view.json` is the curated factory view for the pack `Wirasm/archon-software-factory` at
commit `b62ec7b20830c1675e1946d3003dcc3085ac3b0f`: the words, the How it works picture, the
drill-down cards and the story wording the console draws the factory with. Its shape is
`packages/workflows/src/schemas/factory-view.ts`. The Overview map lays itself out from the pack
graph (its document groups and arrows); the file says only which stage items leave it by
(`merged`).

A pack ships this file as `<pack>/.shared/factory-view.json`. This copy is the source: copy it into
`<installed pack>/.shared/` for the demo until the owner's own copy of the pack ships it.

Check it against a pack tree (an installed one at `plugins/packs/<owner>/<name>/<commit>`):

```
bun run check:factory-view <pack dir> --view docs/factory-console/pack-view/factory-view.json
```

A name the pack graph lacks is an error; an in-flow stage with no words is a warning, and so
are group words when the pack declares no groups (its map then draws one card per stage). A file
written for `combined` still reads: its `map` block is ignored, with a warning that it can go.

The file also says where a board card finds an item's progress in its runs' records: `retired`
(workflows the pack no longer has whose runs still count, here `deliver`), `rounds` (the
`deliver` loop and the `stage-check` result's `/round` and `/allowance`), `returns` and
`approves` (the steps whose outcome sends an item back or approves its round) and `change`
(where a run names its pull request). Those names are checked against the graph as well; a
retired workflow's steps cannot be, since the graph lacks them.
