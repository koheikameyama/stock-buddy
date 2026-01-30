import { Suspense } from "react"
import WatchlistClient from "./WatchlistClient"

export const metadata = {
  title: "気になる銘柄 - Stock Buddy",
  description: "ウォッチリスト銘柄の買い時チェックと仮想購入シミュレーション",
}

export default function WatchlistPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          気になる銘柄
        </h1>
        <p className="text-gray-600">
          買い時をチェックして、仮想購入で練習してみましょう
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        }
      >
        <WatchlistClient />
      </Suspense>
    </div>
  )
}
