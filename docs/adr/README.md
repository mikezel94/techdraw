# Architecture Decision Records (ADR)

This folder records the significant decisions made on this project — the
*what*, the *why*, and the trade-offs — so they survive across sessions and
contributors. Most decisions here are made (or proposed) by AI agents working
on the codebase.

## When to write an ADR

Write one whenever a decision would be costly to reverse, easy to disagree
with later, or non-obvious to someone reading the code. In particular, an AI
agent **must** record a decision when it:

- Chooses or replaces a library, framework, tool, or external service.
- Settles an architectural or data-model question (state shape, module
  boundaries, coordinate systems, rendering strategy).
- Adopts a project-wide convention or workflow (testing, naming, ADRs
  themselves).
- Picks one approach over reasonable alternatives to satisfy a user request.

Do **not** write ADRs for routine implementation detail that the code already
explains (a variable name, a small refactor, a bug fix). If the diff and its
commit message are enough, no ADR is needed.

## Conventions

- One decision per file, named `NNNN-kebab-case-title.md` with a zero-padded,
  monotonically increasing number (`0001`, `0002`, …). Never renumber or
  reuse a number.
- ADRs are immutable once accepted. To change a decision, write a **new** ADR
  that supersedes the old one, flip the old one's status to `Superseded`, and
  link the two both ways.
- Keep entries short — a screenful at most. Prefer bullet points over prose.
- Add every new ADR to the [Index](#index) below and to the table in
  `AGENTS.md` if one exists there.

## Status lifecycle

`Proposed` → `Accepted` → (`Deprecated` | `Superseded by NNNN`)

## Template

```markdown
# NNNN. Short title

- **Status:** Proposed | Accepted | Deprecated | Superseded by NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** AI agent (and any humans involved)

## Context
What situation or problem forced a decision? What constraints apply?

## Decision
The chosen approach, stated directly. Bullet the key points.

## Alternatives considered
- Option B — why it was rejected.
- Option C — why it was rejected.

## Consequences
What follows from this decision — benefits, costs, and new constraints.
```

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted | 2026-08-02 |
| [0002](./0002-e2e-testing-with-canvas-pixel-probes.md) | E2E testing with canvas pixel probes | Accepted | 2026-08-02 |
| [0003](./0003-arrow-bend-scalar.md) | User-adjustable arrow bend as a scalar offset | Accepted | 2026-08-02 |
