# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** AI agent

## Context

AI agents work on this codebase across many independent sessions. Each session
makes decisions — library choices, architectural trade-offs, conventions — but
without a durable record the rationale is lost when the session ends. Later
sessions (human or AI) then re-derive, revisit, or silently contradict earlier
decisions because nothing explains *why* the code is the way it is.

## Decision

- Maintain Architecture Decision Records in `docs/adr/`, one Markdown file per
  decision, using the lightweight Nygard-style format (Context / Decision /
  Consequences).
- Number files sequentially (`NNNN-title.md`); treat them as immutable once
  accepted and supersede rather than edit.
- AI agents record significant decisions as they make them (see "When to write
  an ADR" in `docs/adr/README.md`).
- `AGENTS.md` points every agent to this folder so the convention is discovered
  at the start of each session.

## Alternatives considered

- Commit messages only — rejected: they capture *what* changed but are scattered
  across history and don't surface the *why* of a standing decision.
- A single `DECISIONS.md` log — rejected: one growing file is harder to navigate
  and to supersede cleanly than one file per decision.
- No record — rejected: this is the problem being solved.

## Consequences

- Durable, discoverable rationale that survives across sessions and contributors.
- Small overhead per decision; kept in check by writing ADRs only for
  significant, hard-to-reverse, or non-obvious choices (routine code needs none).
- The folder must stay curated: superseded ADRs are linked, not deleted, and the
  index in `README.md` is kept current.
