// Properties of the plan generator — claims about this code, never about the
// 2010 project.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createState, step, run, accessHolds, roomArea, areaOf, meanExposure, adjacent, centroids, doors, EMPTY, SPINE } from "../docs/humours.js";

const SMALL = { w: 32, h: 20, inhabitants: 4, area: 160 };

test("every room touches the corridor and stays connected, after every step", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const state = createState({ ...SMALL, seed });
    for (let i = 0; i < 400 && !state.finished; i++) { step(state); if (i % 20 === 0) assert.ok(accessHolds(state), `seed ${seed} step ${i}`); }
    assert.ok(accessHolds(state), `seed ${seed} final`);
  }
});

test("the plan finishes at its area budget, with no cell beyond the structural depth", () => {
  const state = run({ ...SMALL, seed: 3 });
  assert.ok(state.finished);
  assert.ok(roomArea(state) >= SMALL.area && roomArea(state) <= SMALL.area + SMALL.inhabitants);
  for (let y = 0; y < state.plan.h; y++) for (let x = 0; x < state.plan.w; x++) {
    if (state.plan.get(x, y) >= 0) assert.ok(Math.abs(y - state.spineY) <= state.p.depth);
  }
});

test("rooms never overlap and the corridor is never built on", () => {
  const state = run({ ...SMALL, seed: 5 });
  for (let x = 0; x < state.plan.w; x++) assert.equal(state.plan.get(x, state.spineY), SPINE);
  const total = state.people.reduce((n, person) => n + areaOf(state, person.id), 0);
  assert.equal(total, roomArea(state));
});

test("determinism: the same interview gives the same plan", () => {
  assert.equal(run({ ...SMALL, seed: 8 }).plan.hash(), run({ ...SMALL, seed: 8 }).plan.hash());
  assert.notEqual(run({ ...SMALL, seed: 8 }).plan.hash(), run({ ...SMALL, seed: 9 }).plan.hash());
});

test("stress encloses: a stressed room ends up less exposed than a calm one", () => {
  // Two inhabitants, same empathy, no sympathy; one stressed, one calm.
  const interview = { people: [{ id: 0, stress: 0.95, empathy: 0.3 }, { id: 1, stress: 0.05, empathy: 0.3 }], sympathy: [new Float64Array(2), new Float64Array(2)] };
  let stressedLess = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const state = run({ ...SMALL, inhabitants: 2, area: 120, seed, interview });
    if (meanExposure(state, 0) < meanExposure(state, 1)) stressedLess++;
  }
  assert.ok(stressedLess >= 6, `stressed room less exposed in only ${stressedLess} of 8 runs`);
});

test("sympathy draws rooms together and antipathy pushes them apart", () => {
  // Five inhabitants seed alternately on the two flanks of the corridor, so
  // rooms 0, 2 and 4 share a flank, with 2 between the others. Room 2 is
  // sympathetic to 0 and antipathetic to 4; every other pair is neutral.
  const n = 5, s = Array.from({ length: n }, () => new Float64Array(n).fill(0.5));
  s[2][0] = s[0][2] = 1.0; s[2][4] = s[4][2] = 0.0;
  const interview = { people: Array.from({ length: n }, (_, id) => ({ id, stress: 0.5, empathy: 0.2 })), sympathy: s };
  let nearer = 0, together = 0, apart = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const state = run({ w: 48, h: 24, inhabitants: n, area: 260, seed, interview });
    const c = centroids(state);
    if (Math.hypot(c[2].x - c[0].x, c[2].y - c[0].y) < Math.hypot(c[2].x - c[4].x, c[2].y - c[4].y)) nearer++;
    if (adjacent(state, 2, 0)) together++;
    if (adjacent(state, 2, 4)) apart++;
  }
  assert.ok(nearer >= 8, `room 2 ended nearer its friend in only ${nearer} of 10 runs`);
  assert.ok(together >= apart, `touched its friend in ${together} runs, its antipathy in ${apart}`);
});

test("an empty plan has only the corridor and the seed cells", () => {
  const state = createState({ ...SMALL, seed: 1 });
  assert.equal(roomArea(state), SMALL.inhabitants);
  assert.equal(state.plan.count(EMPTY), SMALL.w * SMALL.h - SMALL.w - SMALL.inhabitants);
});

test("doors: one to the corridor per room; one between rooms only above the openness threshold", () => {
  const n = 5, s = Array.from({ length: n }, () => new Float64Array(n).fill(0.5));
  s[2][0] = s[0][2] = 1.0;   // the one sympathetic pair
  const interview = { people: Array.from({ length: n }, (_, id) => ({ id, stress: 0.5, empathy: 0.2 })), sympathy: s };
  const state = run({ w: 48, h: 24, inhabitants: n, area: 260, seed: 2, interview });
  const ds = doors(state);
  assert.equal(ds.filter((d) => d.kind === "corridor").length, n);
  for (const d of ds) {
    assert.ok(state.plan.get(d.x, d.y) === d.rooms[0], "a door sits in a cell of its room");
    const beyond = state.plan.get(d.x + d.dx, d.y + d.dy);
    if (d.kind === "corridor") assert.equal(beyond, SPINE); else { assert.equal(beyond, d.rooms[1]); assert.deepEqual(d.rooms, [0, 2]); }
  }
  // neutral sympathy (0.5) is below the default openness (0.6): no door between any other pair
  assert.ok(ds.filter((d) => d.kind === "between").length <= 1);
});

test("the sheet is one SVG document that carries the scenario block and a door per room", async () => {
  const { planSheet } = await import("../docs/sheet.js");
  const state = run({ ...SMALL, seed: 4 });
  const svg = planSheet(state);
  assert.ok(svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>"));
  for (const k of ["project", "programme", "area", "procedure", "record", "units", "interview", "sympathy", "access"]) assert.ok(svg.includes(k), k);
  assert.equal((svg.match(/<text/g) || []).length > 10, true);
  const live = planSheet(state, { block: false });
  assert.ok(!live.includes("procedure") && live.includes("10 units"));
  const tile = planSheet(state, { compact: true, cell: 5 });
  assert.ok(!tile.includes("drawn by") && !tile.includes("10 units") && tile.includes("<path d="), "a compact tile has walls and no furniture");
});
