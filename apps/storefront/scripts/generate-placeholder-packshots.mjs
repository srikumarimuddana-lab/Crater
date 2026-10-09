// Generates marked SVG placeholder packshots (no real photography exists yet).
// Usage: node scripts/generate-placeholder-packshots.mjs public/products
// Herbal catalogue (docs/catalogue.md): amber glass dropper bottles, pump body oils and a kit box,
// on a flat studio backdrop. Illustrations only — not approved packaging or labels.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('Pass the output directory, e.g. public/products');

const c = {
  studio: '#EEE8DD', studioFloor: '#E6DED0',
  amber: '#7A4A1E', amberDeep: '#4E2E12', amberLight: '#A8692E',
  forest: '#14301F', forestHover: '#1F4430', espresso: '#2A1D15', walnut: '#5C4330',
  gold: '#C9A86A', goldLight: '#E2CB97', goldDeep: '#8C6A2F', ivory: '#F7F2E8',
  kraft: '#C9A57A', kraftDeep: '#A88457', leaf: '#4F6B4A',
};
const esc = (s) => s.replace(/&/g, '&amp;');

// Each product: format, label band colour, short label line.
const products = {
  'lemon-balm-oat-extract': { title: 'Lemon Balm & Oat Extract', format: 'tincture', band: c.forest },
  'peppermint-ginger-extract': { title: 'Peppermint & Ginger Extract', format: 'tincture', band: c.forestHover },
  'chamomile-linden-extract': { title: 'Chamomile & Linden Extract', format: 'tincture', band: c.goldDeep },
  'hawthorn-rose-hip-extract': { title: 'Hawthorn & Rose Hip Extract', format: 'tincture', band: c.walnut },
  'dandelion-root-extract': { title: 'Dandelion Root Extract', format: 'single', band: c.leaf },
  'nettle-leaf-extract': { title: 'Nettle Leaf Extract', format: 'single', band: c.leaf },
  'calendula-almond-body-oil': { title: 'Calendula & Almond Body Oil', format: 'oil', band: c.goldDeep },
  'lavender-jojoba-body-oil': { title: 'Lavender & Jojoba Body Oil', format: 'oil', band: c.forest },
  'evening-ritual-kit': { title: 'Evening Ritual Kit', format: 'kit', band: c.forest },
};

const defs = `
  <defs>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.amberDeep}"/><stop offset="0.35" stop-color="${c.amberLight}"/><stop offset="0.6" stop-color="${c.amber}"/><stop offset="1" stop-color="${c.amberDeep}"/></linearGradient>
    <linearGradient id="gilt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.goldDeep}"/><stop offset="0.45" stop-color="${c.goldLight}"/><stop offset="1" stop-color="${c.goldDeep}"/></linearGradient>
    <radialGradient id="floorShadow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#2A1D15" stop-opacity="0.24"/><stop offset="1" stop-color="#2A1D15" stop-opacity="0"/></radialGradient>
  </defs>`;

const backdrop = `
  <rect width="800" height="1000" fill="${c.studio}"/>
  <rect y="668" width="800" height="332" fill="${c.studioFloor}"/>
  <ellipse cx="400" cy="672" rx="240" ry="26" fill="url(#floorShadow)"/>`;

const marker = `<text x="40" y="958" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="${c.walnut}">Placeholder illustration</text>`;

// Paper label with a coloured band and the product name (wrapped onto two lines when long).
function label(cx, y, w, h, title, band) {
  const words = title.split(' ');
  const mid = Math.ceil(words.length / 2);
  const lines = title.length > 18 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [title];
  const fs1 = Math.round(w * 0.085);
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c.ivory}"/>
  <rect x="${cx - w / 2}" y="${y + h * 0.72}" width="${w}" height="${h * 0.12}" fill="${band}"/>
  <text x="${cx}" y="${y + h * 0.2}" text-anchor="middle" font-family="Didot, 'Bodoni 72', Georgia, serif" font-size="${Math.round(w * 0.11)}" letter-spacing="4" fill="${c.espresso}">CRATER</text>
  ${lines.map((l, i) => `<text x="${cx}" y="${y + h * (0.4 + i * 0.13)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fs1}" fill="${c.espresso}">${esc(l)}</text>`).join('')}
  <text x="${cx}" y="${y + h * 0.95}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(w * 0.07)}" fill="${c.walnut}">SAMPLE</text>`;
}

function dropperBottle(cx, base, scale, title, band) {
  const w = 170 * scale, h = 250 * scale;
  const top = base - h;
  return `
  <rect x="${cx - 22 * scale}" y="${top - 150 * scale}" width="${44 * scale}" height="${70 * scale}" rx="${20 * scale}" fill="${c.espresso}"/>
  <rect x="${cx - 38 * scale}" y="${top - 86 * scale}" width="${76 * scale}" height="${62 * scale}" rx="${6 * scale}" fill="url(#gilt)"/>
  <rect x="${cx - 30 * scale}" y="${top - 28 * scale}" width="${60 * scale}" height="${34 * scale}" fill="${c.amberDeep}"/>
  <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${30 * scale}" fill="url(#glass)"/>
  <rect x="${cx - w / 2 + 14 * scale}" y="${top + 18 * scale}" width="${12 * scale}" height="${h - 40 * scale}" rx="${6 * scale}" fill="#FFFFFF" opacity="0.18"/>
  ${label(cx, top + h * 0.22, w * 0.8, h * 0.6, title, band)}`;
}

function pumpBottle(cx, base, scale, title, band) {
  const w = 160 * scale, h = 340 * scale;
  const top = base - h;
  return `
  <rect x="${cx - 8 * scale}" y="${top - 150 * scale}" width="${16 * scale}" height="${70 * scale}" fill="${c.espresso}"/>
  <path d="M${cx - 8 * scale} ${top - 150 * scale} h${-50 * scale} v${18 * scale} h${58 * scale} z" fill="${c.espresso}"/>
  <rect x="${cx - 30 * scale}" y="${top - 84 * scale}" width="${60 * scale}" height="${46 * scale}" rx="${6 * scale}" fill="${c.espresso}"/>
  <rect x="${cx - 36 * scale}" y="${top - 40 * scale}" width="${72 * scale}" height="${40 * scale}" rx="${5 * scale}" fill="url(#gilt)"/>
  <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${24 * scale}" fill="url(#glass)"/>
  <rect x="${cx - w / 2 + 14 * scale}" y="${top + 18 * scale}" width="${12 * scale}" height="${h - 40 * scale}" rx="${6 * scale}" fill="#FFFFFF" opacity="0.18"/>
  ${label(cx, top + h * 0.25, w * 0.82, h * 0.5, title, band)}`;
}

function kitBox(title) {
  return `
  ${dropperBottle(300, 520, 0.62, 'Extract', c.forest)}
  ${dropperBottle(400, 520, 0.62, 'Extract', c.goldDeep)}
  ${pumpBottle(505, 520, 0.5, 'Body Oil', c.forest)}
  <path d="M170 470 L630 470 L610 690 L190 690 Z" fill="${c.kraft}"/>
  <path d="M170 470 L630 470 L640 440 L160 440 Z" fill="${c.kraftDeep}"/>
  <rect x="300" y="530" width="200" height="110" rx="3" fill="${c.ivory}"/>
  <rect x="300" y="610" width="200" height="12" fill="${c.forest}"/>
  <text x="400" y="565" text-anchor="middle" font-family="Didot, 'Bodoni 72', Georgia, serif" font-size="22" letter-spacing="4" fill="${c.espresso}">CRATER</text>
  <text x="400" y="595" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="${c.espresso}">${esc(title)}</text>`;
}

const scaleFor = { tincture: 1, single: 1, oil: 1, kit: 1 };

function packshot(p) {
  if (p.format === 'kit') return kitBox(p.title);
  if (p.format === 'oil') return pumpBottle(400, 670, scaleFor.oil, p.title, p.band);
  return dropperBottle(400, 670, scaleFor.tincture, p.title, p.band);
}

// Second view: texture / ingredient close-up placeholders per format.
function detail(p) {
  if (p.format === 'oil')
    return `
  <ellipse cx="400" cy="580" rx="200" ry="80" fill="${c.goldLight}" opacity="0.55"/>
  <ellipse cx="410" cy="572" rx="120" ry="44" fill="${c.gold}" opacity="0.45"/>
  <ellipse cx="350" cy="556" rx="36" ry="10" fill="#FFFFFF" opacity="0.6"/>`;
  if (p.format === 'kit')
    return `
  <rect x="190" y="380" width="420" height="320" rx="6" fill="${c.kraft}"/>
  <rect x="220" y="410" width="360" height="260" rx="4" fill="${c.kraftDeep}" opacity="0.5"/>
  <circle cx="300" cy="540" r="52" fill="url(#gilt)"/><circle cx="400" cy="540" r="52" fill="url(#gilt)"/><circle cx="500" cy="540" r="44" fill="${c.espresso}"/>`;
  if (p.format === 'single')
    return `
  <path d="M400 760 C400 640 400 520 400 360" stroke="${c.leaf}" stroke-width="6" fill="none"/>
  ${[0, 1, 2, 3].map((i) => {
    const y = 420 + i * 85;
    return `<path d="M400 ${y} C350 ${y - 40} 300 ${y - 30} 280 ${y - 70} C330 ${y - 70} 380 ${y - 50} 400 ${y}" fill="${c.leaf}" opacity="0.8"/><path d="M400 ${y + 30} C450 ${y - 10} 500 ${y} 520 ${y - 40} C470 ${y - 40} 420 ${y - 20} 400 ${y + 30}" fill="${c.leaf}" opacity="0.65"/>`;
  }).join('')}`;
  // Tincture: a glass pipette releasing drops.
  return `
  <rect x="380" y="200" width="40" height="70" rx="18" fill="${c.espresso}"/>
  <rect x="390" y="270" width="20" height="230" rx="10" fill="${c.amberLight}" opacity="0.55"/>
  <path d="M390 500 L410 500 L402 540 L398 540 Z" fill="${c.amberLight}" opacity="0.7"/>
  ${[0, 1, 2].map((i) => `<path d="M400 ${590 + i * 70} C412 ${606 + i * 70} 414 ${618 + i * 70} 400 ${626 + i * 70} C386 ${618 + i * 70} 388 ${606 + i * 70} 400 ${590 + i * 70} Z" fill="${c.amber}" opacity="${0.85 - i * 0.2}"/>`).join('')}`;
}

function svg(title, body, suffix) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000" role="img" aria-label="Illustration placeholder: ${esc(title)}${suffix}">
  <title>Illustration placeholder: ${esc(title)}${suffix}</title>${defs}
  ${backdrop}
  ${body}
  ${marker}
</svg>
`;
}

for (const [handle, p] of Object.entries(products)) {
  fs.mkdirSync(path.join(out, handle), { recursive: true });
  fs.writeFileSync(path.join(out, handle, 'packshot.svg'), svg(p.title, packshot(p), ''));
  fs.writeFileSync(path.join(out, handle, 'detail.svg'), svg(p.title, detail(p), ' texture'));
}
console.log('wrote', Object.keys(products).length, 'packshots and detail views');
