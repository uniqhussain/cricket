import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { getFontEmbedCSS, toBlob } from 'html-to-image'
import ScorecardPoster, { posterHeight, posterWidth, stadiumBackground } from './scorecard-poster'
import type { PosterData, PosterSection, PosterTable } from './poster-data'

const maxCombinedHeight = 4096
const bottomPadding = 55

function paginate(sections: PosterSection[], fits: (page: PosterSection[]) => boolean) {
  const pages: PosterSection[][] = []
  let page: PosterSection[] = []
  function add(section: PosterSection, table?: PosterTable) {
    const last = page.at(-1)
    if (last?.title === section.title && table)
      return [...page.slice(0, -1), { ...last, tables: [...last.tables, table] }]
    return [...page, { ...section, tables: table ? [table] : [] }]
  }
  function nextPage() {
    if (page.length) pages.push(page)
    page = []
  }
  for (const section of sections) {
    if (!section.tables.length) {
      if (!fits(add(section))) nextPage()
      page = add(section)
    }
    for (const table of section.tables) {
      let start = 0
      while (start < table.rows.length) {
        const candidate = (end: number) => add(section, { ...table, rows: table.rows.slice(start, end), continued: start > 0 })
        if (fits(candidate(table.rows.length))) {
          page = candidate(table.rows.length)
          break
        }
        if (!fits(candidate(start + 1))) {
          if (!page.length) throw new Error('A scorecard row is too large to fit on a poster page.')
          nextPage()
          continue
        }
        let low = start + 1
        let high = table.rows.length
        while (high - low > 1) {
          const mid = Math.floor((low + high) / 2)
          if (fits(candidate(mid))) low = mid
          else high = mid
        }
        page = candidate(low)
        nextPage()
        start = low
      }
    }
  }
  nextPage()
  return pages
}

export async function renderPoster(data: PosterData, filename = 'turf-cricket-scorecard'): Promise<File[]> {
  const background = new Image()
  background.src = stadiumBackground
  await Promise.all([background.decode(), document.fonts.load('800 28px "Geist Variable"')])
  const stage = document.createElement('div')
  stage.className = 'poster-render-stage'
  stage.setAttribute('aria-hidden', 'true')
  document.body.append(stage)
  const root = createRoot(stage)
  function draw(sections: PosterSection[], compact: boolean, page?: number, pageCount?: number) {
    flushSync(() => root.render(<ScorecardPoster data={data} sections={sections} compact={compact} page={page} pageCount={pageCount} />))
    return stage.firstElementChild as HTMLElement
  }
  function fits(article: HTMLElement) {
    return requiredHeight(article) <= article.getBoundingClientRect().height
  }
  function requiredHeight(article: HTMLElement) {
    const content = article.querySelector('.poster-content')!
    return Math.ceil(content.getBoundingClientRect().bottom - article.getBoundingClientRect().top + bottomPadding)
  }
  try {
    let pages = [data.sections]
    let height = posterHeight
    const compact = !fits(draw(data.sections, false))
    if (compact) {
      const needed = requiredHeight(draw(data.sections, true))
      if (!data.label && needed <= maxCombinedHeight) height = Math.max(posterHeight, needed)
      else if (needed > posterHeight) pages = paginate(data.sections, sections => fits(draw(sections, true)))
    }
    const fontEmbedCSS = await getFontEmbedCSS(draw(pages[0], compact))
    if (!fontEmbedCSS.includes('data:')) throw new Error('The poster font could not be loaded.')
    const files: File[] = []
    for (const [index, sections] of pages.entries()) {
      const article = draw(sections, compact, index + 1, pages.length)
      article.style.height = height + 'px'
      if (!fits(article)) throw new Error('A scorecard page is too large to export.')
      const png = await toBlob(article, {
        width: posterWidth, height, pixelRatio: 1, fontEmbedCSS, type: 'image/png',
      })
      if (!png?.size) throw new Error('The PNG could not be created.')
      const suffix = pages.length > 1 ? '-page-' + (index + 1) : ''
      files.push(new File([png], filename + suffix + '.png', { type: 'image/png' }))
    }
    return files
  } finally {
    root.unmount()
    stage.remove()
  }
}
