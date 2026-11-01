export type SimEdge = { a: number; b: number; w?: number };

export interface ForceSimOptions {
  repulsion?: number;
  springLength?: number;
  springK?: number;
  gravity?: number;
  damping?: number;
  theta?: number;
  sleepEnergy?: number;
  /** Cooling rate per step (d3 default 0.0228). Higher settles faster. */
  alphaDecay?: number;
  sleepFrames?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_QUAD_DEPTH = 16;
const EPSILON_SQ = 4.0;
const MAX_VELOCITY = 50.0;
const MAX_VELOCITY_SQ = MAX_VELOCITY * MAX_VELOCITY;
const ALPHA_DECAY = 0.0228;

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ForceSim {
  private readonly repulsion: number;
  private readonly springLength: number;
  private readonly springK: number;
  private readonly gravity: number;
  private readonly damping: number;
  private readonly theta: number;
  private readonly invThetaSq: number;
  private readonly sleepEnergy: number;
  private readonly alphaDecay: number;
  private readonly sleepFrames: number;

  private _count = 0;
  private _capacity = 0;
  private _edgeCount = 0;
  private _edgeCapacity = 0;

  private _alpha = 1.0;
  private _asleep = false;
  private _lowEnergyFrames = 0;
  private _pinnedCount = 0;

  // Preallocated node buffers (grow by doubling, never allocated in step)
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);
  private fx = new Float32Array(0);
  private fy = new Float32Array(0);
  private mass = new Float32Array(0);
  private pinned = new Uint8Array(0);
  private placed = new Uint8Array(0);

  private _xsView = new Float32Array(0);
  private _ysView = new Float32Array(0);

  // Preallocated edge & adjacency buffers
  private edgeA = new Int32Array(0);
  private edgeB = new Int32Array(0);
  private edgeW = new Float32Array(0);
  private adjHead = new Int32Array(0);
  private adjTo = new Int32Array(0);
  private adjNext = new Int32Array(0);

  // Preallocated Barnes-Hut quadtree pool (rebuilt each step, reset by _quadCount = 0)
  private _quadCap = 0;
  private _quadCount = 0;
  private qComX = new Float32Array(0);
  private qComY = new Float32Array(0);
  private qMass = new Float32Array(0);
  private qCx = new Float32Array(0);
  private qCy = new Float32Array(0);
  private qHalf = new Float32Array(0);
  private qBody = new Int32Array(0);
  private qChild = new Int32Array(0);

  // Flattened pre-order DFS representation of quadtree for zero-allocation traversal
  private dfsComX = new Float32Array(0);
  private dfsComY = new Float32Array(0);
  private dfsMass = new Float32Array(0);
  private dfsCritDistSq = new Float32Array(0);
  private dfsBody = new Int32Array(0);
  private dfsSkip = new Int32Array(0);
  private readonly dfsStack = new Int32Array(256);

  // ID mappings
  private _ids: string[] = [];
  private _idToIndex = new Map<string, number>();

  constructor(opts?: ForceSimOptions) {
    this.repulsion = opts?.repulsion ?? 20;
    this.springLength = opts?.springLength ?? 70;
    this.springK = opts?.springK ?? 0.1;
    this.gravity = opts?.gravity ?? 0.05;
    this.damping = opts?.damping ?? 0.86;
    this.theta = opts?.theta ?? 0.9;
    this.invThetaSq = 1.0 / (this.theta * this.theta);
    this.sleepEnergy = opts?.sleepEnergy ?? 0.02;
    this.alphaDecay = opts?.alphaDecay ?? ALPHA_DECAY;
    this.sleepFrames = opts?.sleepFrames ?? 24;

    this.ensureNodeCapacity(64);
    this.ensureEdgeCapacity(64);
  }

  get count(): number {
    return this._count;
  }

  get xs(): Float32Array {
    return this._xsView;
  }

  get ys(): Float32Array {
    return this._ysView;
  }

  get asleep(): boolean {
    return this._asleep;
  }

  indexOf(id: string): number {
    const idx = this._idToIndex.get(id);
    return idx !== undefined ? idx : -1;
  }

  idAt(i: number): string {
    return this._ids[i] ?? '';
  }

  wake(alpha = 0.6): void {
    this._asleep = false;
    this._lowEnergyFrames = 0;
    this._alpha = alpha;
  }

  pin(index: number, x: number, y: number): void {
    if (index < 0 || index >= this._count) return;
    if (this.pinned[index] === 0) {
      this.pinned[index] = 1;
      this._pinnedCount++;
    }
    this.x[index] = x;
    this.y[index] = y;
    this.vx[index] = 0;
    this.vy[index] = 0;
    this._asleep = false;
    this._lowEnergyFrames = 0;
    if (this._alpha < 0.6) {
      this._alpha = 0.6;
    }
  }

  unpin(index: number): void {
    if (index < 0 || index >= this._count) return;
    if (this.pinned[index] !== 0) {
      this.pinned[index] = 0;
      this._pinnedCount--;
      this.vx[index] = 0;
      this.vy[index] = 0;
    }
  }

  hitTest(px: number, py: number, radius: number): number {
    const n = this._count;
    const x = this.x;
    const y = this.y;
    let bestIdx = -1;
    let bestD2 = radius * radius;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - px;
      const dy = y[i] - py;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const n = this._count;
    if (n === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    const x = this.x;
    const y = this.y;
    let minX = x[0];
    let maxX = x[0];
    let minY = y[0];
    let maxY = y[0];
    for (let i = 1; i < n; i++) {
      const xi = x[i];
      const yi = y[i];
      if (xi < minX) minX = xi;
      if (xi > maxX) maxX = xi;
      if (yi < minY) minY = yi;
      if (yi > maxY) maxY = yi;
    }
    return { minX, minY, maxX, maxY };
  }

  setGraph(ids: string[], weights: number[], edges: SimEdge[]): void {
    const n = ids.length;
    const m = edges.length;
    const oldCount = this._count;
    const oldIdToIndex = this._idToIndex;

    // Save old node state into quadtree buffers before growing or overwriting in-place
    const savedX = this.qComX;
    const savedY = this.qComY;
    const savedVx = this.qCx;
    const savedVy = this.qCy;
    const savedPinned = this.qBody;

    for (let i = 0; i < oldCount; i++) {
      savedX[i] = this.x[i];
      savedY[i] = this.y[i];
      savedVx[i] = this.vx[i];
      savedVy[i] = this.vy[i];
      savedPinned[i] = this.pinned[i];
    }

    this.ensureNodeCapacity(n);
    this.ensureEdgeCapacity(m);

    const x = this.x;
    const y = this.y;
    const vx = this.vx;
    const vy = this.vy;
    const mass = this.mass;
    const pinned = this.pinned;
    const placed = this.placed;

    const newIdToIndex = new Map<string, number>();
    const newIds = new Array<string>(n);
    let pinnedCount = 0;

    // Queue of already-placed nodes (reusing dfsSkip buffer)
    const queue = this.dfsSkip;
    let qTail = 0;

    for (let i = 0; i < n; i++) {
      const id = ids[i];
      newIds[i] = id;
      newIdToIndex.set(id, i);
      const w = weights[i];
      mass[i] = w !== undefined && w > 0 ? w : 1.0;

      const oldIdx = oldCount > 0 ? oldIdToIndex.get(id) : undefined;
      if (oldIdx !== undefined) {
        x[i] = savedX[oldIdx];
        y[i] = savedY[oldIdx];
        vx[i] = savedVx[oldIdx];
        vy[i] = savedVy[oldIdx];
        const p = savedPinned[oldIdx] & 1;
        pinned[i] = p;
        if (p !== 0) pinnedCount++;
        placed[i] = 1;
        queue[qTail++] = i;
      } else {
        placed[i] = 0;
        pinned[i] = 0;
        vx[i] = 0;
        vy[i] = 0;
      }
    }

    // Store valid edges & build CSR adjacency list in preallocated buffers
    const edgeA = this.edgeA;
    const edgeB = this.edgeB;
    const edgeW = this.edgeW;
    const adjHead = this.adjHead;
    const adjTo = this.adjTo;
    const adjNext = this.adjNext;

    for (let i = 0; i < n; i++) {
      adjHead[i] = -1;
    }

    let validEdges = 0;
    let adjCount = 0;

    for (let e = 0; e < m; e++) {
      const edge = edges[e];
      const a = edge.a;
      const b = edge.b;
      if (a < 0 || a >= n || b < 0 || b >= n || a === b) continue;
      edgeA[validEdges] = a;
      edgeB[validEdges] = b;
      edgeW[validEdges] = edge.w !== undefined && edge.w > 0 ? edge.w : 1.0;
      validEdges++;

      adjTo[adjCount] = b;
      adjNext[adjCount] = adjHead[a];
      adjHead[a] = adjCount++;

      adjTo[adjCount] = a;
      adjNext[adjCount] = adjHead[b];
      adjHead[b] = adjCount++;
    }
    this._edgeCount = validEdges;

    // Seed new IDs deterministically:
    // If existing nodes are present, propagate outward from them first via BFS;
    // then seed any remaining unplaced nodes in index order (spiral if no placed neighbours).
    let qHead = 0;
    let scanIdx = 0;

    while (true) {
      let target = -1;

      if (qHead < qTail) {
        // Check neighbours of already-placed node
        const u = queue[qHead++];
        for (let e = adjHead[u]; e !== -1; e = adjNext[e]) {
          const nb = adjTo[e];
          if (placed[nb] === 0) {
            this.seedNewNode(nb, newIds[nb]);
            placed[nb] = 1;
            queue[qTail++] = nb;
          }
        }
        continue;
      }

      while (scanIdx < n && placed[scanIdx] !== 0) {
        scanIdx++;
      }
      if (scanIdx >= n) break;

      target = scanIdx++;
      this.seedNewNode(target, newIds[target]);
      placed[target] = 1;
      queue[qTail++] = target;
    }

    this._count = n;
    this._ids = newIds;
    this._idToIndex = newIdToIndex;
    this._pinnedCount = pinnedCount;

    this._xsView = this.x.subarray(0, n);
    this._ysView = this.y.subarray(0, n);

    // Wake the simulation with alpha = 1
    this._alpha = 1.0;
    this._asleep = false;
    this._lowEnergyFrames = 0;
  }

  private seedNewNode(i: number, id: string): void {
    const x = this.x;
    const y = this.y;
    const placed = this.placed;
    const adjHead = this.adjHead;
    const adjTo = this.adjTo;
    const adjNext = this.adjNext;

    let sumX = 0;
    let sumY = 0;
    let nbPlaced = 0;

    for (let e = adjHead[i]; e !== -1; e = adjNext[e]) {
      const nb = adjTo[e];
      if (placed[nb] !== 0) {
        sumX += x[nb];
        sumY += y[nb];
        nbPlaced++;
      }
    }

    const rng = mulberry32(hashString(id));
    const jx = (rng() - 0.5) * 12.0;
    const jy = (rng() - 0.5) * 12.0;

    if (nbPlaced > 0) {
      const angle = i * GOLDEN_ANGLE + (rng() - 0.5) * 0.5;
      const offset = 16.0;
      x[i] = sumX / nbPlaced + Math.cos(angle) * offset + jx;
      y[i] = sumY / nbPlaced + Math.sin(angle) * offset + jy;
    } else {
      const r = 18.0 * Math.sqrt(i);
      const angle = i * GOLDEN_ANGLE;
      x[i] = Math.cos(angle) * r + jx;
      y[i] = Math.sin(angle) * r + jy;
    }
  }

  step(dtMs: number): number {
    if (this._asleep || this._count === 0) {
      return 0;
    }

    const n = this._count;
    const rawDt = Number.isFinite(dtMs) ? dtMs / 16.67 : 1.0;
    const dt = rawDt < 0.25 ? 0.25 : rawDt > 2.0 ? 2.0 : rawDt;

    const x = this.x;
    const y = this.y;
    const vx = this.vx;
    const vy = this.vy;
    const fx = this.fx;
    const fy = this.fy;
    const mass = this.mass;
    const pinned = this.pinned;

    // 1. Reset forces, apply weak gravity to origin, and compute bounding box for Barnes-Hut
    // All forces are unscaled; alpha scales the whole system at integration
    // time (d3 semantics), so the equilibrium *shape* is independent of cooling.
    const grav = this.gravity;
    let minX = x[0];
    let maxX = x[0];
    let minY = y[0];
    let maxY = y[0];

    for (let i = 0; i < n; i++) {
      const xi = x[i];
      const yi = y[i];
      const mi = mass[i];
      fx[i] = -xi * grav * mi;
      fy[i] = -yi * grav * mi;
      if (xi < minX) minX = xi;
      if (xi > maxX) maxX = xi;
      if (yi < minY) minY = yi;
      if (yi > maxY) maxY = yi;
    }

    // 2. Build Barnes-Hut quadtree in preallocated pool & evaluate repulsion
    if (n > 1) {
      this.buildQuadtree(n, minX, minY, maxX, maxY);
      this.evaluateRepulsion(n);
    }

    // 3. Apply Hooke spring forces along edges
    const edgeCount = this._edgeCount;
    const edgeA = this.edgeA;
    const edgeB = this.edgeB;
    const edgeW = this.edgeW;
    const springLen = this.springLength;
    const springK = this.springK;

    for (let e = 0; e < edgeCount; e++) {
      const a = edgeA[e];
      const b = edgeB[e];
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const d2 = dx * dx + dy * dy;
      const dist = d2 > 1e-12 ? Math.sqrt(d2) : 1e-6;
      const force = (springK * edgeW[e] * (dist - springLen)) / dist;
      const sfx = dx * force;
      const sfy = dy * force;
      fx[a] += sfx;
      fy[a] += sfy;
      fx[b] -= sfx;
      fy[b] -= sfy;
    }

    // 4. Semi-implicit integration with damping & velocity cap
    const damping = this.damping;
    const heat = Math.max(0.04, this._alpha);
    let totalKE = 0;

    for (let i = 0; i < n; i++) {
      if (pinned[i] !== 0) {
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }

      const mi = mass[i];
      const invMass = 1.0 / mi;
      let nvx = (vx[i] + fx[i] * invMass * dt * heat) * damping;
      let nvy = (vy[i] + fy[i] * invMass * dt * heat) * damping;

      let v2 = nvx * nvx + nvy * nvy;
      if (v2 > MAX_VELOCITY_SQ) {
        const scale = MAX_VELOCITY / Math.sqrt(v2);
        nvx *= scale;
        nvy *= scale;
        v2 = MAX_VELOCITY_SQ;
      }

      vx[i] = nvx;
      vy[i] = nvy;
      x[i] += nvx * dt;
      y[i] += nvy * dt;

      totalKE += 0.5 * mi * v2;
    }

    // 5. Cool alpha (d3-like)
    const alphaTarget = this._pinnedCount > 0 ? 0.3 : 0.0;
    this._alpha += (alphaTarget - this._alpha) * this.alphaDecay;

    // 6. Check sleep condition
    const avgKE = totalKE / n;
    if (this._pinnedCount === 0 && avgKE < this.sleepEnergy) {
      this._lowEnergyFrames++;
      if (this._lowEnergyFrames >= this.sleepFrames) {
        this._asleep = true;
      }
    } else {
      this._lowEnergyFrames = 0;
    }

    return avgKE;
  }

  private growFloat32(
    old: Float32Array<ArrayBuffer>,
    newCap: number
  ): Float32Array<ArrayBuffer> {
    const next = new Float32Array(newCap);
    next.set(old);
    return next;
  }

  private growUint8(
    old: Uint8Array<ArrayBuffer>,
    newCap: number
  ): Uint8Array<ArrayBuffer> {
    const next = new Uint8Array(newCap);
    next.set(old);
    return next;
  }

  private ensureNodeCapacity(minCap: number): void {
    if (this._capacity >= minCap) return;
    let cap = this._capacity || 64;
    while (cap < minCap) {
      cap <<= 1;
    }
    this._capacity = cap;

    this.x = this.growFloat32(this.x, cap);
    this.y = this.growFloat32(this.y, cap);
    this.vx = this.growFloat32(this.vx, cap);
    this.vy = this.growFloat32(this.vy, cap);
    this.fx = new Float32Array(cap);
    this.fy = new Float32Array(cap);
    this.mass = this.growFloat32(this.mass, cap);
    this.pinned = this.growUint8(this.pinned, cap);
    this.placed = new Uint8Array(cap);
    this.adjHead = new Int32Array(cap);

    const quadCap = cap * 4;
    this._quadCap = quadCap;
    const prevQComX = this.qComX;
    const prevQComY = this.qComY;
    const prevQCx = this.qCx;
    const prevQCy = this.qCy;
    const prevQBody = this.qBody;

    this.qComX = new Float32Array(quadCap);
    this.qComY = new Float32Array(quadCap);
    this.qMass = new Float32Array(quadCap);
    this.qCx = new Float32Array(quadCap);
    this.qCy = new Float32Array(quadCap);
    this.qHalf = new Float32Array(quadCap);
    this.qBody = new Int32Array(quadCap);
    this.qChild = new Int32Array(quadCap * 4);

    if (prevQComX.length > 0) {
      this.qComX.set(prevQComX);
      this.qComY.set(prevQComY);
      this.qCx.set(prevQCx);
      this.qCy.set(prevQCy);
      this.qBody.set(prevQBody);
    }

    this.dfsComX = new Float32Array(quadCap);
    this.dfsComY = new Float32Array(quadCap);
    this.dfsMass = new Float32Array(quadCap);
    this.dfsCritDistSq = new Float32Array(quadCap);
    this.dfsBody = new Int32Array(quadCap);
    this.dfsSkip = new Int32Array(quadCap);
  }

  private ensureEdgeCapacity(minEdges: number): void {
    if (this._edgeCapacity >= minEdges) return;
    let cap = this._edgeCapacity || 64;
    while (cap < minEdges) {
      cap <<= 1;
    }
    this._edgeCapacity = cap;
    this.edgeA = new Int32Array(cap);
    this.edgeB = new Int32Array(cap);
    this.edgeW = new Float32Array(cap);
    this.adjTo = new Int32Array(cap * 2);
    this.adjNext = new Int32Array(cap * 2);
  }

  private allocQuadNode(cx: number, cy: number, half: number): number {
    const q = this._quadCount++;
    this.qMass[q] = 0;
    this.qComX[q] = 0;
    this.qComY[q] = 0;
    this.qCx[q] = cx;
    this.qCy[q] = cy;
    this.qHalf[q] = half;
    this.qBody[q] = -1;
    const c4 = q << 2;
    const qChild = this.qChild;
    qChild[c4] = -1;
    qChild[c4 + 1] = -1;
    qChild[c4 + 2] = -1;
    qChild[c4 + 3] = -1;
    return q;
  }

  private buildQuadtree(
    n: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): void {
    const rootCx = (minX + maxX) * 0.5;
    const rootCy = (minY + maxY) * 0.5;
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const span = (spanX > spanY ? spanX : spanY) * 1.01 + 1.0;
    const rootHalf = span * 0.5;

    this._quadCount = 0;
    this.allocQuadNode(rootCx, rootCy, rootHalf);

    const x = this.x;
    const y = this.y;
    const mass = this.mass;
    const qComX = this.qComX;
    const qComY = this.qComY;
    const qMass = this.qMass;
    const qCx = this.qCx;
    const qCy = this.qCy;
    const qHalf = this.qHalf;
    const qBody = this.qBody;
    const qChild = this.qChild;
    const quadCap = this._quadCap;

    for (let i = 0; i < n; i++) {
      const px = x[i];
      const py = y[i];
      const pm = mass[i];

      let q = 0;
      let depth = 0;

      while (true) {
        const b = qBody[q];
        if (b === -1) {
          qBody[q] = i;
          qMass[q] = pm;
          qComX[q] = pm * px;
          qComY[q] = pm * py;
          break;
        }

        if (b === -3) {
          qMass[q] += pm;
          qComX[q] += pm * px;
          qComY[q] += pm * py;
          break;
        }

        const cx = qCx[q];
        const cy = qCy[q];
        const half = qHalf[q];
        const childHalf = half * 0.5;

        if (b >= 0) {
          const bx = x[b];
          const by = y[b];
          const dx = px - bx;
          const dy = py - by;
          if (
            depth >= MAX_QUAD_DEPTH ||
            this._quadCount + 2 >= quadCap ||
            dx * dx + dy * dy < 1e-8
          ) {
            qMass[q] += pm;
            qComX[q] += pm * px;
            qComY[q] += pm * py;
            qBody[q] = -3;
            break;
          }

          const bm = mass[b];
          qBody[q] = -2;
          const quadB = (bx >= cx ? 1 : 0) | (by >= cy ? 2 : 0);
          const bCx = cx + ((quadB & 1) !== 0 ? childHalf : -childHalf);
          const bCy = cy + ((quadB & 2) !== 0 ? childHalf : -childHalf);
          const childB = this.allocQuadNode(bCx, bCy, childHalf);
          qChild[(q << 2) | quadB] = childB;
          qBody[childB] = b;
          qMass[childB] = bm;
          qComX[childB] = bm * bx;
          qComY[childB] = bm * by;
        }

        qMass[q] += pm;
        qComX[q] += pm * px;
        qComY[q] += pm * py;

        const quadI = (px >= cx ? 1 : 0) | (py >= cy ? 2 : 0);
        const slot = (q << 2) | quadI;
        let child = qChild[slot];
        if (child === -1) {
          if (this._quadCount < quadCap) {
            const iCx = cx + ((quadI & 1) !== 0 ? childHalf : -childHalf);
            const iCy = cy + ((quadI & 2) !== 0 ? childHalf : -childHalf);
            child = this.allocQuadNode(iCx, iCy, childHalf);
            qChild[slot] = child;
            qBody[child] = i;
            qMass[child] = pm;
            qComX[child] = pm * px;
            qComY[child] = pm * py;
          }
          break;
        }

        q = child;
        depth++;
      }
    }
  }

  private evaluateRepulsion(n: number): void {
    const qComX = this.qComX;
    const qComY = this.qComY;
    const qMass = this.qMass;
    const qHalf = this.qHalf;
    const qBody = this.qBody;
    const qChild = this.qChild;

    const dfsComX = this.dfsComX;
    const dfsComY = this.dfsComY;
    const dfsMass = this.dfsMass;
    const dfsCritDistSq = this.dfsCritDistSq;
    const dfsBody = this.dfsBody;
    const dfsSkip = this.dfsSkip;
    const stack = this.dfsStack;
    const invThetaSq = this.invThetaSq;

    let dfsLen = 0;
    let sp = 0;
    stack[sp++] = 0;

    while (sp > 0) {
      const item = stack[--sp];
      if (item < 0) {
        dfsSkip[~item] = dfsLen;
        continue;
      }

      const q = item;
      const m = qMass[q];
      if (m <= 0) continue;

      const k = dfsLen++;
      const invM = 1.0 / m;
      dfsComX[k] = qComX[q] * invM;
      dfsComY[k] = qComY[q] * invM;
      dfsMass[k] = m;
      const body = qBody[q];
      dfsBody[k] = body;
      const size = qHalf[q] * 2.0;
      dfsCritDistSq[k] = size * size * invThetaSq;

      if (body === -2) {
        stack[sp++] = ~k;
        const c4 = q << 2;
        const c3 = qChild[c4 + 3];
        if (c3 !== -1) stack[sp++] = c3;
        const c2 = qChild[c4 + 2];
        if (c2 !== -1) stack[sp++] = c2;
        const c1 = qChild[c4 + 1];
        if (c1 !== -1) stack[sp++] = c1;
        const c0 = qChild[c4];
        if (c0 !== -1) stack[sp++] = c0;
      } else {
        dfsSkip[k] = dfsLen;
      }
    }

    const x = this.x;
    const y = this.y;
    const fx = this.fx;
    const fy = this.fy;
    const mass = this.mass;
    const repAlpha = this.repulsion;

    for (let i = 0; i < n; i++) {
      const px = x[i];
      const py = y[i];
      let repX = 0.0;
      let repY = 0.0;

      let k = 0;
      while (k < dfsLen) {
        const dx = px - dfsComX[k];
        const dy = py - dfsComY[k];
        const d2 = dx * dx + dy * dy;
        const body = dfsBody[k];

        if (body === -2 && d2 < dfsCritDistSq[k]) {
          k++;
        } else {
          if (body !== i) {
            const inv = dfsMass[k] / (d2 + EPSILON_SQ);
            repX += dx * inv;
            repY += dy * inv;
          }
          k = dfsSkip[k];
        }
      }

      const scale = repAlpha * mass[i];
      fx[i] += repX * scale;
      fy[i] += repY * scale;
    }
  }
}
