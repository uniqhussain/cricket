import { headers } from 'next/headers'
import CricketApp from './cricket-app'

export default async function Page() {
  const userAgent = (await headers()).get('user-agent') ?? ''
  const androidWebView = /Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent)
  return <CricketApp loginRequired={androidWebView} />
}
