import type { ReactNode } from 'react'
import './style.css'

export const metadata = { title: 'Turf Cricket', description: 'Ball-by-ball turf cricket scoring' }

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
