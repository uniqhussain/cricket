import { useEffect, useState } from 'react'
import type { Match, MatchPosterMetadata } from './match'
import { buildPosterData, type PosterSelection } from './poster-data'

export default function CopyScoreImage({ label, filename, match, metadata, selection }: {
  label: string
  filename: string
  match: Match
  metadata?: MatchPosterMetadata
  selection?: PosterSelection
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState<{ file: File; url: string }[]>([])
  useEffect(() => () => saved.forEach(item => URL.revokeObjectURL(item.url)), [saved])

  async function copy() {
    setBusy(true)
    setMessage('')
    setSaved([])
    try {
      const data = buildPosterData(match, metadata, selection)
      const pages = import('./render-scorecard-poster').then(({ renderPoster }) => renderPoster(data, filename))
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const png = pages.then(files => {
          if (files.length !== 1) throw new Error('Multiple images are available to share or save.')
          return files[0]
        })
        // Some browsers reject clipboard access before they read the promised PNG.
        void png.catch(() => {})
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
          setMessage('Image copied. Paste it into WhatsApp.')
          return
        } catch { /* Let the user share or save the PNG if clipboard access fails. */ }
      }
      const files = await pages
      setSaved(files.map(file => ({ file, url: URL.createObjectURL(file) })))
      setMessage(files.length === 1 ? 'Image ready. You can share or save it.'
        : 'This scorecard spans ' + files.length + ' images. Share or save the pages below.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare the image. Try again.')
    } finally { setBusy(false) }
  }

  const files = saved.map(item => item.file)
  async function share() {
    try { await navigator.share({ files }) }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Could not share. Save the image and attach it in WhatsApp.')
    }
  }

  return <div className="score-image-actions">
    <button type="button" className="score-copy-button" aria-label={label} title={label} disabled={busy} onClick={() => void copy()}>
      <span className="score-copy-icon" aria-hidden="true" />
    </button>
    {(busy || message) && <span className="score-copy-status" role="status">{busy ? 'Preparing image…' : message}</span>}
    {saved.length > 0 && <div className="actions">
      {navigator.canShare?.({ files }) && <button type="button" onClick={() => void share()}>{saved.length === 1 ? 'Share image' : 'Share pages'}</button>}
      {saved.map(({ file, url }, index) => <a key={file.name} href={url} download={file.name}>
        {saved.length === 1 ? 'Save image' : 'Save page ' + (index + 1)}
      </a>)}
    </div>}
  </div>
}
