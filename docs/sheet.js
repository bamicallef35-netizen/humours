// sheet.js — the grown plan as an SVG drawing sheet: walls, doors, the
// corridor and its entrance, the structural depth, a scale bar, and a title
// block in the scenario format R&Sie(n) used for every project (programme,
// area, procedure, record) with the interview beside it. DOM-free: the
// page's live view, its "export sheet" button and the Node tool all draw
// through this one function.
import { EMPTY, SPINE, doors, centroids, roomArea, accessHolds } from "./humours.js";

const INK = "#111111", INK2 = "#6b6b6b", INK3 = "#a3a3a3", RULE = "#d4d4d4", PAPER = "#ffffff", PAPER2 = "#f4f4f4", ACCENT = "#0000ee";
const FONT = "IBM Plex Mono, ui-monospace, Menlo, monospace";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x, y, s, size = 11, fill = INK, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Break a string into lines of at most `max` characters, on spaces.
export function wrap(s, max) {
  const lines = []; let cur = "";
  for (const w of String(s).split(" ")) {
    if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// The cell of a room nearest its centre, for the label.
function labelCell(plan, id, c) {
  let best = null, bd = Infinity;
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    if (plan.get(x, y) !== id) continue;
    const d = Math.hypot(x - c.x, y - c.y); if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

export function planSheet(state, opts = {}) {
  const { plan, p, people, sympathy, spineY } = state;
  // compact: a tile for a contact sheet — no header, scale bar or block
  const compact = opts.compact === true, withBlock = !compact && opts.block !== false;
  const cell = opts.cell || 14, pad = compact ? 10 : 48, n = people.length;
  const gw = plan.w * cell, gh = plan.h * cell;
  const X = (x) => pad + x * cell, Y = (y) => pad + y * cell;
  const ds = doors(state), cs = centroids(state);
  // title block layout, computed first so the sheet's height is known
  const sq = 9, tableW = 74, rightW = tableW + 12 + 12 + n * sq, maxChars = Math.floor((gw - 90 - rightW - 16) / 6);
  const mode = state.override ? (state.override.stress ? "every inhabitant held on stress" : "every inhabitant held on calm") : "as interviewed";
  const between = ds.filter((d) => d.kind === "between").length;
  const rows = [
    ["project", "humours — a plan grown from its inhabitants' humours"],
    ["programme", `${n} inhabitants interviewed; each claims a room by rules their humours bias; every room keeps a door to the corridor`],
    ["area", `${plan.w} × ${plan.h} units; ${roomArea(state)} of ${p.area} units of room; structural depth ${p.depth} either side of the corridor`],
    ["procedure", `stress encloses and withdraws, calm seeks outlook and the corridor; sympathy attracts, antipathy repels; sympathy above ${p.openness} opens a door (${between} opened); ${mode}`],
    ["record", `seed ${p.seed} / step ${state.t} / access ${accessHolds(state) ? "held" : "broken"} / plan ${plan.hash()}`],
  ].map(([k, v]) => [k, wrap(v, maxChars)]);
  const textH = rows.reduce((h, [, lines]) => h + lines.length * 13 + 5, 0), rightH = 14 + Math.max(n * sq, n * 11) + 6;
  const blockH = withBlock ? 40 + Math.max(textH, rightH) : 0;
  const W = gw + pad * 2, H = gh + pad * 2 + (compact ? 0 : 30) + blockH;

  let body = `<rect x="${pad + 0.5}" y="${pad + 0.5}" width="${gw}" height="${gh}" fill="none" stroke="${RULE}"/>`;
  if (!compact) {
    body += text(pad, pad - 14, `plan / seed ${p.seed} / step ${state.t}`, 10, INK2);
    body += text(pad + gw, pad - 14, "benmicallef / humours / drawn by the model", 10, INK2, "end");
  }
  // the corridor, and the structural depth either side of it
  body += `<rect x="${X(0)}" y="${Y(spineY)}" width="${gw}" height="${cell}" fill="${PAPER2}"/>`;
  for (const yy of [spineY - p.depth, spineY + p.depth + 1]) {
    if (yy > 0 && yy < plan.h) body += `<line x1="${X(0)}" y1="${Y(yy)}" x2="${X(plan.w)}" y2="${Y(yy)}" stroke="${INK3}" stroke-dasharray="2 4"/>`;
  }
  // walls: a segment on every side of a room cell that faces something else
  let thick = "", thin = "";
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    const v = plan.get(x, y); if (v < 0) continue;
    for (const [dx, dy] of N4) {
      const u = plan.get(x + dx, y + dy);
      if (u === v) continue;
      const seg = dx === 1 ? `M${X(x + 1)} ${Y(y)}V${Y(y + 1)}` : dx === -1 ? `M${X(x)} ${Y(y)}V${Y(y + 1)}` : dy === 1 ? `M${X(x)} ${Y(y + 1)}H${X(x + 1)}` : `M${X(x)} ${Y(y)}H${X(x + 1)}`;
      if (u === EMPTY || u < SPINE) thick += seg; else thin += seg;   // outside wall / partition
    }
  }
  body += `<path d="${thick}" stroke="${INK}" stroke-width="${compact ? 1.4 : 2.2}" fill="none" stroke-linecap="square"/>`;
  body += `<path d="${thin}" stroke="${INK}" stroke-width="${compact ? 0.6 : 1}" fill="none"/>`;
  // doors: a gap in the wall, and the leaf's swing into the room
  for (const d of ds) {
    const hx = d.dx === 1 ? X(d.x + 1) : X(d.x), hy = d.dy === 1 ? Y(d.y + 1) : Y(d.y);
    const col = d.kind === "between" ? ACCENT : INK2, r = cell - 1.5, lw = compact ? 0.5 : 0.8;
    if (d.dx !== 0) {
      body += `<line x1="${hx}" y1="${hy + 1.5}" x2="${hx}" y2="${hy + cell - 1.5}" stroke="${PAPER}" stroke-width="3.5"/>`;
      const sx = hx, sy = hy + 1.5, ex = sx - d.dx * r, ey = sy + r, sweep = d.dx === 1 ? 1 : 0;
      body += `<path d="M${sx} ${sy}A${r} ${r} 0 0 ${sweep} ${ex} ${ey}" stroke="${col}" fill="none" stroke-width="${lw}"/><line x1="${sx}" y1="${sy}" x2="${ex}" y2="${sy}" stroke="${col}" stroke-width="${lw}"/>`;
    } else {
      body += `<line x1="${hx + 1.5}" y1="${hy}" x2="${hx + cell - 1.5}" y2="${hy}" stroke="${PAPER}" stroke-width="3.5"/>`;
      const sx = hx + 1.5, sy = hy, ex = sx + r, ey = sy - d.dy * r, sweep = d.dy === -1 ? 1 : 0;
      body += `<path d="M${sx} ${sy}A${r} ${r} 0 0 ${sweep} ${ex} ${ey}" stroke="${col}" fill="none" stroke-width="${lw}"/><line x1="${sx}" y1="${sy}" x2="${sx}" y2="${ey}" stroke="${col}" stroke-width="${lw}"/>`;
    }
  }
  // the entrance, from the left
  const ey0 = Y(spineY) + cell / 2, al = compact ? 8 : 22;
  body += `<path d="M${X(0) - al} ${ey0}H${X(0) - 2}M${X(0) - 6} ${ey0 - 3}L${X(0) - 2} ${ey0}L${X(0) - 6} ${ey0 + 3}" stroke="${INK}" fill="none"/>`;
  if (!compact) body += text(X(0) - 26, ey0 + 3, "in", 9, INK2, "end");
  // room numbers, on the cell nearest each room's centre
  for (const person of people) {
    const c = cs[person.id]; if (!c.n) continue;
    const [lx, ly] = labelCell(plan, person.id, c);
    body += text(X(lx + 0.5), Y(ly + 0.5) + (compact ? 2.2 : 3.5), String(person.id), compact ? 6 : 9, INK, "middle");
  }
  // scale bar: ten cells
  if (!compact) {
    const sbY = pad + gh + 22;
    body += `<line x1="${pad}" y1="${sbY}" x2="${pad + 10 * cell}" y2="${sbY}" stroke="${INK}" stroke-width="2"/>`;
    body += text(pad + 10 * cell + 8, sbY + 4, "10 units", 10, INK2);
  }
  if (withBlock) {
    const ty = pad + gh + 54;
    body += `<line x1="${pad}" y1="${ty - 14}" x2="${pad + gw}" y2="${ty - 14}" stroke="${RULE}"/>`;
    let y = ty;
    for (const [k, lines] of rows) {
      body += text(pad, y, k, 10, INK2);
      lines.forEach((line, i) => { body += text(pad + 90, y + i * 13, line, 10, INK); });
      y += lines.length * 13 + 5;
    }
    // the interview: each inhabitant's humours, and the sympathy matrix
    const tx = pad + gw - rightW, mx = pad + gw - n * sq, my = ty + 8;
    body += text(tx, ty, "interview", 8, INK2);
    body += text(tx, ty + 10, "id  s    e", 7, INK3);
    people.forEach((q, i) => {
      const stress = state.override ? state.override.stress : q.stress;
      body += text(tx, ty + 20 + i * 11, `${q.id}   ${stress.toFixed(2)} ${q.empathy.toFixed(2)}`, 7, INK);
    });
    body += text(mx + n * sq, ty, "sympathy", 8, INK2, "end");
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = i === j ? 0 : sympathy[i][j];
      body += `<rect x="${mx + j * sq}" y="${my + i * sq}" width="${sq - 1}" height="${sq - 1}" fill="${i === j ? PAPER2 : v > p.openness ? ACCENT : INK}" fill-opacity="${i === j ? 1 : (0.12 + 0.88 * v).toFixed(2)}"/>`;
    }
    for (let i = 0; i < n; i++) body += text(mx - 3, my + i * sq + 7, String(i), 7, INK2, "end");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="plan sheet, seed ${p.seed}, step ${state.t}">
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${RULE}"/>
${body}
</svg>
`;
}
