import { ReactNode } from "react"
import BackButton from "./BackButton"
import StockHeader from "./StockHeader"

interface StockDetailLayoutProps {
  name: string
  tickerCode: string
  sector?: string | null
  badge?: string
  badgeClassName?: string
  backHref?: string
  children: ReactNode
}

export default function StockDetailLayout({
  name,
  tickerCode,
  sector,
  badge,
  badgeClassName,
  backHref = "/my-stocks",
  children,
}: StockDetailLayoutProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <BackButton href={backHref} />
        <StockHeader
          name={name}
          tickerCode={tickerCode}
          sector={sector}
          badge={badge}
          badgeClassName={badgeClassName}
        />
        {children}
      </div>
    </main>
  )
}
