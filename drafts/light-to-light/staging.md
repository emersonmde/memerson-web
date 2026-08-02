# Staging: Light to light — what actually happens when you watch a video

The depth post: written for the curious non-technical or semi-technical reader who
thinks "it's binary, travels as electrical signals between computers, reconstructs
data" — which is true and a massive simplification. One concrete thread (watching a
YouTube video) pulled end to end, going as deep as each layer deserves. Inspired by
explaining this to a non-technical friend, and by Alexander Stephan and Lars Wüstrich,
"The Path of a Packet Through the Linux Kernel" (TUM, Seminar ITM WS 23,
doi 10.2313/NET-2024-04-1_16,
https://www.net.in.tum.de/fileadmin/TUM/NET/NET-2024-04-1/NET-2024-04-1_16.pdf) —
a trace of the TCP/IPv4 and UDP/IPv4 stack in Linux. The post does for the whole
camera-to-eye pipeline what that paper does for one kernel traversal.

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
- The abstraction point cuts both ways: even highly technical software engineers work
  with most of this stack abstracted away. The post isn't condescending to the
  non-technical reader — nobody holds all of it, including the professionals.
- The scale of the achievement is part of the thesis: sending that one YouTube video
  is an incredible feat of human ingenuity, built by thousands of people over
  hundreds of years — the math, the materials, the protocols all accumulated effort.
- Audience calibration is the hard problem: the reader who needs this post can't
  follow a DCT diagram. Each layer gets the plain-phrase treatment (VOICE.md), one
  clause of grounding per term of art, depth signaled rather than exhausted.
- The awe is the payload: the pipeline works billions of times a day and nobody can
  hold all of it in their head. That, not any single layer, is the thesis.

## Material to gather

- Re-read the Stephan/Wüstrich paper for the kernel-path section: it covers the sk_buff
  journey through the stack and is the model for the "one layer, honestly traced" move.
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

- How deep is too deep? One paragraph per layer with a "and this alone is a career"
  gesture, or pick 2–3 layers to actually descend into and summarize the rest?
- Does the YouTube framing survive, or generalize to "a video call" / "this page you
  are reading"? (YouTube adds the CDN/transcode ladder, which is some of the best
  material — probably keep.)
- Where does this sit relative to the portfolio audience (engineers)? It's the most
  general-audience post in the room — is that a feature (range) or a mismatch?
- Series potential: each layer could be its own deep post later; does this post
  deliberately leave hooks?
