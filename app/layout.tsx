import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SERPent',
  description: 'Research-first blog generation for SalesRobot',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
