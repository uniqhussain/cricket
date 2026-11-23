export async function preparePlayerPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG or WebP photo.')
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a photo smaller than 8 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 256 / Math.max(image.width, image.height))
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is unavailable. Please retry.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function uploadPlayerPhoto(preview: string): Promise<string> {
  const file = await (await fetch(preview)).blob()
  const form = new FormData()
  form.set('photo', file, 'player.jpg')
  const response = await fetch('/api/player-photos', { method: 'POST', body: form })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Could not upload photo.')
  if (typeof result.photo !== 'string' || !result.photo.startsWith('/api/player-photos?')) {
    throw new Error('Invalid photo upload response.')
  }
  return result.photo
}
