# Design source — "Neon District"

The mockups the site's visual identity was built from, pulled 2026-07-26 from the Claude
Design project **"Personal website design system"**
(`claude.ai/design/p/2358d801-f30f-4f0f-84a7-59d8baee971e`).

Kept here as the **source of record for what was designed**. When these files and the
implementation disagree, [../UI-DESIGN.md](../UI-DESIGN.md) §8 explains why.

## Two Claude Design projects, and which to use

| Project                                                                                                         | Type          | What it holds                                     |
| --------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------- |
| [`2358d801…`](https://claude.ai/design/p/2358d801-f30f-4f0f-84a7-59d8baee971e) "Personal website design system" | regular       | The original mockups below. History.              |
| [`27f0bafb…`](https://claude.ai/design/p/27f0bafb-f442-4a7e-b0ae-015e78874b07) "Neon District — memerson.com"   | design system | **The implementation as it stands.** Design here. |

Despite its name the first is `PROJECT_TYPE_PROJECT`, and that type is **immutable at
creation** — it can never gain the design-system behaviour where new work inherits the
components and is checked against them. Hence the second, created 2026-07-27.

**Design against the second one.** It carries tokens, the contact sheet and lightbox as
built with real photographs, the photo metadata with real shoots, and every page — home,
about, log index, log post, 404. Regenerate and re-push it with `npm run design:bundle`
(see [../ARCHITECTURE.md](../ARCHITECTURE.md) §5.9) whenever the site moves, so it never
drifts the way these mockups did.

The first project stays worth keeping: it holds the Signal direction, whose reasoning is
still load-bearing — see below.

## The round trip

1. `npm run design:bundle`, then push with the `DesignSync` tool → the design-system
   project reflects what is actually built.
2. Design in Claude Design, in a normal project that inherits that system.
3. **Export → hand off to Claude Code.** Drop the exported HTML in this folder alongside
   the files below, and it becomes the spec for implementation.

Anything exported here is what was designed, not what exists. Keep that distinction — it is
the whole reason this folder and the design-system project are separate things.

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
