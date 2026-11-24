import type { ReactNode } from 'react'
import type { Viewport } from 'next'
import './style.css'

export const metadata = { title: 'Turf Cricket', description: 'Ball-by-ball turf cricket scoring' }
export const viewport: Viewport = { themeColor: '#0e1917', width: 'device-width', initialScale: 1 }

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
