# Staging: imap-guard — the proxy that didn't exist

Short post. The story is the gap: LLM agents need to read mailboxes without being able to
destroy them, and nothing simple existed — full mail servers offer ACLs, but there was no
lightweight IMAP proxy with them. Built in four days for the email integration in my
own agent setup.

## Material

- Why: giving an LLM agent IMAP credentials means trusting it with EXPUNGE. Wanted a
  fail-open pass-through proxy that makes destructive operations impossible at the
  protocol layer — "security through architecture, not prompts."
- The technically interesting bits (each earned its place):
  - Literal handling as a security boundary: `SELECT {5}\r\nTrash` defeats naive string
    matching; the proxy parses literals (incl. LITERAL+), emits its own continuation,
    reads exactly n bytes, rewrites the command as a quoted string before forwarding;
    oversized literals are drained so the connection doesn't desync.
  - COMPRESS DEFLATE (RFC 4978) negotiated mid-connection: tracking the in-flight tag
    across two relay goroutines, swapping flate reader/writers onto four stream
    directions only on upstream acceptance.
  - deny-unless-copied: parses COPYUID responses, tracks UID sets per connection, and
    permits EXPUNGE only when every affected UID was demonstrably copied elsewhere first.
- Hygiene worth mentioning briefly: 2:1 test-to-source ratio with a mock IMAP server,
  race-enabled CI with SHA-pinned actions, credential redaction in logs, /healthz and
  /metrics. Go, stdlib + yaml only. 1,634 source lines.
- The roadmap doc candidly lists v0.1 bugs and their fixes (e.g. capability stripping
  originally ran over message bodies).

## Angle

- "Small tools for the agent era": the gap analysis matters more than the line count.
  Four days, done, in daily use.
