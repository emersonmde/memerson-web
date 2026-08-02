# Staging: Three kernels — before, during, and after GenAI

The flagship. Same problem domain three times, with three levels of AI involvement, very
different outcomes. A controlled(-ish) study of how AI changed my development process.

## The three projects

- **xyos (~2022):** x86 kernel, hand-written following the osdev wiki and documentation.
  No AI. (Pull details: what it reached, how long it took, what stopped it.)
- **daedalus (2024–2026):** AArch64 kernel for Raspberry Pi 4, built in partnership with
  Claude Code — I reviewed and directed heavily. Reached: hand-built MMU page tables,
  GIC-400, GENET Ethernet driver with DMA descriptor rings, from-scratch packet path
  (sk_buffs, ARP, sockets), kexec-over-HTTP network boot dev loop, 104 tests running in
  QEMU in CI (CI compiles QEMU 9.2 from source because Ubuntu's lacks raspi4b).
- **talos (2026, ~6 weeks):** fully autonomous experiment — GPT 5.5 in an agentic loop I
  built, with agents for task breakdown, implementation, and code review, run on cron.
  My work was the lab: APIs to swap the PXE boot image, toggle power on a PoE port, and
  read serial logs; the goal prompt ("build a POSIX-compliant Pi 5 OS") and minimal
  direction after. Reached SMP scheduling with per-core runqueues, EL0 + syscalls with
  descriptor tables, initramfs VFS, ELF loading, shell — on real Pi 5 hardware. Stalled
  on an RP1 southbridge address-decode wall (translated MACB_MID read at 0x1f001000fc
  returning 0xdeaddead); last month of commits was the loop trying to build a
  discriminator for it. 1,871 commits in 7 weeks; ~168k lines.

## Numbers to gather

- Wall-clock and calendar time for each; commit counts; what each reached on real hardware.
- Talos: cost of the run (tokens/$), agent roles, evidence protocol (hardware claims
  require serial + TFTP capture; agent output treated as evidence, not authority).

## Angles

- The interesting variable isn't code volume, it's *what my job was*: author → reviewer/
  architect → lab builder and evaluator.
- Honest failure analysis: talos produced 26k-line files and diagnostic ceremony no human
  would accept — throughput without taste. Where autonomy broke down and why the harness
  mattered more than the model.
- Amazon's "GenAI Fluency" competency exists now; this is what the skill actually looks
  like in practice (without naming it as an interview pitch in the post).

## Related

- Homepage framing settled 2026-08: talos presented as the experiment, not the kernel.
