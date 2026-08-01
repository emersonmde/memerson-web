/**
 * Bounded concurrency, shared by both halves of the pipeline: the R2 side uses
 * it to cap live wrangler processes, the model side to cap `claude` processes.
 * Same shape, one implementation — it grew up twice under two names (`pool` and
 * `mapPool`) before being deduplicated here.
 */

/**
 * Run `fn` over every item with at most `limit` in flight. Results keep input
 * order. The first rejection propagates once in-flight work settles.
 */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
