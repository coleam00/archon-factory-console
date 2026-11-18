# Land policy: the factory console

Shadow only in the pack today: the judgment is recorded and nothing acts on it. The operator merges every change by hand.

A ready change may merge without asking only when all of these hold:

- Every CI check is green on the head commit, and the change still merges cleanly with `main`. When `main` moved since CI ran, CI must run again on the change brought up to date.
- It changes no page a person sees, or the operator has already looked at it in a browser on a copy of the live database (`docs/factory-console/ENGINEERING.md`). A change to what the console shows is otherwise an ask: the owner presents from this screen.
- It does not touch the database schema or the engine's workflow behaviour.

After a merge the branch must stay green: a red `main` after a merge is fixed forward at once, before the next change merges.
