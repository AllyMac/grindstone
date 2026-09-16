// Generates a simple placeholder token image (initials on a colored disc)
// for characters without their own imageUrl yet - image upload isn't
// built yet, so this keeps token placement usable in the meantime.
//
// OBR's addItems validation caps image.url at 2048 characters, which a
// base64 PNG blows through instantly (tens of KB for anything more than
// a few pixels). An inline SVG, URL-encoded rather than base64'd, stays
// a few hundred characters for a shape this simple - browsers rasterize
// an SVG data URL the same way as any other image format when it's
// loaded as a texture, so this is a drop-in swap.
export interface GeneratedTokenImage {
  url: string
  mime: string
  width: number
  height: number
}

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
  return letters.join('') || '?'
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function generateTokenImage(name: string): GeneratedTokenImage {
  const size = 256
  const fontSize = Math.round(size * 0.42)
  const label = escapeXml(initials(name))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="#57534e"/>` +
    `<text x="${size / 2}" y="${size / 2}" font-size="${fontSize}" font-family="sans-serif" ` +
    `fill="#f5f5f4" text-anchor="middle" dominant-baseline="central">${label}</text>` +
    `</svg>`

  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    mime: 'image/svg+xml',
    width: size,
    height: size,
  }
}
