// Generates marked SVG placeholder packshots (no real photography exists yet).
// Usage: node scripts/generate-placeholder-packshots.mjs public/products
// Palette: Forest & Gilt (see docs/visual-contract.md). Illustrations only — not approved packaging.
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2];
if (!out) throw new Error('Pass the output directory, e.g. public/products');

const c = {
  forestDeep: '#0E2417', forest: '#14301F', forestHover: '#1F4430',
  glassGreen: '#2F5A43', glassAmber: '#7A4A22',
  gold: '#C9A86A', goldLight: '#E2CB97', goldDeep: '#8C6A2F',
  ivory: '#F7F2E8', espresso: '#2A1D15',
  stoneTop: '#8A6A4F', stoneFace: '#6A4A32', stoneShade: '#4E3523',
};
const esc = (s) => s.replace(/&/g, '&amp;');

const label = (cx, y, name, w) => `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${Math.round(w * 0.66)}" rx="3" fill="${c.ivory}"/>
  <rect x="${cx - w / 2 + 5}" y="${y + 5}" width="${w - 10}" height="${Math.round(w * 0.66) - 10}" rx="2" fill="none" stroke="${c.gold}" stroke-width="1.5"/>
  <text x="${cx}" y="${y + w * 0.24}" text-anchor="middle" font-family="Didot, 'Bodoni 72', Georgia, serif" font-size="${Math.round(w * 0.12)}" letter-spacing="4" fill="${c.espresso}">CRATER</text>
  <path d="M${cx - w * 0.22} ${y + w * 0.32} H${cx + w * 0.22}" stroke="${c.goldDeep}" stroke-width="1.5"/>
  <text x="${cx}" y="${y + w * 0.47}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(w * 0.075)}" letter-spacing="1" fill="${c.espresso}">${esc(name)}</text>`;

// Glass body with a soft vertical highlight and gilt outline.
const glass = (x, y, w, h, r, tint) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${tint}" opacity="0.92"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#glassShade)"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${c.gold}" stroke-opacity="0.55" stroke-width="2"/>
  <rect x="${x + w * 0.1}" y="${y + 18}" width="${Math.max(10, w * 0.09)}" height="${h - 36}" rx="6" fill="${c.ivory}" opacity="0.22"/>`;

const shapes = {
  'mineral-serum': (n) => `
    <rect x="376" y="250" width="48" height="60" rx="22" fill="${c.espresso}"/>
    <rect x="350" y="302" width="100" height="66" rx="6" fill="url(#gilt)"/>
    ${glass(300, 365, 200, 300, 26, c.glassGreen)}
    ${label(400, 455, n, 150)}`,
  'cloud-cream': (n) => `
    <rect x="245" y="470" width="310" height="66" rx="8" fill="url(#gilt)"/>
    ${glass(238, 532, 324, 136, 26, c.glassAmber)}
    ${label(400, 548, n, 160)}`,
  'gel-cleanser': (n) => `
    <rect x="356" y="584" width="88" height="82" rx="8" fill="url(#gilt)"/>
    <path d="M320 250 L480 250 L470 590 Q400 606 330 590 Z" fill="${c.glassGreen}"/>
    <path d="M320 250 L480 250 L470 590 Q400 606 330 590 Z" fill="none" stroke="${c.gold}" stroke-opacity="0.55" stroke-width="2"/>
    <rect x="316" y="238" width="168" height="16" rx="3" fill="url(#gilt)"/>
    ${label(400, 380, n, 122)}`,
  'balancing-toner': (n) => `
    <rect x="362" y="250" width="76" height="82" rx="6" fill="url(#gilt)"/>
    ${glass(310, 326, 180, 340, 20, c.glassAmber)}
    ${label(400, 450, n, 140)}`,
  'facial-mist': (n) => `
    <rect x="382" y="232" width="36" height="40" rx="6" fill="${c.espresso}"/>
    <rect x="358" y="268" width="84" height="62" rx="8" fill="url(#gilt)"/>
    ${glass(325, 326, 150, 340, 68, c.glassGreen)}
    ${label(400, 440, n, 120)}`,
  'lip-cheek-balm': (n) => `
    <ellipse cx="400" cy="640" rx="150" ry="28" fill="${c.goldDeep}"/>
    <rect x="250" y="560" width="300" height="80" fill="url(#gilt)"/>
    <ellipse cx="400" cy="560" rx="150" ry="32" fill="${c.goldLight}"/>
    <ellipse cx="400" cy="558" rx="116" ry="22" fill="${c.ivory}"/>
    <text x="400" y="564" text-anchor="middle" font-family="Didot, 'Bodoni 72', Georgia, serif" font-size="15" letter-spacing="3" fill="${c.espresso}">CRATER · ${esc(n.toUpperCase())}</text>`,
};
const names = {
  'mineral-serum': 'Mineral Serum', 'cloud-cream': 'Cloud Cream', 'gel-cleanser': 'Gel Cleanser',
  'balancing-toner': 'Balancing Toner', 'facial-mist': 'Facial Mist', 'lip-cheek-balm': 'Lip & Cheek Balm',
};

for (const [handle, draw] of Object.entries(shapes)) {
  const name = names[handle];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000" role="img" aria-label="Illustration placeholder: ${esc(name)}">
  <title>Illustration placeholder: ${esc(name)}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.forestHover}"/><stop offset="0.7" stop-color="${c.forest}"/><stop offset="1" stop-color="${c.forestDeep}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.48" r="0.42"><stop offset="0" stop-color="${c.gold}" stop-opacity="0.34"/><stop offset="1" stop-color="${c.gold}" stop-opacity="0"/></radialGradient>
    <linearGradient id="gilt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.goldDeep}"/><stop offset="0.45" stop-color="${c.goldLight}"/><stop offset="1" stop-color="${c.goldDeep}"/></linearGradient>
    <linearGradient id="glassShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.25"/><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.stoneShade}"/><stop offset="0.4" stop-color="${c.stoneFace}"/><stop offset="1" stop-color="${c.stoneShade}"/></linearGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#bg)"/>
  <rect width="800" height="1000" fill="url(#glow)"/>
  <rect x="150" y="672" width="500" height="150" fill="url(#stone)"/>
  <ellipse cx="400" cy="822" rx="250" ry="40" fill="${c.stoneShade}"/>
  <ellipse cx="400" cy="672" rx="250" ry="40" fill="${c.stoneTop}"/>
  <ellipse cx="400" cy="672" rx="250" ry="40" fill="none" stroke="${c.gold}" stroke-opacity="0.6" stroke-width="2"/>
  <ellipse cx="400" cy="668" rx="140" ry="14" fill="#000" opacity="0.28"/>
  ${draw(name)}
  <rect x="24" y="22" width="752" height="44" rx="4" fill="${c.forestDeep}" opacity="0.85" stroke="${c.gold}" stroke-opacity="0.5"/>
  <text x="400" y="51" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="19" letter-spacing="2" fill="${c.goldLight}">ILLUSTRATION PLACEHOLDER — NOT A PRODUCT PHOTO</text>
</svg>
`;
  fs.mkdirSync(path.join(out, handle), { recursive: true });
  fs.writeFileSync(path.join(out, handle, 'packshot.svg'), svg);
}
console.log('wrote', Object.keys(shapes).length, 'packshots');
