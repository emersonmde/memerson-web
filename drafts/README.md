# Drafts

Working space for blog posts. Everything here is tracked in git for version history but
none of it renders on the site — only `src/content/blog/**` does. Publishing is a
deliberate act: the finished draft moves to `src/content/blog/<slug>/index.md`.

## The process

Each post lives in its own directory and moves through four files:

1. **`staging.md`** — the dump. Every detail recorded, no matter how small or seemingly
   irrelevant. No structure required. Nothing is written until this is rich.
2. **`outline.md`** — the structure, agreed before any prose. Section-by-section, each
   with a one-line statement of what it must accomplish.
3. **`draft.md`** — the working draft. Sections are written in separate, scoped
   prompts/iterations — one section at a time, on topic, against the outline.
4. **`review.md`** — open questions and notes from read-throughs. A review pass checks
   each section against `staging.md` for what was *left out*, not just what's there.

`VOICE.md` is the style contract shared by every post. Every writing prompt starts from
it. When a draft teaches something new about the voice, the lesson goes into VOICE.md,
not just the draft.

Gates before publishing: a full read-aloud pass, a check against VOICE.md, a spell/grammar
pass (the older posts shipped typos; new ones don't), and a final look at staging.md for
orphaned material worth keeping or cutting deliberately.
