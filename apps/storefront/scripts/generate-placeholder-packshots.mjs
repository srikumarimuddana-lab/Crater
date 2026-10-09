// Generates marked SVG placeholder packshots (no real photography exists yet).
// Usage: node scripts/generate-placeholder-packshots.mjs public/products
// Palette: Forest & Gilt products on a flat studio backdrop (see docs/visual-contract.md).
// Illustrations only — not approved packaging.
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2];
if (!out) throw new Error('Pass the output directory, e.g. public/products');

const c = {
  forestDeep: '#0E2417', forest: '#14301F', forestHover: '#1F4430',
  glassGreen: '#2F5A43', glassAmber: '#7A4A22',
  gold: '#C9A86A', goldLight: '#E2CB97', goldDeep: '#8C6A2F',
  ivory: '#F7F2E8', espresso: '#2A1D15', walnut: '#5C4330',
  studio: '#EEE8DD', studioFloor: '#E6DED0',
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
    <linearGradient id="gilt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.goldDeep}"/><stop offset="0.45" stop-color="${c.goldLight}"/><stop offset="1" stop-color="${c.goldDeep}"/></linearGradient>
    <linearGradient id="glassShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.22"/><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></linearGradient>
    <radialGradient id="floorShadow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#2A1D15" stop-opacity="0.22"/><stop offset="1" stop-color="#2A1D15" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="800" height="1000" fill="${c.studio}"/>
  <rect y="668" width="800" height="332" fill="${c.studioFloor}"/>
  <ellipse cx="400" cy="672" rx="230" ry="26" fill="url(#floorShadow)"/>
  ${draw(name)}
  <text x="40" y="958" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="${c.walnut}">Placeholder illustration</text>
</svg>
`;
  fs.mkdirSync(path.join(out, handle), { recursive: true });
  fs.writeFileSync(path.join(out, handle, 'packshot.svg'), svg);
}
// Second view per product: a texture close-up (placeholder), same studio backdrop.
const textures = {
  'mineral-serum': `
    <ellipse cx="400" cy="560" rx="150" ry="110" fill="${c.glassGreen}" opacity="0.18"/>
    <path d="M400 330 C470 450 500 520 470 590 C445 650 355 650 330 590 C300 520 330 450 400 330 Z" fill="#F4EEDD" stroke="${c.goldDeep}" stroke-opacity="0.45" stroke-width="2"/>
    <ellipse cx="370" cy="560" rx="18" ry="34" fill="#FFFFFF" opacity="0.7"/>`,
  'cloud-cream': `
    <path d="M190 600 C260 470 380 500 420 560 C460 620 560 600 610 520 C640 640 520 700 400 690 C290 680 210 660 190 600 Z" fill="#F7F1E4" stroke="${c.goldDeep}" stroke-opacity="0.35" stroke-width="2"/>
    <path d="M300 600 C340 570 400 580 430 610" fill="none" stroke="${c.goldDeep}" stroke-opacity="0.3" stroke-width="3"/>`,
  'gel-cleanser': `
    <ellipse cx="400" cy="580" rx="190" ry="88" fill="${c.glassGreen}" opacity="0.32"/>
    <ellipse cx="410" cy="572" rx="120" ry="50" fill="${c.glassGreen}" opacity="0.22"/>
    <ellipse cx="340" cy="552" rx="34" ry="10" fill="#FFFFFF" opacity="0.55"/><circle cx="470" cy="600" r="9" fill="#FFFFFF" opacity="0.6"/>`,
  'balancing-toner': `
    <ellipse cx="400" cy="600" rx="210" ry="70" fill="${c.glassAmber}" opacity="0.2"/>
    <ellipse cx="400" cy="590" rx="150" ry="44" fill="${c.glassAmber}" opacity="0.28"/>
    <ellipse cx="350" cy="580" rx="40" ry="10" fill="#FFFFFF" opacity="0.5"/>`,
  'facial-mist': Array.from({ length: 26 }, (_, i) => {
    const x = 220 + ((i * 97) % 360), y = 420 + ((i * 53) % 260), r = 6 + (i % 4) * 3;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.glassGreen}" opacity="0.25"/><circle cx="${x - r / 3}" cy="${y - r / 3}" r="${r / 3}" fill="#FFFFFF" opacity="0.7"/>`;
  }).join(''),
  'lip-cheek-balm': `
    <circle cx="400" cy="560" r="190" fill="url(#gilt)"/>
    <circle cx="400" cy="560" r="160" fill="#B2614E" opacity="0.85"/>
    <path d="M300 520 C360 480 450 500 500 560" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="10" stroke-linecap="round"/>`,
};

for (const [handle, art] of Object.entries(textures)) {
  const name = names[handle];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000" role="img" aria-label="Illustration placeholder: ${esc(name)} texture">
  <title>Illustration placeholder: ${esc(name)} texture</title>
  <defs>
    <linearGradient id="gilt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.goldDeep}"/><stop offset="0.45" stop-color="${c.goldLight}"/><stop offset="1" stop-color="${c.goldDeep}"/></linearGradient>
  </defs>
  <rect width="800" height="1000" fill="${c.studio}"/>
  ${art}
  <text x="40" y="958" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="${c.walnut}">Placeholder illustration</text>
</svg>
`;
  fs.writeFileSync(path.join(out, handle, 'detail.svg'), svg);
}

console.log('wrote', Object.keys(shapes).length, 'packshots and', Object.keys(textures).length, 'detail views');
