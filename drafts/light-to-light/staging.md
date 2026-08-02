# Staging: Light to light — what actually happens when you watch a video

The depth post: written for the curious non-technical or semi-technical reader who
thinks "it's binary, travels as electrical signals between computers, reconstructs
data" — which is true and a massive simplification. One concrete thread (watching a
YouTube video) pulled end to end, going as deep as each layer deserves. Inspired by
explaining this to a non-technical friend, and by a paper/article tracing a packet
through the Linux kernel (find and cite it — see open questions).

Working title/slug "light to light": the journey starts as photons reflecting off a
subject and ends as photons leaving a screen into an eye; everything between is the
post. Title and slug are open.

## The thread, roughly in order (from the original riff)

- Light reflected/generated on a subject; CMOS sensors turning light levels into
  electric impulses; that pattern saved into a file in a particular arrangement.
- The file edited/combined/altered during editing; exported — rearranged and
  compressed into a different format.
- Bits traveling over a network to a server: OS data structures queueing data,
  talking to the hardware; encapsulation at multiple levels in different protocols
  handling encryption, compression, congestion, routing, error correction.
- Server side: transcoding into different formats and compression ladders; copies
  pushed to edge servers around the world.
- The reverse process: a frame traveling back down to the client and up to the screen.
- The breadth underneath: hundreds of standards and protocols; physical transmission
  media from PCIe to WiFi to fiber to copper; the math developed over hundreds of
  years; material science, optics, silicon, hardware, algorithms.

## Angle / what the post argues

- Not a tutorial and not a survey — one specific everyday act, traced honestly, to
  make the point that the simplified mental model hides staggering depth.
- Audience calibration is the hard problem: the reader who needs this post can't
  follow a DCT diagram. Each layer gets the plain-phrase treatment (VOICE.md), one
  clause of grounding per term of art, depth signaled rather than exhausted.
- The awe is the payload: the pipeline works billions of times a day and nobody can
  hold all of it in their head. That, not any single layer, is the thesis.

## Material to gather

- The packet-tracing paper/article that inspired this (identify the actual source).
- Layer-by-layer fact-checking: CMOS photodiode → ADC chain, container vs codec,
  what an export actually rearranges, TCP/QUIC congestion + TLS + FEC specifics,
  CDN edge distribution, adaptive bitrate ladders, display path back out
  (decode → compositor → panel → photons).
- Numbers that carry awe honestly (per VOICE.md, concrete over general): how many
  standards bodies/RFCs touch one video view; how many format conversions one frame
  undergoes camera-to-screen; timescales (a frame's round trip vs. the centuries of
  math underneath it).
- Candidate primary sources: RFCs, codec specs (H.264/AV1), CMOS sensor literature,
  Shannon; link primary sources, not aggregators.

## Open questions

- Find the inspiration source: "tracing a packet through the Linux kernel" — a known
  genre (e.g. kernel datapath walkthroughs); which one was it, and does the post cite
  it or just credit the genre?
- How deep is too deep? One paragraph per layer with a "and this alone is a career"
  gesture, or pick 2–3 layers to actually descend into and summarize the rest?
- Does the YouTube framing survive, or generalize to "a video call" / "this page you
  are reading"? (YouTube adds the CDN/transcode ladder, which is some of the best
  material — probably keep.)
- Where does this sit relative to the portfolio audience (engineers)? It's the most
  general-audience post in the room — is that a feature (range) or a mismatch?
- Series potential: each layer could be its own deep post later; does this post
  deliberately leave hooks?
