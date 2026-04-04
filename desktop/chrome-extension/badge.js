// Draw a green dot on the extension icon when connected

const SIZES = [16, 32, 48];

function createDotIcon(size, callback) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Load base icon
  fetch(`/icons/icon${size}.png`)
    .then(r => r.blob())
    .then(blob => createImageBitmap(blob))
    .then(img => {
      ctx.drawImage(img, 0, 0, size, size);

      // Draw green dot in bottom-right corner
      const dotRadius = Math.round(size * 0.18);
      const cx = size - dotRadius - 1;
      const cy = size - dotRadius - 1;

      // White outline
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius + 1, 0, Math.PI * 2);
      ctx.fillStyle = '#14120b';
      ctx.fill();

      // Green dot
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();

      const imageData = ctx.getImageData(0, 0, size, size);
      callback(size, imageData);
    })
    .catch(() => {});
}

export function setConnectedIcon() {
  const imageData = {};
  let done = 0;
  SIZES.forEach(size => {
    createDotIcon(size, (s, data) => {
      imageData[s] = data;
      done++;
      if (done === SIZES.length) {
        chrome.action.setIcon({ imageData });
      }
    });
  });
}

export function setDisconnectedIcon() {
  chrome.action.setIcon({
    path: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png' }
  });
}
