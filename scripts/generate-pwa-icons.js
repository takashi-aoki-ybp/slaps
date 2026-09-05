const path = require('path');
const { Jimp } = require('jimp');

async function generate(size) {
  const source = await Jimp.read(path.join(process.cwd(), 'assets', 'logo.png'));
  const width = Math.round(size * 0.72);
  source.resize({ w: width });
  const canvas = new Jimp({ width: size, height: size, color: 0x000000ff });
  const x = Math.round((size - source.bitmap.width) / 2);
  const y = Math.round((size - source.bitmap.height) / 2);
  canvas.composite(source, x, y);
  await canvas.write(path.join(process.cwd(), 'assets', `icon-${size}.png`));
}

Promise.all([generate(192), generate(512)]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
