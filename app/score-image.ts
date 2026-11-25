type Table = { title: string; columns: string[]; rows: string[][] }
export type ScoreImage = { title: string; match: string; highlight: string; notes?: string[]; tables: Table[] }

export function renderScoreImage({ title, match, highlight, notes = [], tables }: ScoreImage): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const width = 960
  const margin = 36
  const inner = width - 2 * margin
  canvas.width = width
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Could not draw the scorecard.'))

  function paint() {
    const g = ctx!
    let y = margin
    function text(value: string, size: number, color: string, bold = false, x = margin, maxWidth = inner) {
      g.font = (bold ? '700 ' : '400 ') + size + 'px system-ui, sans-serif'
      g.textBaseline = 'top'
      g.fillStyle = color
      const lines = value.split('\n').flatMap(paragraph => {
        const rows: string[] = []
        let row = ''
        for (const word of paragraph.split(/\s+/)) {
          const next = row ? row + ' ' + word : word
          if (row && g.measureText(next).width > maxWidth) { rows.push(row); row = word }
          else row = next
        }
        return [...rows, row]
      })
      lines.forEach(line => {
        g.fillText(line, x, y, maxWidth)
        y += size + 7
      })
    }

    g.fillStyle = '#101d18'
    g.fillRect(0, 0, width, canvas.height)
    text('TURF CRICKET', 20, '#a3efbe', true)
    y += 8
    text(title, 38, '#f0f8f4', true)
    text(match, 24, '#c0d5ca')
    y += 8
    text(highlight, 28, '#a3efbe', true)
    notes.forEach(note => text(note, 20, '#c0d5ca'))

    for (const table of tables) {
      y += 20
      text(table.title, 26, '#f0f8f4', true)
      const numberWidth = Math.min(120, Math.floor(inner * .63 / (table.columns.length - 1)))
      const labelWidth = inner - numberWidth * (table.columns.length - 1)

      for (const [index, row] of [table.columns, ...table.rows].entries()) {
        const top = y
        function cells() {
          y = top + 10
          text(row[0], 21, '#f0f8f4', true, margin + 10, labelWidth - 20)
          const end = y
          row.slice(1).forEach((cell, column) => {
            g.font = (index === 0 ? '700 ' : '400 ') + '21px system-ui, sans-serif'
            g.fillStyle = index === 0 ? '#a3efbe' : '#f0f8f4'
            g.textAlign = 'right'
            g.fillText(cell, margin + labelWidth + (column + 1) * numberWidth - 10, top + 10, numberWidth - 12)
            g.textAlign = 'left'
          })
          return end + 5
        }
        const end = cells()
        g.fillStyle = index === 0 ? '#294538' : index % 2 ? '#192b22' : '#20352a'
        g.fillRect(margin, top, inner, end - top)
        y = cells()
      }
    }
    return y + margin
  }

  canvas.height = paint()
  paint()
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob)
    else reject(new Error('Could not create the scorecard image.'))
  }, 'image/png'))
}
