/*
 * Readers for data a gallery tile already carries in its rendered markup.
 *
 * Each of these used to be duplicated into a `data-*` attribute on the tile —
 * which for the LQIP meant every ~180-byte data URI appeared twice in the
 * document (~42KB of duplication at 232 frames), and for alt/title meant a
 * second copy of a string the markup already serves. The attributes are gone
 * (see `PhotoTile.astro`); these helpers read the single remaining copy.
 */

/**
 * The tile's LQIP, extracted from the img's inline `background-image`.
 *
 * The style attribute is authored as `url(data:...)`, but the CSSOM serializes
 * it back as `url("data:...")` — quoting differs by engine, so both forms are
 * accepted. A data URI contains no parentheses, which is what makes the lazy
 * match safe.
 */
export function tileLqip(tile: HTMLAnchorElement): string {
  const bg = tile.querySelector('img')?.style.backgroundImage ?? '';
  const m = /url\((['"]?)(.*?)\1\)/.exec(bg);
  return m ? m[2] : '';
}

/** The tile's alt text — the img's own, not a duplicate attribute. */
export function tileAlt(tile: HTMLAnchorElement): string {
  return tile.querySelector('img')?.alt ?? '';
}

/**
 * The tile's display title, recovered from its aria-label.
 *
 * `PhotoTile.astro` renders `aria-label="Open <title>"` — this strips the
 * verb. The two are a documented contract (see the comment beside `title`
 * there); neither side may change without the other.
 */
export function tileTitle(tile: HTMLAnchorElement): string {
  return (tile.getAttribute('aria-label') ?? '').replace(/^Open /, '');
}
