/**
 * Reading time from the raw markdown body.
 *
 * The mockup showed a per-post reading time; the frontmatter has no such field
 * and back-filling one by hand across every post would rot immediately. Deriving
 * it at build keeps it honest for free.
 *
 * 200 wpm is the conventional prose figure. These posts are technical and carry
 * code blocks, which read slower than prose but are also often skimmed — the
 * two effects roughly cancel, and the number is a rough signal either way.
 */
const WORDS_PER_MINUTE = 200;

export function readingTime(body: string | undefined): string {
  if (!body) return '1 MIN';

  const text = body
    // Fenced code blocks are dropped: code is skimmed, not read at prose
    // speed, and a long listing would dominate the count. CommonMark allows
    // both ``` and ~~~ fences, and a closing fence must match its opener.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    // An unclosed fence runs to the end of the document (CommonMark §4.5),
    // so everything after it is code and is excluded from the word count.
    .replace(/(?:```|~~~)[\s\S]*$/, ' ')
    // Inline markdown punctuation that would otherwise split words.
    .replace(/[#>*_`[\]()]/g, ' ');

  const words = text.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} MIN`;
}
