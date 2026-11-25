import type { PosterData, PosterSection, PosterTable } from './poster-data'

export const posterWidth = 1080
export const posterHeight = 1920
export const stadiumBackground = '/cricket-poster-stadium.webp'

function Trophy() {
  return <svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true">
    <path fill="#ffe67d" d="M13 5h22v5h8v4c0 8-5 13-12 14-1 2-3 3-5 4v6h7v5H15v-5h7v-6c-2-1-4-2-5-4C10 27 5 22 5 14v-4h8zm22 9c0 3-1 6-2 9 4-2 6-5 6-9zm-26 0c0 4 2 7 6 9-1-3-2-6-2-9z" />
  </svg>
}

function StatTable({ table, hideTitle }: { table: PosterTable; hideTitle?: boolean }) {
  return <div className={'poster-stat poster-stat-' + table.id}>
    {(!hideTitle || table.continued) && <h3>{table.title}{table.continued && ' · continued'}</h3>}
    <div className="poster-rows">
      <table aria-label={table.title}>
        <thead><tr>{table.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{table.rows.map(([name, ...values]) => <tr key={name}>
          <th scope="row">{name}</th>
          {values.map((value, index) => <td className={table.id === 'impact'
            ? [index === values.length - 1 && 'poster-total', value.startsWith('+') && 'poster-positive',
              value.startsWith('−') && 'poster-negative'].filter(Boolean).join(' ') : undefined} key={index}>{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}

export default function ScorecardPoster({ data, sections, compact, page, pageCount }: {
  data: PosterData; sections: PosterSection[]; compact?: boolean; page?: number; pageCount?: number
}) {
  const title = data.teams.join(' vs ')
  return <article aria-label={title + ' match scorecard'} className={'cricket-poster' + (compact ? ' cricket-poster-compact' : '')}>
    {/* Keep the local image in the rendered tree so it is embedded in the PNG. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="poster-stadium" src={stadiumBackground} alt="" width={posterWidth} height={posterHeight} />
    <div className="poster-content">
      <header className="poster-header">
        <div className="poster-brand">Turf Cricket</div>
        <h1>{data.teams[0]} <span>vs</span> {data.teams[1]}</h1>
        {data.metadata.map(item => <p key={item}>{item}</p>)}
        <div className="poster-label">Match scorecard</div>
        <div className="poster-result">{data.result}</div>
      </header>
      <div className="poster-cards">
        {sections.map(section => <div className="poster-card" key={section.title}>
          {section.innings ? <div className="poster-innings">
            <div className="poster-team">
              <div className="poster-kicker">{section.title}</div>
              <h2>{section.innings.battingTeam} batting</h2>
            </div>
            <div className="poster-score"><strong>{section.innings.score}</strong><span>{section.innings.overs} overs</span></div>
            <div className="poster-extras">Extras <strong>{section.innings.extras}</strong></div>
          </div> : <h2 className="poster-impact-title"><Trophy />{section.title}</h2>}
          {section.award && <div className="poster-award">
            <div><strong>{section.award.label}</strong>
              {section.award.performance && <p>{section.award.performance.join('  |  ')}</p>}
              <p>{section.award.baselines}</p>
            </div>
            <b>{section.award.points}</b>
          </div>}
          {section.tables.map(table => <StatTable key={table.id} table={table} hideTitle={table.id === 'batting'} />)}
          {section.note && <p className="poster-note">{section.note}</p>}
        </div>)}
      </div>
    </div>
    {pageCount !== undefined && pageCount > 1 && <footer className="poster-footer">Detailed scorecard · {page} / {pageCount}</footer>}
  </article>
}
