const fs = require('fs');
const path = require('path');

const files = [
  {
    src: path.join(__dirname, '..', 'src', 'electron', 'renderer', 'index.html'),
    dest: path.join(__dirname, '..', 'dist', 'electron', 'renderer', 'index.html'),
  },
];

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

files.forEach(file => {
  if (fs.existsSync(file.src)) {
    ensureDir(file.dest);
    fs.copyFileSync(file.src, file.dest);
  }
});

// Clean any stale icons (we no longer bundle a custom icon in CI)
const iconsDir = path.join(__dirname, '..', 'build', 'icons');
if (fs.existsSync(iconsDir)) {
  fs.rmSync(iconsDir, { recursive: true, force: true });
}
