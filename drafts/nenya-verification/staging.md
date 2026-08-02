# Staging: nenya — trusting a distributed system you didn't fully write

Not a project tour — the angle is verification culture: how to make an AI-assisted
distributed system trustworthy. The design is mine; much of the 2026 implementation was
AI-assisted; the evidence stack is what makes both defensible.

## Material

- The design: coordination-free — no Redis, no consensus, no CRDTs. Nodes gossip
  per-scope accepted rates (Chitchat/scuttlebutt over UDP); each node's control loop
  steers its own token bucket toward the cluster limit. Soft limits, bounded overshoot,
  stated honestly in the README (not for billing/security enforcement).
- Engines behind a trait: PID (anti-windup, adaptive window, adaptive burst) and a
  Bayesian engine — per-(peer,scope) scalar Kalman filters (Welch & Bishop eqs 1.9–1.12),
  staleness as growing variance rather than decay, admission via sum of Gaussians.
- Clock-skew-free staleness: peer wall-clock timestamps used only as opaque change
  markers; age measured on the local monotonic clock at receipt.
- Two-tier scheme for per-user cardinality: compact tail bucket enforcing the full limit
  locally; promotion to a gossip-published hot limiter requires evidence
  (local + Σ peers ≥ 0.5 × limit with nonzero peer evidence); demotion hysteresis;
  per-node gossip budget with logged eviction; worst-case bound independent of cluster
  size. Count-min sketch evaluated and rejected with data.
- The evidence stack: deterministic in-process cluster simulator (virtual clock, seeded
  RNG, partitions/jitter/loss, Zipf populations, byte-identical replays); every constant
  cites the sweep that produced it; a *published negative result* (gain scheduling didn't
  help); proptest; stateright model checking of the aggregation invariants and the tier
  state machine; real-UDP wire test at 10k scopes; 1M-scope benchmarks.
- History: 2024 single-node PID toy (29 commits) → dormant → 2026 rewrite (36 commits).
  Test-to-source ratio ~0.6. Known gap: gossip auth env var reserved but unenforced.

## Angle

- Thesis candidate: in the AI era the scarce skill isn't writing the code, it's
  constructing the evidence that lets you trust it. Simulator-first development as the
  distributed-systems version of test-first.
