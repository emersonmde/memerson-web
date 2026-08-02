# Staging: I taped out a chip in a language I can't write

vilya + warp-core: directing Claude Code through a domain I'd never worked in — Verilog,
RTL verification, the fab flow — to real results. This post is the exception to the
no-tool-attribution rule: the direction *is* the subject.

## The arc

- 2019: implemented Keccak by hand in C from the whitepaper/RFC (libcrypt — which, notably,
  doesn't even mention keccak in its README), plus AES and PRNGs. Pre-LLM, proud of it.
- 2026: wanted the same algorithm in hardware. Directed Claude Code through vilya —
  SHA-3-256, combinational Keccak-f[1600] round, one round per clock — to an actual tape
  out on Tiny Tapeout IHP 26a (SG13G2 130nm). GDS flow: two failures (state register
  didn't fit 2x2 tiles → bumped to 6x2; placement density to 65%), then a 1h37m passing
  run including precheck and gate-level tests. 4 commits, one afternoon.
- Then pushed further: could it do CRYSTALS-Kyber? warp-core — full ML-KEM-768 (FIPS 203)
  datapath from primitives: Barrett reduction (V=20158 floor vs reference's ceiling, kept
  the datapath unsigned; verified over all 2^16 inputs), NTT ping-pong dual-RAM engine
  (911 cycles), basemul with 3 Barrett reductions instead of 5 (proved the 25-bit
  accumulator stays in Barrett's safe range), compress via the Barrett multiplier's
  quotient to avoid a divider, on-chip Keccak for autonomous KeyGen/Encaps. Verified
  bit-exact against NIST ACVP vectors (25 keyGen + 25 encaps + 10 decaps), 117 cocotb
  tests. 18 commits, 10 days. Simulation-only — no synthesis; be honest about that.

## Angles

- What "directing" meant concretely when I couldn't review the RTL line-by-line:
  verification as the trust boundary — reference models in Python as oracle, NIST's own
  vectors, testbench-to-RTL ratios. You don't need to write the language to demand and
  check evidence.
- What I set up myself (simulation config) vs what Claude did.
- Honest limits: warp-core's Artix-7 numbers are paper estimates; vilya's silicon comes
  back from the shuttle — when? (Add the date and, later, whether it worked.)
