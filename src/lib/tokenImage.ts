// Generates a simple placeholder token image (initials on a colored disc)
// for characters without their own imageUrl yet - image upload isn't
// built yet, so this keeps token placement usable in the meantime.
export interface GeneratedTokenImage {
  url: string
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

export function generateTokenImage(name: string): GeneratedTokenImage {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  ctx.fillStyle = '#57534e'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f5f5f4'
  ctx.font = `${Math.round(size * 0.42)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials(name), size / 2, size / 2 + size * 0.02)

  return { url: canvas.toDataURL('image/png'), width: size, height: size }
}
