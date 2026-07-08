/** Small deterministic PRNG (mulberry32) — reproducible streams from a numeric seed.
 *  Lives in its own module so both the distribution harness and the simulator (which
 *  derives its dedicated injury stream from one main-stream draw) can use it without
 *  an import cycle. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
