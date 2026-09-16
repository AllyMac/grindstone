// Browsers cap custom CSS cursor images (roughly 128x128 is the broadly
// supported ceiling; larger images are silently ignored, falling back to
// the next cursor in the list) - CSS itself has no way to resize one, so
// a full-size token image just never shows up as a cursor. This renders
// an actual thumbnail (center-cropped to square, like object-fit: cover)
// so the cursor has a real chance of rendering.
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image failed to load'))
    img.src = url
  })
}

export async function makeCursorThumbnail(imageUrl: string, size = 64): Promise<string | undefined> {
  try {
    const img = await loadImage(imageUrl)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - side) / 2
    const sy = (img.naturalHeight - side) / 2
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)

    // Throws if the source image's CORS headers taint the canvas -
    // caught below, callers fall back to the full-size URL instead.
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}
