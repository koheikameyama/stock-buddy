import type { Metadata, Viewport } from 'next'
import './globals.css'
import PWARegister from './components/PWARegister'
import GlobalChatWrapper from './components/GlobalChatWrapper'
import AdSense from './components/AdSense'
import GoogleAnalytics from './components/GoogleAnalytics'

export const metadata: Metadata = {
  title: 'Stock Buddy - AI投資アシスタント',
  description: '任せて学んで、一緒に増やす - AIに判断を任せながら、理由を理解できる投資',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Stock Buddy',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <meta name="google-adsense-account" content="ca-pub-7558679080857597" />
      </head>
      <body className="antialiased">
        <GoogleAnalytics />
        {children}
        <PWARegister />
        <GlobalChatWrapper />
        <AdSense />
      </body>
    </html>
  )
}
