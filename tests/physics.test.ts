import { test, expect } from 'bun:test';
import { ForceSim, type SimEdge } from '../src/graph/physics';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('two connected nodes converge near springLength-ish distance and fall asleep within 2000 steps', () => {
  const springLength = 70;
  const sim = new ForceSim({ springLength });
  sim.setGraph(['n0', 'n1'], [1, 1], [{ a: 0, b: 1, w: 1 }]);

  expect(sim.count).toBe(2);
  expect(sim.indexOf('n0')).toBe(0);
  expect(sim.indexOf('n1')).toBe(1);
  expect(sim.idAt(0)).toBe('n0');
  expect(sim.idAt(1)).toBe('n1');

  let steps = 0;
  while (!sim.asleep && steps < 2000) {
    sim.step(16.67);
    steps++;
  }

  expect(sim.asleep).toBe(true);
  expect(steps).toBeLessThan(2000);

  const dx = sim.xs[1] - sim.xs[0];
  const dy = sim.ys[1] - sim.ys[0];
  const dist = Math.hypot(dx, dy);

  expect(dist).toBeGreaterThan(springLength * 0.65);
  expect(dist).toBeLessThan(springLength * 1.35);
});

test('a 200-node random tree (deterministic) settles to sleep with no NaN anywhere', () => {
  const n = 200;
  const rng = mulberry32(42);
  const ids: string[] = [];
  const weights: number[] = [];
  const edges: SimEdge[] = [];

  for (let i = 0; i < n; i++) {
    ids.push(`node-${i}`);
    weights.push(1 + (i % 3) * 0.5);
    if (i > 0) {
      const parent = Math.floor(rng() * i);
      edges.push({ a: parent, b: i, w: 1 });
    }
  }

  const sim = new ForceSim();
  sim.setGraph(ids, weights, edges);

  let steps = 0;
  while (!sim.asleep && steps < 4000) {
    const ke = sim.step(16.67);
    expect(Number.isNaN(ke)).toBe(false);
    steps++;
  }

  expect(sim.asleep).toBe(true);

  for (let i = 0; i < n; i++) {
    expect(Number.isFinite(sim.xs[i])).toBe(true);
    expect(Number.isFinite(sim.ys[i])).toBe(true);
  }

  const b = sim.bounds();
  expect(b.maxX).toBeGreaterThan(b.minX);
  expect(b.maxY).toBeGreaterThan(b.minY);
});

test('setGraph preserves positions for existing ids and seeds new ids near neighbours', () => {
  const sim = new ForceSim();
  sim.setGraph(['a', 'b', 'c'], [1, 1, 1], [
    { a: 0, b: 1 },
    { a: 1, b: 2 },
  ]);

  for (let i = 0; i < 60; i++) {
    sim.step(16.67);
  }

  const ax = sim.xs[sim.indexOf('a')];
  const ay = sim.ys[sim.indexOf('a')];
  const cx = sim.xs[sim.indexOf('c')];
  const cy = sim.ys[sim.indexOf('c')];

  // Reorder existing IDs, drop 'b', and add 'd' connected to 'c'
  sim.setGraph(['c', 'a', 'd'], [1, 1, 1], [
    { a: 0, b: 1 },
    { a: 0, b: 2 },
  ]);

  expect(sim.count).toBe(3);
  expect(sim.indexOf('c')).toBe(0);
  expect(sim.indexOf('a')).toBe(1);
  expect(sim.indexOf('d')).toBe(2);
  expect(sim.indexOf('b')).toBe(-1);

  expect(sim.xs[sim.indexOf('a')]).toBe(ax);
  expect(sim.ys[sim.indexOf('a')]).toBe(ay);
  expect(sim.xs[sim.indexOf('c')]).toBe(cx);
  expect(sim.ys[sim.indexOf('c')]).toBe(cy);

  // 'd' should be seeded near 'c'
  const dx = sim.xs[sim.indexOf('d')] - cx;
  const dy = sim.ys[sim.indexOf('d')] - cy;
  expect(Math.hypot(dx, dy)).toBeLessThan(50);
  expect(sim.asleep).toBe(false);
});

test('pinning keeps coordinates fixed; unpin + run settles to sleep again', () => {
  const sim = new ForceSim();
  sim.setGraph(['a', 'b', 'c'], [1, 1, 1], [
    { a: 0, b: 1 },
    { a: 1, b: 2 },
  ]);

  sim.pin(0, 150, -120);
  expect(sim.asleep).toBe(false);

  for (let i = 0; i < 120; i++) {
    sim.step(16.67);
    expect(sim.xs[0]).toBeCloseTo(150, 5);
    expect(sim.ys[0]).toBeCloseTo(-120, 5);
    // Should never fall asleep while a node is pinned
    expect(sim.asleep).toBe(false);
  }

  expect(sim.hitTest(150, -120, 5)).toBe(0);
  expect(sim.hitTest(99999, 99999, 10)).toBe(-1);

  sim.unpin(0);

  let steps = 0;
  while (!sim.asleep && steps < 2000) {
    sim.step(16.67);
    steps++;
  }
  expect(sim.asleep).toBe(true);
});

test('asleep step returns 0 and does not change positions', () => {
  const sim = new ForceSim();
  sim.setGraph(['u', 'v'], [1, 1], [{ a: 0, b: 1 }]);

  let steps = 0;
  while (!sim.asleep && steps < 2000) {
    sim.step(16.67);
    steps++;
  }
  expect(sim.asleep).toBe(true);

  const x0 = sim.xs[0];
  const y0 = sim.ys[0];
  const x1 = sim.xs[1];
  const y1 = sim.ys[1];

  const ke = sim.step(16.67);
  expect(ke).toBe(0);
  expect(sim.xs[0]).toBe(x0);
  expect(sim.ys[0]).toBe(y0);
  expect(sim.xs[1]).toBe(x1);
  expect(sim.ys[1]).toBe(y1);

  sim.wake();
  expect(sim.asleep).toBe(false);
});

test('determinism: two sims with same input produce identical positions after 100 steps', () => {
  const n = 80;
  const rng = mulberry32(1337);
  const ids: string[] = [];
  const weights: number[] = [];
  const edges: SimEdge[] = [];

  for (let i = 0; i < n; i++) {
    ids.push(`id_${i}`);
    weights.push(1 + (i % 4) * 0.25);
    if (i > 0) {
      edges.push({ a: Math.floor(rng() * i), b: i, w: 1 });
    }
    if (i > 3 && i % 3 === 0) {
      edges.push({ a: Math.floor(rng() * (i - 1)), b: i, w: 0.5 });
    }
  }

  const sim1 = new ForceSim();
  const sim2 = new ForceSim();

  sim1.setGraph(ids, weights, edges);
  sim2.setGraph(ids, weights, edges);

  for (let s = 0; s < 100; s++) {
    const ke1 = sim1.step(16.67);
    const ke2 = sim2.step(16.67);
    expect(ke1).toBe(ke2);
  }

  for (let i = 0; i < n; i++) {
    expect(sim1.xs[i]).toBe(sim2.xs[i]);
    expect(sim1.ys[i]).toBe(sim2.ys[i]);
  }
});

test('performance: 10000 nodes / 12000 edges, average step time over 30 steps < 25 ms', () => {
  const n = 10000;
  const edgeTarget = 12000;
  const rng = mulberry32(2026);

  const ids = new Array<string>(n);
  const weights = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    ids[i] = `note_${i}`;
    weights[i] = 1 + (i & 3) * 0.25;
  }

  const edges = new Array<SimEdge>(edgeTarget);
  for (let i = 1; i < n; i++) {
    edges[i - 1] = { a: Math.floor(rng() * i), b: i, w: 1 };
  }
  for (let e = n - 1; e < edgeTarget; e++) {
    const a = Math.floor(rng() * n);
    let b = Math.floor(rng() * (n - 1));
    if (b >= a) b++;
    edges[e] = { a, b, w: 1 };
  }

  const sim = new ForceSim();
  sim.setGraph(ids, weights, edges);

  const steps = 30;
  const t0 = performance.now();
  for (let s = 0; s < steps; s++) {
    sim.step(16.67);
  }
  const elapsed = performance.now() - t0;
  const avgMs = elapsed / steps;

  console.log(`[ForceSim Perf] 10000 nodes / 12000 edges: avg step = ${avgMs.toFixed(2)} ms (${elapsed.toFixed(1)} ms / ${steps} steps)`);
  expect(avgMs).toBeLessThan(25);
});
