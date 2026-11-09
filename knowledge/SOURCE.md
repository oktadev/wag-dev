# Source

- Repo: https://github.com/pcarleton/draft-carleton-workload-authz-grant
- Pinned commit: `85437ecb4fdb4af1a8558aacdcd90b41c5b8048f` (2026-11-02)
- Files studied: `draft-carleton-workload-authz-grant.md`, `decision-log.md`, `notes/oauth-slots.md`
- Not yet studied: `notes/request-shapes.html`, `notes/client-models.html`

## Known upstream drift
- `decision-log.md` D15 is a placeholder ("WIP, see PR description").
- Decision log O2/O3 still open, but the current draft has moved past them (no WIMSE/SPIFFE section; claim names left to deployments).
- Decision log mentions -00/-01 revisions; the draft text no longer shows them.

## Refresh procedure
1. `git clone` upstream into an empty temp dir, note `git rev-parse HEAD`.
2. Diff the three files above against the previous pinned commit.
3. Update memory, then graph, then this file.
