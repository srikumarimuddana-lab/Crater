// Generates marked SVG placeholder packshots (no real photography exists yet).
// Usage: node scripts/generate-placeholder-packshots.cjs public/products
const fs = require('node:fs');
const path = require('node:path');
const out = process.argv[2];
const ink = '#202C25', sage = '#738979', bronze = '#917254', mineral = '#D8E6D7', chalk = '#FFFFFF';

const label = (cx, y, name, w) => `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${Math.round(w * 0.62)}" rx="4" fill="${chalk}" opacity="0.92"/>
  <text x="${cx}" y="${y + w * 0.2}" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(w * 0.12)}" letter-spacing="3" fill="${ink}">CRATER</text>
  <line x1="${cx - w * 0.25}" y1="${y + w * 0.28}" x2="${cx + w * 0.25}" y2="${y + w * 0.28}" stroke="${bronze}" stroke-width="1.5"/>
  <text x="${cx}" y="${y + w * 0.42}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(w * 0.075)}" fill="${ink}">${name}</text>`;

const shapes = {
  'mineral-serum': (n) => `
    <rect x="352" y="300" width="96" height="70" rx="10" fill="${ink}"/>
    <rect x="374" y="250" width="52" height="56" rx="24" fill="${ink}" opacity="0.85"/>
    <rect x="300" y="365" width="200" height="300" rx="28" fill="${sage}" opacity="0.55"/>
    <rect x="300" y="365" width="200" height="300" rx="28" fill="none" stroke="${ink}" stroke-opacity="0.25" stroke-width="2"/>
    <rect x="318" y="385" width="22" height="250" rx="11" fill="${chalk}" opacity="0.35"/>
    ${label(400, 460, n, 150)}`,
  'cloud-cream': (n) => `
    <rect x="250" y="470" width="300" height="70" rx="14" fill="${ink}"/>
    <rect x="240" y="530" width="320" height="140" rx="30" fill="${chalk}" stroke="${ink}" stroke-opacity="0.2" stroke-width="2"/>
    ${label(400, 552, n, 160)}`,
  'gel-cleanser': (n) => `
    <rect x="360" y="580" width="80" height="85" rx="10" fill="${ink}"/>
    <path d="M320 250 L480 250 L470 590 Q400 610 330 590 Z" fill="${mineral}" stroke="${ink}" stroke-opacity="0.25" stroke-width="2"/>
    <rect x="318" y="240" width="164" height="18" rx="4" fill="${sage}"/>
    ${label(400, 380, n, 120)}`,
  'balancing-toner': (n) => `
    <rect x="365" y="250" width="70" height="80" rx="10" fill="${bronze}"/>
    <rect x="310" y="325" width="180" height="340" rx="22" fill="${mineral}" opacity="0.9" stroke="${ink}" stroke-opacity="0.25" stroke-width="2"/>
    <rect x="326" y="345" width="18" height="290" rx="9" fill="${chalk}" opacity="0.5"/>
    ${label(400, 450, n, 140)}`,
  'facial-mist': (n) => `
    <rect x="380" y="235" width="40" height="40" rx="8" fill="${ink}"/>
    <rect x="360" y="270" width="80" height="60" rx="12" fill="${ink}" opacity="0.85"/>
    <rect x="325" y="325" width="150" height="340" rx="70" fill="${sage}" opacity="0.45" stroke="${ink}" stroke-opacity="0.25" stroke-width="2"/>
    ${label(400, 440, n, 120)}`,
  'lip-cheek-balm': (n) => `
    <ellipse cx="400" cy="560" rx="150" ry="34" fill="${bronze}"/>
    <rect x="250" y="560" width="300" height="80" fill="${bronze}" opacity="0.85"/>
    <ellipse cx="400" cy="640" rx="150" ry="30" fill="${bronze}" opacity="0.85"/>
    <ellipse cx="400" cy="556" rx="118" ry="24" fill="${chalk}" opacity="0.9"/>
    <text x="400" y="562" text-anchor="middle" font-family="Georgia, serif" font-size="16" letter-spacing="3" fill="${ink}">CRATER · ${n.toUpperCase().replace("&AMP;", "&amp;")}</text>`,
};
const names = { 'mineral-serum': 'Mineral Serum', 'cloud-cream': 'Cloud Cream', 'gel-cleanser': 'Gel Cleanser', 'balancing-toner': 'Balancing Toner', 'facial-mist': 'Facial Mist', 'lip-cheek-balm': 'Lip &amp; Cheek Balm' };

for (const [handle, draw] of Object.entries(shapes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000" role="img" aria-label="Illustration placeholder: ${names[handle]}">
  <title>Illustration placeholder: ${names[handle]}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${chalk}"/><stop offset="1" stop-color="${mineral}"/></linearGradient>
    <radialGradient id="light" cx="0.7" cy="0.2" r="0.7"><stop offset="0" stop-color="${chalk}" stop-opacity="0.9"/><stop offset="1" stop-color="${chalk}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#bg)"/>
  <rect width="800" height="1000" fill="url(#light)"/>
  <ellipse cx="400" cy="672" rx="250" ry="40" fill="#E4E2D8"/>
  <rect x="150" y="672" width="500" height="150" fill="#E4E2D8"/>
  <ellipse cx="400" cy="822" rx="250" ry="40" fill="#D3D0C4"/>
  <ellipse cx="400" cy="672" rx="250" ry="40" fill="#ECEAE2"/>
  <ellipse cx="400" cy="668" rx="140" ry="16" fill="${ink}" opacity="0.12"/>
  ${draw(names[handle])}
  <rect x="24" y="22" width="752" height="44" rx="6" fill="${chalk}" opacity="0.85"/>
  <text x="400" y="51" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" letter-spacing="2" fill="${ink}">ILLUSTRATION PLACEHOLDER — NOT A PRODUCT PHOTO</text>
</svg>
`;
  fs.mkdirSync(path.join(out, handle), { recursive: true });
  fs.writeFileSync(path.join(out, handle, 'packshot.svg'), svg);
}
console.log('wrote', Object.keys(shapes).length, 'packshots');
