// Minimal frame-driven tween runner (no dependencies).
export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outQuint: (t: number) => 1 - (1 - t) ** 5,
};
type Job = { start: number; duration: number; step: (t: number) => void; ease: Ease; done: () => void; delay: number };
const jobs = new Set<Job>();
let now = 0;
export function tween(duration: number, step: (t: number) => void, opts: { ease?: Ease; delay?: number } = {}) {
  return new Promise<void>(resolve => {
    jobs.add({ start: now, duration: Math.max(1, duration), step, ease: opts.ease ?? ease.outCubic, done: resolve, delay: opts.delay ?? 0 });
  });
}
export const wait = (ms: number) => tween(ms, () => {}, { ease: ease.linear });
export function updateTweens(time: number) {
  now = time;
  for (const j of jobs) {
    const elapsed = time - j.start - j.delay;
    if (elapsed < 0) continue;
    const t = Math.min(1, elapsed / j.duration);
    j.step(j.ease(t));
    if (t >= 1) { jobs.delete(j); j.done(); }
  }
}
