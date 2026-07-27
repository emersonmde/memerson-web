# Design source — "Neon District"

The mockups the site's visual identity was built from, pulled 2026-07-26 from the Claude
Design project **"Personal website design system"**
(`claude.ai/design/p/2358d801-f30f-4f0f-84a7-59d8baee971e`).

Kept here as the **source of record**. When the implementation and these files disagree,
these files are what was designed and [../UI-DESIGN.md](../UI-DESIGN.md) §8 explains why
the implementation differs.

| File                               | What it is                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `Neon District Mockups.dc.html`    | **The implemented design.** 6a home, 6b photos, 6c log, 6d post, 6e–6h system |
| `Signal - Design Language.dc.html` | An earlier direction. Not implemented, but still load-bearing — see below     |
| `Signal - Pages.dc.html`           | Page designs from that earlier direction                                      |
| `support.js`                       | `dc-runtime` — the generic viewer harness, not design content                 |

## These do not render standalone

`support.js` expects `window.React` and `window.ReactDOM`, which the Claude Design app
supplies and this file does not. Opening the HTML directly gets you a blank page and a
`dc-runtime: window.React is not available yet` error. That is expected — don't spend time
debugging it.

To actually look at the mockups, open the project in Claude Design. To read them, the HTML
is plain enough: `<x-dc>` wraps the markup, `{{ … }}` are template bindings, `<sc-for>` and
`<sc-if>` are loop and conditional elements, and the `<script type="text/x-dc">` block at
the bottom holds the sample data and interaction logic.

## Why "Signal" is kept even though it was not implemented

It was an earlier, different direction — grimier, with rain and grain — and Neon District
superseded it. But it is **not dead reference**: decisions made there survived into the
implemented design, and looking only at the Neon District file loses the reasoning.

The clearest case is the lightbox glow. Signal 4c states it outright:

> _"ambient bloom is a blurred copy of the photo itself, so it works on real images"_

That is why the lightbox does not extract or store a colour — the glow **is** the
photograph, blurred behind itself. Reading only the Neon District mockup, where the photos
are placeholder gradients, it looks like the bloom might be a sampled palette colour. It is
not, and building it that way would have been wrong.

Both files also define the same **five photo accents** (amber / green / cyan / blue /
magenta), which are the palette any per-photo colour classification must snap to. See
MILESTONES M4.

## The parts worth reading

Two passages in the mockup drove implementation decisions and are quoted in
[../UI-DESIGN.md](../UI-DESIGN.md):

- The **motion law** — "Energy travels, objects hold still" (§6e).
- **"Rain stayed behind with the grunge cut; it read as weather, and this world is vacuum,
  not street"** (§6, intro). This is why there is a star field and no rain, and it is what
  settled the footer's location Easter egg on a crater rather than a city.
