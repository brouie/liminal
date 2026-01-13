const fs = require('fs');
const path = require('path');

const iconPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABeUlEQVR4Xu3ZsUoDQRAG4BeCAiqLFBZFUCEkoRaSPoCX0D4gWgkZI+gA/ANsgiEAkpiSNYAUp8BCLlcHO9bde7Z3dnd2XeXuV5r06rXq/XAzw5z75zd1zbyW8E8xmPKzW0fvk/sdzCYwH8r2raXIiQunlslqY5T2r8j04YfGLmRoTSesFiAmyFDXL9uBebquGsyhQOdE31E4n4t4DccnE9vrFica8FWHQrQQizxgxYkWwaRM42QikIzeGWih/7gToYtL6vhfVqlWq/SXxPxqATnp5xpoE2mR7BncpsbR9f4DmqDveoxW48UUfZo0M0RKZrN8BIN66zCFAaj6MqFmoVoeAQMtk0iA0WIMRqjYOEwZ0TO+GfY+3CX6CPtFOZQ8oPZx/XD3RT5tne342/ueTN/OQv0svBLnBxxtB+rsoAhH2m6q+UpBAkLTlaX2UjsFvdcGaVbL50DJBSSTXobHxPPH/F+N6HfRQAt2bQVWwtIgAAAABJRU5ErkJggg==';

function writeIcon() {
  const outDir = path.join(__dirname, '..', 'build', 'icons');
  const outFile = path.join(outDir, 'icon.png');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(outFile, Buffer.from(iconPngBase64, 'base64'));
}

writeIcon();
