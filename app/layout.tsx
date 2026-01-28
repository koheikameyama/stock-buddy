import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stock Buddy - AI投資アシスタント',
  description: '任せて学んで、一緒に増やす - AIに判断を任せながら、理由を理解できる投資',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  )
}
