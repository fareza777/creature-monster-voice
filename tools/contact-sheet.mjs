// Tiles preview PNGs into one image: node tools/contact-sheet.mjs out.png cols a.png b.png ...
import sharp from "sharp";

const [out, colsArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg) || 4;
const W = 360, H = 450;
const tiles = await Promise.all(files.map((f) => sharp(f).resize(W, H).toBuffer()));
const rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: "#ffffff" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * W, top: Math.floor(i / cols) * H })))
  .png()
  .toFile(out);
console.log(out);
