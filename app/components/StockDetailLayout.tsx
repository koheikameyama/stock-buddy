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
    <>
      <BackButton href={backHref} />
      <StockHeader
        name={name}
        tickerCode={tickerCode}
        sector={sector}
        badge={badge}
        badgeClassName={badgeClassName}
      />
      {children}
    </>
  )
}
