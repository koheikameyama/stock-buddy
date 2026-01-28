import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Stock Buddy
          </h1>
          <p className="text-2xl md:text-3xl text-gray-700 mb-4">
            任せて学んで、一緒に増やす
          </p>
          <p className="text-xl text-gray-600 mb-12">
            AIに判断を任せながら、理由を理解できる投資
          </p>

          <Link
            href="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors"
          >
            無料で始める
          </Link>
        </div>

        {/* Features Section */}
        <div className="mt-24 grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-white p-8 rounded-lg shadow-md">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold mb-3">毎日のレポート</h3>
            <p className="text-gray-600">
              AIが市場を分析し、あなたのポートフォリオに合わせた投資判断を毎日お届けします。
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-md">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-bold mb-3">AI分析</h3>
            <p className="text-gray-600">
              テクニカル指標と市場動向をAIが総合的に分析。初心者でも理解できる説明付き。
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-md">
            <div className="text-4xl mb-4">💡</div>
            <h3 className="text-xl font-bold mb-3">学びながら投資</h3>
            <p className="text-gray-600">
              なぜその判断なのか、AIが理由を丁寧に説明。投資の知識が自然と身につきます。
            </p>
          </div>
        </div>

        {/* How it works Section */}
        <div className="mt-24 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">使い方はシンプル</h2>
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">
                1
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Googleでログイン</h3>
                <p className="text-gray-600">
                  Googleアカウントでかんたんログイン。面倒な登録は不要です。
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">
                2
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">投資スタイルを設定</h3>
                <p className="text-gray-600">
                  予算や投資期間、リスク許容度を入力。AIがあなたに合った銘柄を提案します。
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">
                3
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">毎日レポートを受け取る</h3>
                <p className="text-gray-600">
                  市場クローズ後、AIが分析した投資判断レポートが届きます。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-24 text-center bg-blue-600 text-white py-16 rounded-2xl">
          <h2 className="text-3xl font-bold mb-4">今日から始める、賢い投資</h2>
          <p className="text-xl mb-8">無料でStock Buddyを試してみませんか？</p>
          <Link
            href="/login"
            className="inline-block bg-white text-blue-600 hover:bg-gray-100 font-bold py-4 px-8 rounded-lg text-lg transition-colors"
          >
            無料で始める
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-24">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-gray-400 text-sm">© 2026 Stock Buddy. All rights reserved.</p>
            <div className="flex space-x-6">
              <Link href="/about/stock-selection" className="text-gray-400 hover:text-white text-sm transition-colors">
                取扱銘柄について
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
