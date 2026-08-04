# Voice

The working style guide for every post — guidelines, not law. This file started as
Claude's derivation from brief direction and the existing posts (1BRC parts 1–2, A Brave
Neo World) minus the parts being retired; it has since been refined against a study of
writers whose style holds up without gimmicks (Dan Luu, Julia Evans, Brandur Leach,
Simon Willison, Hillel Wayne; Paul Graham, Joel Spolsky, patio11, tef, Thorsten Ball;
Craig Mod, Robin Sloan, Maciej Cegłowski, Maggie Appleton, Derek Sivers). It still
almost certainly doesn't fully capture the voice Matthew is after; when his edits or
feedback on a draft contradict something here, the feedback wins and this file gets
updated to match. Audience: engineers, including future employers and coworkers. The
posts are a portfolio as much as a journal.

One meta-rule, from Dan Luu: don't copy a voice wholesale. What transfers from good
writers is mechanics — receipts, grounded jargon, precise hedging, real artifacts. The
register has to be native, and a voice is distinctive because of what its writer has
actually witnessed and measured, not because of verbal mannerisms.

## What the writing is

- **Narrative paragraphs.** Posts tell the story of the work in the order it happened:
  what I set out to do, what I tried, what happened, what I learned. The arc carries the
  reader; headers mark chapters of the story, not a reference manual.
- **First person, active voice.** "I mapped the file and split it across threads," never
  "the file was mapped." The subject of most sentences is I, the system, or the tool —
  something that acts.
- **Honest about failure and ignorance.** The existing posts' best quality. Wrong
  assumptions, dead ends, and "I didn't know how to do this" stay in — they are the story.
  Confidence comes from owning the mistake and showing the correction, not from omitting
  it. Frame it as what was learned, not as confession.
- **Receipts over adjectives.** Exact numbers, before/after timings, real command output,
  exact API names, links to the commit or the primary source (official docs, papers,
  RFCs — not aggregators). A measured number is the strongest credibility signal in this
  genre; "much faster" is the weakest. A code block or output dump that could not be
  reconstructed from memory is proof the work happened.
- **Concise and straightforward.** Say the thing once, plainly. If a sentence works
  without a word, drop the word. Short sentences are allowed to just be short.
- **Minimal terms of art.** Prefer the plain phrase where one exists. When a technical
  term is genuinely needed, use it correctly, at first use, inside the concrete situation
  that needs it — one clause of grounding, the way the 1BRC post introduced SIMD. Never
  stack jargon to signal expertise.
- **The spoken-sentence test.** Don't let a sentence through unless it's the way you'd
  say it to a colleague. Any word you'd feel silly saying aloud gets cut.
- **Write for one person.** A specific reader — a coworker, or my past self before the
  project started — sets the explanation level. This kills both condescension and
  throat-clearing at once.

## Openings and structure

- **Open with the concrete.** A fact, a scene, a question, or the claim itself — within
  two sentences. Never "In this post I will discuss." The best openings studied were
  three flat factual sentences that *were* the argument (Spolsky on Netscape) or a scene
  the reader is dropped into (Hillel Wayne). The roadmap is the headers' job, not the
  first paragraph's.
- **Headers are the actual outline.** A reader skimming only the headers should get the
  shape of the story or argument. State what the section covers: "Trying SIMD", "The
  results", "Starting over".
- **Land abstractions on objects.** Any general or reflective claim touches something
  with mass within a sentence or two — a tool, a timing, a piece of output. If a
  paragraph has no noun you could photograph or paste into a terminal, revise it.
- **One metaphor, developed — not many, scattered.** If a piece needs an analogy, pick
  the load-bearing one and stay inside it. A second metaphor has to fight its way in.
  Metaphors do argumentative work or they go.
- **Let the anecdote carry the argument.** If the story is chosen well, the lesson
  crystallizes on its own. The paragraph that explains what the story meant is usually
  the one to cut.
- **End modestly.** State plainly what works, what doesn't, and what's still unknown.
  No mandatory redemptive ending, no grand call to action. Conceding the piece's biggest
  limitation at the end is the cheapest credibility available.

## Rhythm

- **Vary sentence length deliberately.** Long evidence-carrying sentences broken by a
  short punch or a question. This is the one mechanic every studied writer shares.
- **Short declaratives are load-bearing beams — budget one or two per post,** placed
  where the argument actually turns. An aphorism every paragraph reads as fortune
  cookies.
- **The dramatic one-sentence paragraph is a single-use tool per post,** reserved for
  material that has earned the weight. As a repeated beat it's a laugh track.

## Hedging: precisely, not habitually

Cut reflexive hedges — "pretty", "just", "basically", "sort of" — unless the hedge is
the point. But genuine uncertainty gets flagged explicitly, at the exact spot it lives:
"I suspect", "I haven't verified this", "I don't know why this works." The pattern is a
confident spine with precisely-placed doubt. Admitting a specific gap increases trust
(Julia Evans' "I'm not sure what that means" is her credibility mechanism); sounding
vaguely unsure about everything destroys it. Never perform authority the writing hasn't
earned.

## Opinion posts

Most posts are narratives of work; some are arguments. For those:

- **Steelman before striking.** State the conventional view so fairly its adherents
  would nod, concede what it gets right and where it works, then show the failure mode.
  Resolve to a tradeoff, not an inverted absolute — "some redundancy is healthy, some
  isn't" beats "DRY is wrong." Absolutes age badly.
- **Voice the reader's objection once,** at the moment they're having it, and answer it.
  More than once becomes a device.
- **Pick claim-first or story-first by claim temperature.** Claim-first when the claim
  is defensible on arrival and the essay is the evidence. Story-first when the claim is
  contentious and the reader needs walking to it.
- **An opinion with no number, command, or dated event in it isn't done.** Opinions are
  earned with proper nouns.
- **Disclose conflicts.** If I have a stake in the conclusion, say so early.

## What is retired from the old posts

- **Joke and reference headers.** No "A wild SIMD appears", "Make It So", "Send It",
  "This Is The Way". Headers state what the section covers.
- **Filler enthusiasm.** No "Just what I was looking for!", "Sounds like a win-win to
  me", "Ready to be blown away". Interest is shown by the detail chosen, not exclaimed.
- **Typos.** The old posts shipped several. Every draft gets a spelling and grammar pass
  before publishing.

## Gimmicks never to use

The Medium-era habits that aged badly, plus the standing rules:

- Stage directions telling the reader what to feel: "Here's the thing.", "Let that sink
  in.", "Read that again."
- Meta-commentary on the piece itself: "I know what you're thinking", "stay with me
  here", "but more on that later".
- Line breaks or bold-faced whole sentences for fake profundity or emphasis.
- Listicle scaffolding on essays; numbered structure substituting for argument.
- Coining a Framework™ for something that needed one plain paragraph.
- The confessional cold open engineered for engagement ("I quit my six-figure job…").
- Marketing buzzwords, hype, AI-slop phrasing ("delve", "dive deep", "game-changer",
  "seamless", "leverage" as a verb).
- Em-dash chains or fragment stacks standing in for sentences.
- Clickbait titles. Titles are plain questions or plain claims: "Why is DNS still hard
  to learn?", not "DNS Is Broken and Nobody Will Tell You".
- Overselling scope or completeness — state plainly what works and what doesn't. The
  reader may open the repo.
- Crediting or qualifying tools ("written by hand", "with Claude Code") unless the
  tooling *is* the subject of the post.

Personality survives all this in small, dry doses: one parenthetical aside or one
concrete joke per section at most, and only where deleting it would cost the argument
something. One dry joke defuses the pretension of a big claim better than any hedge.

## Calibration examples

Old: "Ready to be blown away, I ran the program and.. it was about the same."
New: "I ran the program expecting a large improvement. It finished in 63 seconds — about
the same."

Old header: "A wild SIMD appears" → New header: "Trying SIMD"

Blanket hedge (cut): "This is probably sort of wrong, but…"
Precise hedge (keep): "I suspect the allocator is the bottleneck here, but I haven't
profiled it."

Told feeling (cut): "The results were mind-blowing. Let that sink in."
Shown feeling (keep): "It finished in 4.2 seconds. The previous best was 63."

*(Add examples here as drafts teach us more.)*
