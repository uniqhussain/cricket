import { useEffect, useState } from 'react'
import { renderScoreImage, type ScoreImage } from './score-image'

export default function CopyScoreImage({ label, filename, image }: {
  label: string
  filename: string
  image: ScoreImage
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState<{ file: File; url: string }>()
  useEffect(() => () => { if (saved) URL.revokeObjectURL(saved.url) }, [saved])

  async function copy() {
    setBusy(true)
    setMessage('')
    setSaved(undefined)
    try {
      const png = renderScoreImage(image)
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
          setMessage('Image copied. Paste it into WhatsApp.')
          return
        } catch { /* Let the user share or save the PNG if clipboard access fails. */ }
      }
      const blob = await png
      const file = new File([blob], filename, { type: 'image/png' })
      setSaved({ file, url: URL.createObjectURL(blob) })
      setMessage('Image ready. You can share or save it.')
    } catch {
      setMessage('Could not prepare the image. Try again.')
    } finally { setBusy(false) }
  }

  async function share(file: File) {
    try { await navigator.share({ files: [file] }) }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Could not share. Save the image and attach it in WhatsApp.')
    }
  }

  return <div className="score-image-actions">
    <button type="button" className="score-copy-button" aria-label={label} title={label} disabled={busy} onClick={() => void copy()}>
      <span className="score-copy-icon" aria-hidden="true" />
    </button>
    {(busy || message) && <span className="score-copy-status" role="status">{busy ? 'Preparing image…' : message}</span>}
    {saved && <div className="actions">
      {navigator.canShare?.({ files: [saved.file] }) && <button type="button" onClick={() => void share(saved.file)}>Share image</button>}
      <a href={saved.url} download={filename}>Save image</a>
    </div>}
  </div>
}
