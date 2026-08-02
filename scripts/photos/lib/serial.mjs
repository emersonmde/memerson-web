/**
 * A serial write queue that survives failures.
 *
 * The pipeline serialises manifest writes through one promise chain so that
 * concurrent photos can never interleave a read-modify-write. The naive
 * version — `chain = chain.then(write)` — has a poisoning failure mode: once
 * one write rejects, every later `.then` on the chain short-circuits, so all
 * subsequent commits are silently skipped *and* each of them reports the
 * first failure's error as its own.
 *
 * This writer resets the chain after a failure: the failed write's error is
 * recorded once (and rejected to that write's own caller, so per-photo
 * accounting stays truthful), and every later write still runs.
 */
export function serialWriter() {
  let chain = Promise.resolve();
  const errors = [];

  return {
    /**
     * Queue one write behind everything already queued. The returned promise
     * rejects only if *this* write fails — a predecessor's failure never
     * propagates to it.
     */
    write(fn) {
      const attempt = chain.then(fn);
      // Reset: the chain itself never stays rejected, so the next write runs.
      chain = attempt.then(
        () => undefined,
        (error) => {
          errors.push(error);
        },
      );
      return attempt;
    },

    /** Wait for everything queued so far; returns the collected errors. */
    async done() {
      await chain;
      return errors;
    },
  };
}
