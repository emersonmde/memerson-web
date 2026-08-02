# Staging: Building memerson.com with Claude Code

The process post: how I actually work with Claude Code, extracted from ~2 weeks of real
session transcripts building this site. Tips and patterns that transfer, backed by
transcript evidence rather than invented examples.

## Primary source

Session transcripts (JSONL) live in `~/.claude/projects/-Users-matthew-workspace-memerson-web/`.
Mining them is the first staging task — see the session prompt in this repo's history /
drafts README.

## Seeds (from memory, to verify against transcripts)

- Alignment mechanisms that worked: CLAUDE.md as a constraints file (hard constraints
  section, "read the docs first", gotchas list); docs/ as design source of record;
  the imported-design rule ("the design is imported — not invented here") keeping visual
  drift at zero; verification gates (check at 0, tests green) as the definition of done.
- The remote review loop: reviewing from my phone, Claude pushing to deploy via Workers
  Builds, screenshots via CDP read back into the session.
- Photo pipeline built to be idempotent-by-skipping so re-runs are free — a design
  pattern chosen partly because an LLM re-running commands must be safe.
- The iOS compositor debugging saga: real-device bugs no simulator reproduced; how the
  division of labor worked (Claude hypothesizing, me testing on hardware).
- Documentation culture: every non-obvious decision written down with rationale
  (ARCHITECTURE.md, UI-DESIGN.md, TESTING.md, PERFORMANCE.md) so future sessions
  don't relitigate.
- Memory files carrying preferences across sessions.

## Open questions

- Which patterns are genuinely transferable vs specific to a static-site project?
- Honest costs: where did sessions go wrong, what did misalignment look like, what did
  I have to redo?
