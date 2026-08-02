# Staging: eqprop — implementing research from outside my field

HOLD: best written once the board is fabbed and there's an ending (works / doesn't and
why). Staging can grow in the meantime.

## The claim

Not novelty — implementation. Equilibrium propagation is active research (Kendall et al.
2020, Laborieux et al. 2021, with SPICE sims and simple demos in the literature); the
post is "I can read this and build it," in a field (analog ML) I don't work in.

## Material

- The idea: a resistive network where Kirchhoff's laws do the forward pass and the
  gradient falls out of comparing two nudged equilibria — dC/dG = (dv_pos² − dv_neg²)/4β,
  symmetric nudging to cancel finite-β bias.
- Implementation: topology-independent KCL equilibrium solver (Newton via scipy, seeded
  from the linear-network solution because starting at V_MID lands in a degenerate
  region); weights quantized through the real MCP4251 256-tap ladder; validated against
  ngspice within 1%, twice (idealized + full board model with op-amp buffers, mux
  on-resistance, Howland current pumps).
- The best story beat: XOR was mathematically impossible in the first design — a single
  V_MID bias makes the network an odd function, and XOR's (0,1)/(1,0) are negatives in
  centered coordinates. Verified numerically over 1000+ random weight configs before
  finding the cause; fixed with asymmetric V_LOW/V_HIGH bias (one more chip).
- Honest state: simulation validated; KiCad schematic complete; PCB routing in progress
  (as of 2026-08); no firmware yet. Known issue: EqProp gradients for pattern (1,0) at
  seed 42 disagree with finite-difference by >50% on some weights — solver branch
  sensitivity, unresolved.

## To add when they exist

- Fab dates, board bring-up, whether the physical network learns XOR.
