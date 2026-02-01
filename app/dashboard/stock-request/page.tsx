import { Metadata } from "next"
import StockRequestClient from "./StockRequestClient"

export const metadata: Metadata = {
  title: "銘柄リクエスト | Stock Buddy",
  description: "取り扱っていない銘柄の追加をリクエストできます",
}

export default function StockRequestPage() {
  return <StockRequestClient />
}
