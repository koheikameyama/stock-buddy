const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgBuffer = Buffer.from(`
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#2563eb" rx="64"/>
  <g transform="translate(100, 100)">
    <path d="M 50 250 L 100 150 L 150 200 L 200 100 L 250 180 L 300 50"
          stroke="white"
          stroke-width="20"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"/>
    <circle cx="100" cy="150" r="15" fill="white"/>
    <circle cx="150" cy="200" r="15" fill="white"/>
    <circle cx="200" cy="100" r="15" fill="white"/>
    <circle cx="250" cy="180" r="15" fill="white"/>
    <circle cx="300" cy="50" r="15" fill="white"/>
  </g>
</svg>
`);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function generateIcons() {
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`));
    console.log(`Generated icon-${size}x${size}.png`);
  }

  // Also create favicon
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, '../public/favicon.png'));
  console.log('Generated favicon.png');

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
