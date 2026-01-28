import Link from "next/link"

export default function StockSelectionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-8 md:p-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block"
          >
            ← ホームに戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            取扱銘柄について
          </h1>
          <p className="text-gray-600">
            Stock Buddyでは、初心者の方でも安心して投資できるよう、厳選した銘柄のみを提案対象としています。
          </p>
        </div>

        {/* 概要 */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">📊 提案対象銘柄</h2>
          <div className="bg-blue-50 rounded-lg p-6 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-blue-600">154</p>
                <p className="text-sm text-gray-700">銘柄</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-blue-600">100%</p>
                <p className="text-sm text-gray-700">東証プライム</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-blue-600">1,000億円+</p>
                <p className="text-sm text-gray-700">時価総額</p>
              </div>
            </div>
          </div>
          <p className="text-gray-600 text-sm">
            日経225主要銘柄に加えて、少額予算でも購入できる低価格帯の優良銘柄を厳選しています。
          </p>
        </section>

        {/* 選定基準 */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">✓ 選定基準</h2>
          <div className="space-y-4">
            <div className="border-l-4 border-blue-600 pl-4">
              <h3 className="font-semibold text-gray-900 mb-1">1. 価格帯の補完</h3>
              <p className="text-sm text-gray-600">
                3万円、5万円、10万円など、様々な予算帯のユーザーに対応できるよう、
                幅広い価格帯の銘柄を選定しています。
              </p>
            </div>

            <div className="border-l-4 border-blue-600 pl-4">
              <h3 className="font-semibold text-gray-900 mb-1">2. 市場の流動性</h3>
              <p className="text-sm text-gray-600">
                東証プライム市場に上場し、1日の平均出来高が10万株以上の銘柄のみ。
                実際に買いやすく、売りやすい銘柄を選んでいます。
              </p>
            </div>

            <div className="border-l-4 border-blue-600 pl-4">
              <h3 className="font-semibold text-gray-900 mb-1">3. 企業の安定性</h3>
              <p className="text-sm text-gray-600">
                時価総額1,000億円以上、上場10年以上、過去3年で2年以上黒字または業界大手。
                初心者向けサービスとして、倒産リスクの高い銘柄は除外しています。
              </p>
            </div>

            <div className="border-l-4 border-blue-600 pl-4">
              <h3 className="font-semibold text-gray-900 mb-1">4. セクター分散</h3>
              <p className="text-sm text-gray-600">
                金融、通信、製造、小売、医薬品、エネルギーなど、主要セクターをバランスよくカバー。
                ポートフォリオ提案時のリスク分散を可能にしています。
              </p>
            </div>

            <div className="border-l-4 border-blue-600 pl-4">
              <h3 className="font-semibold text-gray-900 mb-1">5. 知名度・理解しやすさ</h3>
              <p className="text-sm text-gray-600">
                一般消費者が知っている企業・ブランドを優先。事業内容が明確でわかりやすい企業を選定し、
                初心者でも「この会社は何をしているか」理解できることを重視しています。
              </p>
            </div>
          </div>
        </section>

        {/* 銘柄構成 */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">📈 銘柄構成</h2>

          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">コア銘柄（日経225ベース）</h3>
            <p className="text-sm text-gray-600 mb-3">
              約120銘柄。大型株中心で、時価総額が大きく流動性が高い、知名度の高い銘柄。
            </p>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-700">
                <strong>例:</strong> トヨタ自動車、ソニーグループ、キーエンス、三菱UFJフィナンシャル・グループ、
                KDDI、ファーストリテイリング、任天堂、武田薬品工業、など
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">補完銘柄（低価格帯）</h3>
            <p className="text-sm text-gray-600 mb-3">
              約36銘柄。100株で3-10万円で購入可能な銘柄。少額投資に対応。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-800 mb-1">地方銀行・金融（5銘柄）</p>
                <p className="text-xs text-gray-600">安定配当、地域経済の代表</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-800 mb-1">電力・ガス（5銘柄）</p>
                <p className="text-xs text-gray-600">インフラ、高配当</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-800 mb-1">鉄道（8銘柄）</p>
                <p className="text-xs text-gray-600">安定収益、不動産事業</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-800 mb-1">小売・生活（7銘柄）</p>
                <p className="text-xs text-gray-600">身近で理解しやすい</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-800 mb-1">IT・通信（3銘柄）</p>
                <p className="text-xs text-gray-600">成長分野</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-800 mb-1">製造・化学（8銘柄）</p>
                <p className="text-xs text-gray-600">日本の基幹産業</p>
              </div>
            </div>
          </div>
        </section>

        {/* 価格帯別の特徴 */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">💰 価格帯別の特徴</h2>

          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">3万円以下（株価300円以下）</h3>
                <span className="text-sm text-gray-600">15-25銘柄</span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                <strong>典型的な業種:</strong> 地方銀行、電力会社、一部の小売・食品
              </p>
              <p className="text-sm text-gray-600">
                <strong>特徴:</strong> 配当利回りが高め（3-5%）、成長性は低いが安定、長期保有向き
              </p>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">5-10万円（株価500-1000円）</h3>
                <span className="text-sm text-gray-600">40-60銘柄</span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                <strong>典型的な業種:</strong> 大手銀行、通信キャリア、小売・食品大手、鉄道
              </p>
              <p className="text-sm text-gray-600">
                <strong>特徴:</strong> バランス型（配当+値上がり益）、初心者に人気のセクター
              </p>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">10万円以上（株価1000円以上）</h3>
                <span className="text-sm text-gray-600">80-120銘柄</span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                <strong>典型的な業種:</strong> 製造業大手（自動車、電機）、IT・ハイテク、製薬
              </p>
              <p className="text-sm text-gray-600">
                <strong>特徴:</strong> 成長性が期待できる、グローバル企業が多い、株価変動が大きめ
              </p>
            </div>
          </div>
        </section>

        {/* 除外基準 */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">❌ 除外基準</h2>
          <p className="text-sm text-gray-600 mb-4">
            以下の銘柄は、基準を満たしていても提案対象から除外しています：
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>・ボラティリティが極端に高い（過去1年で株価が50%以上変動）</li>
            <li>・流動性が極端に低い（1日の平均出来高が5万株未満）</li>
            <li>・財務状況が悪化している（3期連続赤字、債務超過など）</li>
            <li>・社会的に問題がある（不祥事が発覚して間もない、コンプライアンス違反）</li>
            <li>・複雑すぎる（持株会社で事業内容が多岐にわたり説明が困難）</li>
          </ul>
        </section>

        {/* メンテナンス */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">🔄 定期メンテナンス</h2>
          <p className="text-sm text-gray-600 mb-4">
            提案対象銘柄は、年2回（6月・12月）に見直しを行っています：
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>・財務状況の確認（赤字転落、債務超過など）</li>
            <li>・流動性の確認（出来高の推移）</li>
            <li>・上場廃止・統合の確認</li>
            <li>・セクター構成のバランス確認</li>
          </ul>
        </section>

        {/* フッター */}
        <div className="border-t pt-6">
          <p className="text-xs text-gray-500 mb-4">
            最終更新: 2026年1月29日
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
