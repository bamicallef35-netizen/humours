// humours.js — a dwelling plan grown from its inhabitants' humours.
//
// An original homage to R&Sie(n)'s Une architecture des humeurs (Le
// Laboratoire, Paris, 2010), where visitors' body chemistry was read at the
// entrance and interpreted as humours that set deliberately uncertain
// protocols for a residential structure, with François Jouve's recursive
// structural optimisation generating the morphologies. Nothing of that
// mathematics is reproduced here. This is a 2-D plan on a grid: each
// inhabitant has synthetic humours; each claims cells for a room by local
// rules those humours bias; a stand-in structural rule keeps every room
// 4-connected, within a depth of the spine, and touching it for access.
// The humours are seeded numbers, not readings of anyone.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EMPTY = -1, SPINE = -2;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function defaultParams() {
  return {
    w: 48, h: 24, inhabitants: 6, seed: 1,
    area: 420,        // cells of room the plan may hold in total — the material
    depth: 10,        // no room cell farther than this from the spine (a structural stand-in)
    openness: 0.6,    // sympathy above this opens a door between two rooms
  };
}

export class Plan {
  constructor(w, h) { this.w = w; this.h = h; this.cells = new Int8Array(w * h).fill(EMPTY); }
  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : SPINE - 1; } // outside reads as a wall
  set(x, y, v) { this.cells[this.idx(x, y)] = v; }
  count(v) { let n = 0; for (const c of this.cells) if (c === v) n++; return n; }
  hash() { let h = 0x811c9dc5; for (let i = 0; i < this.cells.length; i++) { h ^= (this.cells[i] + 3) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; } return (h >>> 0).toString(16).padStart(8, "0"); }
}

// The physiological interview, as numbers: each inhabitant's stress (calm is
// its complement), empathy, and a pairwise sympathy that is symmetric.
export function interview(n, rng) {
  const people = [];
  for (let i = 0; i < n; i++) people.push({ id: i, stress: rng(), empathy: rng() });
  const sympathy = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = rng(); sympathy[i][j] = s; sympathy[j][i] = s; }
  return { people, sympathy };
}

export function createState(params) {
  const p = Object.assign(defaultParams(), params || {});
  const rng = mulberry32(p.seed);
  const plan = new Plan(p.w, p.h);
  const spineY = Math.floor(p.h / 2);
  for (let x = 0; x < p.w; x++) plan.set(x, spineY, SPINE);            // the corridor, entrance at x = 0
  const iv = p.interview || interview(p.inhabitants, rng);
  const people = iv.people, sympathy = iv.sympathy;
  // Each room begins as one cell on the spine's flank, spaced along it.
  for (const person of people) {
    const x = 2 + Math.floor((p.w - 4) * (person.id + 0.5) / people.length);
    const y = spineY + (person.id % 2 === 0 ? -1 : 1);
    plan.set(x, y, person.id);
  }
  const state = { p, rng, plan, people, sympathy, spineY, t: 0, finished: false, override: null, centroids: [] };
  state.centroids = centroids(state);
  return state;
}

// Where each room is, as the mean of its cells.
export function centroids(state) {
  const { plan, people } = state;
  const sx = new Float64Array(people.length), sy = new Float64Array(people.length), n = new Float64Array(people.length);
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) { const v = plan.get(x, y); if (v >= 0) { sx[v] += x; sy[v] += y; n[v]++; } }
  return people.map((person) => ({ x: sx[person.id] / (n[person.id] || 1), y: sy[person.id] / (n[person.id] || 1), n: n[person.id] }));
}

export function distanceToSpine(state, y) { return Math.abs(y - state.spineY); }

function exposure(plan, x, y, owner) {   // sides of the cell not facing the same room
  let open = 0;
  for (const [dx, dy] of N4) if (plan.get(x + dx, y + dy) !== owner) open++;
  return open;
}

function touchesSpine(plan, x, y) { for (const [dx, dy] of N4) if (plan.get(x + dx, y + dy) === SPINE) return true; return false; }

// Candidate cells a room may grow into: empty, adjacent to the room, within
// the structural depth. Rooms stay 4-connected by construction.
export function candidates(state, person) {
  const { plan, p } = state, out = [];
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    if (plan.get(x, y) !== person.id) continue;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (plan.get(nx, ny) !== EMPTY) continue;
      if (distanceToSpine(state, ny) > p.depth) continue;
      if (!out.some(([cx, cy]) => cx === nx && cy === ny)) out.push([nx, ny]);
    }
  }
  return out;
}

// Score a candidate under the inhabitant's humours. Everyone grows compactly
// (a cell with more sides on its own room scores higher); stress raises that
// and adds a preference for depth, away from the corridor; calm prefers
// outlook (sides on open ground) and the corridor's edge. Sympathy acts at a
// distance: a room grows toward the rooms it is sympathetic to and away
// from those it is not (sympathy below one half repels). Empathy raises the
// appetite for contact with any neighbour at all.
export function score(state, person, x, y) {
  const { plan, sympathy, people, spineY, centroids: cs } = state;
  const stress = state.override ? state.override.stress : person.stress, calm = 1 - stress;
  let own = 0, open = 0, contact = 0;
  for (const [dx, dy] of N4) {
    const v = plan.get(x + dx, y + dy);
    if (v === person.id) own++;
    else if (v === EMPTY) open++;
    else if (v >= 0) contact += sympathy[person.id][v] + 0.5 * person.empathy;
  }
  const compact = own / 3, outlook = open / 3, depth = Math.abs(y - spineY) / state.p.depth;
  const corridor = touchesSpine(plan, x, y) ? 1 : 0, diag = Math.hypot(plan.w, plan.h);
  let pull = 0;
  for (const other of people) {
    if (other.id === person.id || !cs[other.id] || !cs[other.id].n) continue;
    const closeness = 1 - Math.hypot(x - cs[other.id].x, y - cs[other.id].y) / diag;
    pull += (sympathy[person.id][other.id] - 0.5) * 2 * closeness;
  }
  return (1.2 + 2.4 * stress) * compact + 2.2 * stress * depth + calm * (1.5 * outlook + 2.2 * corridor) + 1.8 * contact + 6 * pull;
}

export function step(state) {
  const { p, plan, rng, people } = state;
  if (plan.count(EMPTY) === 0 || roomArea(state) >= p.area) { state.finished = true; return state; }
  state.t++;
  state.centroids = centroids(state);
  for (const person of people) {
    if (roomArea(state) >= p.area) { state.finished = true; return state; }
    const cands = candidates(state, person);
    if (!cands.length) continue;
    const scores = cands.map(([x, y]) => score(state, person, x, y));
    const exps = scores.map((s) => Math.exp(s)), total = exps.reduce((u, v) => u + v, 0);
    let pick = rng() * total, k = 0;
    while (k < exps.length - 1 && (pick -= exps[k]) > 0) k++;
    const [x, y] = cands[k];
    plan.set(x, y, person.id);
  }
  return state;
}

export function roomArea(state) { let n = 0; for (const c of state.plan.cells) if (c >= 0) n++; return n; }
export function areaOf(state, id) { return state.plan.count(id); }

// Does every room touch the corridor, and is each 4-connected?
export function accessHolds(state) {
  const { plan, people } = state;
  for (const person of people) {
    let touch = false, cells = [];
    for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) if (plan.get(x, y) === person.id) { cells.push([x, y]); if (touchesSpine(plan, x, y)) touch = true; }
    if (!touch || !cells.length) return false;
    const seen = new Set([cells[0].join(",")]), stack = [cells[0]];
    while (stack.length) { const [x, y] = stack.pop(); for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; const k = nx + "," + ny; if (plan.get(nx, ny) === person.id && !seen.has(k)) { seen.add(k); stack.push([nx, ny]); } } }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

// Mean exposure of a room: perimeter sides per cell. Lower is more enclosed.
export function meanExposure(state, id) {
  const { plan } = state; let sides = 0, n = 0;
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) if (plan.get(x, y) === id) { n++; sides += exposure(plan, x, y, id); }
  return n ? sides / n : 0;
}

export function adjacent(state, a, b) {
  const { plan } = state;
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) if (plan.get(x, y) === a) for (const [dx, dy] of N4) if (plan.get(x + dx, y + dy) === b) return true;
  return false;
}

// Doors. Each room gets one door to the corridor, at the corridor-facing
// cell nearest the room's centre; two rooms that touch and whose sympathy
// is above the openness threshold get one door between them, at the contact
// nearest the midpoint of their centres. Doors are read off the plan; they
// change nothing in it.
export function doors(state) {
  const { plan, people, sympathy, p } = state, cs = centroids(state), out = [];
  const contacts = new Map();   // "a,b" -> [{x,y,dx,dy}] with a < b, cell (x,y) in a, neighbour in b
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    const v = plan.get(x, y); if (v < 0) continue;
    for (const [dx, dy] of N4) {
      const u = plan.get(x + dx, y + dy);
      if (u === SPINE) { const k = "s," + v; (contacts.get(k) || contacts.set(k, []).get(k)).push({ x, y, dx, dy }); }
      else if (u >= 0 && u > v) { const k = v + "," + u; (contacts.get(k) || contacts.set(k, []).get(k)).push({ x, y, dx, dy }); }
    }
  }
  const nearest = (list, cx, cy) => list.reduce((best, c) => (Math.hypot(c.x - cx, c.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? c : best), list[0]);
  for (const person of people) {
    const list = contacts.get("s," + person.id); if (!list) continue;
    out.push({ ...nearest(list, cs[person.id].x, cs[person.id].y), kind: "corridor", rooms: [person.id] });
  }
  for (const [k, list] of contacts) {
    if (k.startsWith("s,")) continue;
    const [a, b] = k.split(",").map(Number);
    if (sympathy[a][b] <= p.openness) continue;
    out.push({ ...nearest(list, (cs[a].x + cs[b].x) / 2, (cs[a].y + cs[b].y) / 2), kind: "between", rooms: [a, b] });
  }
  return out;
}

export function run(params, maxSteps = 5000) {
  const state = createState(params);
  for (let i = 0; i < maxSteps && !state.finished; i++) step(state);
  return state;
}
