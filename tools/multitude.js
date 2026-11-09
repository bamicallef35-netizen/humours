// A contact sheet of plans from many interviews:  node tools/multitude.js [count] [firstSeed]
// Twelve inhabitants' groups, twelve plans: the same rules, different humours.
import { writeFileSync, mkdirSync } from "node:fs";
import { run } from "../docs/humours.js";
import { planSheet } from "../docs/sheet.js";
const count = Number(process.argv[2] || 12), first = Number(process.argv[3] || 1);
const cols = 3, cell = 5, pad = 48;
const tiles = [];
for (let i = 0; i < count; i++) {
  const seed = first + i, state = run({ seed });
  const inner = planSheet(state, { compact: true, cell });
  const m = inner.match(/viewBox="0 0 (\d+) (\d+)"/), w = Number(m[1]), h = Number(m[2]);
  const mean = (k) => state.people.reduce((s, q) => s + q[k], 0) / state.people.length;
  tiles.push({ seed, w, h, svg: inner.replace(/^<svg [^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<rect width="\d+" height="\d+" fill="#ffffff"\/>\n<rect x="0.5" y="0.5"[^>]*\/>/, ""), caption: `seed ${seed} / stress ${mean("stress").toFixed(2)} / empathy ${mean("empathy").toFixed(2)}` });
}
const tw = tiles[0].w + 16, th = tiles[0].h + 26, rows = Math.ceil(count / cols);
const W = pad * 2 + cols * tw, H = pad * 2 + rows * th + 40;
let body = "";
tiles.forEach((t, i) => {
  const x = pad + (i % cols) * tw, y = pad + 24 + Math.floor(i / cols) * th;
  body += `<g transform="translate(${x} ${y})">${t.svg}<text x="${10}" y="${t.h + 10}" font-family="IBM Plex Mono, ui-monospace, Menlo, monospace" font-size="9" fill="#6b6b6b">${t.caption}</text></g>`;
});
const FONT = "IBM Plex Mono, ui-monospace, Menlo, monospace";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="a multitude: ${count} plans from ${count} interviews">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#d4d4d4"/>
<text x="${pad}" y="${pad - 14}" font-family="${FONT}" font-size="10" fill="#6b6b6b">multitude / ${count} plans, seeds ${first}–${first + count - 1} / the same rules, different humours</text>
<text x="${W - pad}" y="${pad - 14}" font-family="${FONT}" font-size="10" fill="#6b6b6b" text-anchor="end">benmicallef / humours / drawn by the model</text>
${body}
</svg>
`;
mkdirSync("media", { recursive: true });
writeFileSync("media/multitude.svg", svg);
console.error(`wrote media/multitude.svg — ${count} plans, ${W}×${H}`);
