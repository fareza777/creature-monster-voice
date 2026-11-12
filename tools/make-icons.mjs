// Generates Android launcher icons, adaptive-icon layers, splash screens and Play Store graphics
// from the vector artwork. Run: node tools/make-icons.mjs
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const RES = "android/app/src/main/res";
const icon = readFileSync("public/icon.svg");

const glyph = (scale = 1) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0fb47e"/><stop offset="1" stop-color="#6d4aff"/></linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -258)" filter="url(#glow)">
    <path d="M196 70h120M220 70v118L114 380a44 44 0 0 0 38 66h208a44 44 0 0 0 38-66L292 188V70" fill="none" stroke="url(#g)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M150 318c34-24 64 22 106 0s70-22 106 0l34 64a44 44 0 0 1-38 64H152a44 44 0 0 1-38-64z" fill="url(#g)"/>
    <circle cx="222" cy="374" r="20" fill="#05070d"/><circle cx="290" cy="374" r="20" fill="#05070d"/>
    <path d="M226 414l15 15 15-15 15 15 15-15" stroke="#05070d" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="300" cy="250" r="12" fill="#39ff88"/><circle cx="236" cy="210" r="8" fill="#a45bff"/>
  </g>
</svg>`;

const bg = (w, h) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><radialGradient id="bg" cx="50%" cy="38%" r="80%"><stop offset="0" stop-color="#1a1238"/><stop offset="0.6" stop-color="#0a0e18"/><stop offset="1" stop-color="#05070d"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
</svg>`;

const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, k] of Object.entries(dens)) {
  const dir = `${RES}/mipmap-${d}`;
  mkdirSync(dir, { recursive: true });
  const s = Math.round(48 * k);
  await sharp(icon).resize(s, s).png().toFile(`${dir}/ic_launcher.png`);
  const circle = Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#fff"/></svg>`);
  await sharp(icon).resize(s, s).composite([{ input: circle, blend: "dest-in" }]).png().toFile(`${dir}/ic_launcher_round.png`);
  const f = Math.round(108 * k);
  await sharp(Buffer.from(glyph(0.62))).resize(f, f).png().toFile(`${dir}/ic_launcher_foreground.png`);
}
writeFileSync(`${RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#05070D</color>\n</resources>\n`);

// splash screens (portrait and landscape)
const splash = async (w, h, out) => {
  const logo = Math.round(Math.min(w, h) * 0.42);
  const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round(h * 0.12)}"><text x="50%" y="45%" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="${Math.round(Math.min(w, h) * 0.055)}" letter-spacing="${Math.round(Math.min(w, h) * 0.008)}" fill="#f1f3ff">CREATURE VOICE STUDIO</text><text x="50%" y="85%" text-anchor="middle" font-family="Segoe UI, Arial" font-size="${Math.round(Math.min(w, h) * 0.03)}" fill="#39ff88">MONSTER VOICE LABORATORY</text></svg>`);
  const g = await sharp(Buffer.from(glyph(1))).resize(logo, logo).png().toBuffer();
  await sharp(Buffer.from(bg(w, h)))
    .composite([
      { input: g, left: Math.round((w - logo) / 2), top: Math.round(h * 0.5 - logo * 0.62) },
      { input: title, left: 0, top: Math.round(h * 0.5 + logo * 0.45) },
    ])
    .png()
    .toFile(out);
};
const port = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(port)) {
  await splash(w, h, `${RES}/drawable-port-${d}/splash.png`);
  await splash(h, w, `${RES}/drawable-land-${d}/splash.png`);
}
await splash(480, 800, `${RES}/drawable/splash.png`);

// Play Store graphics
mkdirSync("store", { recursive: true });
await sharp(icon).resize(512, 512).png().toFile("store/icon-512.png");
const fg = await sharp(Buffer.from(glyph(1))).resize(380, 380).png().toBuffer();
const feature = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <text x="420" y="215" font-family="Segoe UI, Arial" font-weight="900" font-size="58" fill="#f1f3ff" letter-spacing="3">CREATURE VOICE</text>
  <text x="420" y="285" font-family="Segoe UI, Arial" font-weight="900" font-size="58" fill="#a45bff" letter-spacing="3">STUDIO</text>
  <text x="422" y="335" font-family="Segoe UI, Arial" font-size="26" fill="#39ff88" letter-spacing="2">Monster Voice Laboratory · 100% offline</text>
</svg>`);
await sharp(Buffer.from(bg(1024, 500))).composite([{ input: fg, left: 30, top: 60 }, { input: feature, left: 0, top: 0 }]).png().toFile("store/feature-1024x500.png");
console.log("icons, splash screens and store graphics written");
