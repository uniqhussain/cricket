'use client'

import { useEffect, useRef, useState } from 'react'
import type { Match, MatchPosterMetadata } from './match'
import { buildPosterData, type PosterData } from './poster-data'
import '@fontsource-variable/geist'
import './poster.css'

type PosterImages = { data: PosterData; files: File[]; urls: string[] }

export default function PosterExport({ match, metadata }: { match: Match; metadata?: MatchPosterMetadata }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const download = useRef<HTMLAnchorElement>(null)
  const running = useRef(0)
  const [images, setImages] = useState<PosterImages>()
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  useEffect(() => () => { running.current++ }, [])
  useEffect(() => () => { images?.urls.forEach(url => URL.revokeObjectURL(url)) }, [images])
  useEffect(() => {
    try { setResult(buildPosterData(match, metadata).result) }
    catch { setResult('') }
  }, [match, metadata])

  async function generate() {
    dialog.current?.showModal()
    const generation = ++running.current
    setBusy(true)
    setImages(undefined)
    setPage(0)
    setError('')
    setMessage('')
    setManualCopy(false)
    try {
      const data = buildPosterData(match, metadata)
      const { renderPoster } = await import('./render-scorecard-poster')
      const files = await renderPoster(data)
      if (running.current === generation) setImages({ data, files, urls: files.map(file => URL.createObjectURL(file)) })
    } catch (error) {
      if (running.current === generation)
        setError(error instanceof Error ? error.message : 'The poster could not be generated. Try again.')
    } finally {
      if (running.current === generation) setBusy(false)
    }
  }

  async function share() {
    if (!images) return
    setMessage('')
    const payload = { files: images.files, title: 'Turf Cricket scorecard' }
    try {
      if (navigator.share && navigator.canShare?.({ files: images.files })) {
        await navigator.share(payload)
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
    download.current?.click()
    setMessage(images.files.length > 1
      ? 'This page was downloaded. Download the other pages and attach them in WhatsApp.'
      : 'The PNG was downloaded. Attach it in WhatsApp.')
  }

  async function copyText() {
    if (!images) return
    try {
      await navigator.clipboard.writeText(images.data.text)
      setMessage('Text scorecard copied.')
    } catch {
      setMessage('Select and copy the text scorecard below.')
      setManualCopy(true)
    }
  }

  return <section aria-label="Completed match poster">
    {result && <h2>{result}</h2>}
    <div className="actions">
      <button type="button" onClick={() => void generate()} disabled={busy}>Generate WhatsApp Poster</button>
      {images && <button type="button" onClick={() => dialog.current?.showModal()}>Preview Poster</button>}
    </div>
    <dialog ref={dialog} className="poster-dialog" aria-labelledby="poster-preview-title">
      <header className="poster-dialog-header">
        <h2 id="poster-preview-title">WhatsApp scorecard poster</h2>
        <button type="button" className="poster-dialog-close" onClick={() => dialog.current?.close()}>Close</button>
      </header>
      {busy && <p role="status">Generating scorecard…</p>}
      {error && <><p role="alert" className="error">{error}</p>
        <button type="button" onClick={() => void generate()}>Generate Scorecard</button></>}
      {images && <>
        <div className="actions poster-dialog-toolbar">
          <a className="poster-download" ref={download} href={images.urls[page]} download={images.files[page].name}>Download PNG</a>
          <button type="button" onClick={() => void share()}>Share to WhatsApp</button>
          <button type="button" onClick={() => void copyText()}>Copy Text Scorecard</button>
        </div>
        {message && <p role="status">{message}</p>}
        {manualCopy && <textarea className="poster-text-fallback" aria-label="Text scorecard" readOnly
          value={images.data.text} onFocus={event => event.currentTarget.select()} />}
        {images.files.length > 1 && <div className="poster-pagination">
          <button type="button" onClick={() => setPage(page - 1)} disabled={page === 0}>Previous</button>
          <span role="status">Page {page + 1} of {images.files.length}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page + 1 === images.files.length}>Next</button>
        </div>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="poster-preview" src={images.urls[page]} width="1080" height="1920"
          alt={images.data.teams.join(' vs ') + ' scorecard, page ' + (page + 1)} />
      </>}
    </dialog>
  </section>
}
