# Voice

The working style guide for every post — guidelines, not law. This file is a first
draft: Claude derived it from brief direction and the existing posts (1BRC parts 1–2,
A Brave Neo World) minus the parts being retired, so it almost certainly doesn't fully
capture the voice Matthew is after yet. Expect it to be modified and corrected as
posts move through the pipeline; when his edits or feedback on a draft contradict
something here, the feedback wins and this file gets updated to match. Audience:
engineers, including future employers and coworkers. The posts are a portfolio as
much as a journal.

## What the writing is

- **Narrative paragraphs.** Posts tell the story of the work in the order it happened:
  what I set out to do, what I tried, what happened, what I learned. The arc carries the
  reader; headers mark chapters of the story, not a reference manual.
- **First person, active voice.** "I mapped the file and split it across threads," never
  "the file was mapped." The subject of most sentences is I, the system, or the tool —
  something that acts.
- **Honest about failure and ignorance.** The existing posts' best quality. Wrong
  assumptions, dead ends, and "I didn't know how to do this" stay in — they are the story.
  Confidence comes from owning the mistake and showing the correction, not from omitting it.
- **Concrete over general.** Numbers, before/after timings, exact API names, links to
  primary sources (official docs, papers, RFCs — not aggregators). A claim that can carry
  a measurement does.
- **Concise and straightforward.** Say the thing once, plainly. If a sentence works
  without a word, drop the word. Short sentences are allowed to just be short.
- **Minimal terms of art.** Prefer the plain phrase where one exists. When a technical
  term is genuinely needed, use it correctly and — if the reader may not know it — spend
  one clause grounding it, the way the 1BRC post introduced SIMD. Never stack jargon to
  signal expertise.

## What is retired from the old posts

- **Joke and reference headers.** No "A wild SIMD appears", "Make It So", "Send It",
  "This Is The Way". Headers state what the section covers: "Trying SIMD", "The results",
  "Starting over".
- **Filler enthusiasm.** No "Just what I was looking for!", "Sounds like a win-win to
  me", "Ready to be blown away". Interest is shown by the detail chosen, not exclaimed.
- **Hedge words.** "Pretty", "just", "basically", "sort of" — cut unless the hedge is the
  point.
- **Typos.** The old posts shipped several. Every draft gets a spelling and grammar pass
  before publishing.

## Standing rules (current best guess — revisable like everything here)

- No marketing buzzwords, hype, or AI-slop phrasing ("delve", "dive deep", "game-changer",
  "seamless", "leverage" as a verb).
- No em-dash chains or fragment stacks standing in for sentences.
- Never oversell scope or completeness — state plainly what works and what doesn't. The
  reader may open the repo.
- Tools are not credited or qualified ("written by hand", "with Claude Code") unless the
  tooling *is* the subject of the post.

## Calibration examples

Old: "Ready to be blown away, I ran the program and.. it was about the same."
New: "I ran the program expecting a large improvement. It finished in 63 seconds — about
the same."

Old header: "A wild SIMD appears" → New header: "Trying SIMD"

*(Add examples here as drafts teach us more.)*
