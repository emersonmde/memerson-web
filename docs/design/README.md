# Design source — "Neon District"

The mockups the site's visual identity was built from, pulled 2026-07-26 from the Claude
Design project **"Personal website design system"**
(`claude.ai/design/p/2358d801-f30f-4f0f-84a7-59d8baee971e`).

Kept here as the **source of record**. When the implementation and these files disagree,
these files are what was designed and [../UI-DESIGN.md](../UI-DESIGN.md) §8 explains why
the implementation differs.

| File                            | What it is                                                     |
| ------------------------------- | -------------------------------------------------------------- |
| `Neon District Mockups.dc.html` | The mockups: 6a home, 6b photos, 6c log, 6d post, 6e–6h system |
| `support.js`                    | `dc-runtime` — the generic viewer harness, not design content  |

## These do not render standalone

`support.js` expects `window.React` and `window.ReactDOM`, which the Claude Design app
supplies and this file does not. Opening the HTML directly gets you a blank page and a
`dc-runtime: window.React is not available yet` error. That is expected — don't spend time
debugging it.

To actually look at the mockups, open the project in Claude Design. To read them, the HTML
is plain enough: `<x-dc>` wraps the markup, `{{ … }}` are template bindings, `<sc-for>` and
`<sc-if>` are loop and conditional elements, and the `<script type="text/x-dc">` block at
the bottom holds the sample data and interaction logic.

## What was NOT imported

The project also contains `Signal - Design Language.dc.html` and `Signal - Pages.dc.html`,
an earlier and different direction. They were not pulled, because the brief named the Neon
District file. If "Signal" is ever revisited, it is still in the Design project.

## The parts worth reading

Two passages in the mockup drove implementation decisions and are quoted in
[../UI-DESIGN.md](../UI-DESIGN.md):

- The **motion law** — "Energy travels, objects hold still" (§6e).
- **"Rain stayed behind with the grunge cut; it read as weather, and this world is vacuum,
  not street"** (§6, intro). This is why there is a star field and no rain, and it is what
  settled the footer's location Easter egg on a crater rather than a city.
