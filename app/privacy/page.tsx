import Link from "next/link"

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← ダッシュボードに戻る
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <article className="bg-white rounded-lg shadow-sm p-6 sm:p-8 prose prose-sm sm:prose max-w-none">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            プライバシーポリシー
          </h1>
          <p className="text-sm text-gray-600 mb-8">最終更新日: 2026年2月1日</p>

          <p>
            Stock Buddy（以下「本サービス」といいます）の提供にあたり、お客様の個人情報の保護に努めております。
          </p>

          <h2>1. 収集する情報</h2>
          <p>本サービスでは、以下の情報を収集します。</p>

          <h3>1.1 お客様が提供する情報</h3>
          <ul>
            <li>メールアドレス（Google認証経由）</li>
            <li>氏名（Google認証経由）</li>
            <li>プロフィール画像（Google認証経由）</li>
            <li>投資設定情報（予算、投資期間、リスク許容度）</li>
            <li>ポートフォリオ情報（保有銘柄、数量、取得単価）</li>
            <li>ウォッチリスト情報</li>
          </ul>

          <h3>1.2 自動的に収集される情報</h3>
          <ul>
            <li>アクセスログ（IPアドレス、ブラウザ情報、アクセス日時）</li>
            <li>Cookie情報</li>
            <li>利用状況データ（閲覧ページ、操作履歴）</li>
          </ul>

          <h2>2. 情報の利用目的</h2>
          <p>収集した情報は、以下の目的で利用します。</p>

          <h3>2.1 サービス提供のため</h3>
          <ul>
            <li>ユーザー認証</li>
            <li>AI分析による銘柄推奨</li>
            <li>パーソナライズされた投資アドバイス</li>
            <li>ポートフォリオ管理機能の提供</li>
          </ul>

          <h3>2.2 サービス改善のため</h3>
          <ul>
            <li>利用状況の分析</li>
            <li>新機能の開発</li>
            <li>バグ修正とセキュリティ向上</li>
          </ul>

          <h3>2.3 コミュニケーションのため</h3>
          <ul>
            <li>サービスに関する通知</li>
            <li>重要なお知らせの配信</li>
            <li>カスタマーサポート</li>
          </ul>

          <h2>3. 情報の第三者提供</h2>
          <p>
            当社は、以下の場合を除き、お客様の個人情報を第三者に提供しません。
          </p>
          <ul>
            <li>お客様の同意がある場合</li>
            <li>法令に基づく場合</li>
            <li>人の生命、身体または財産の保護のために必要がある場合</li>
          </ul>

          <h3>3.1 外部サービスの利用</h3>
          <p>本サービスは、以下の外部サービスを利用しています。</p>
          <ul>
            <li>
              <strong>Google OAuth</strong>: ユーザー認証
            </li>
            <li>
              <strong>OpenAI API</strong>: AI分析機能
            </li>
            <li>
              <strong>Railway</strong>: ホスティング
            </li>
          </ul>
          <p>各サービスのプライバシーポリシーもご参照ください。</p>

          <h2>4. 情報の保管と保護</h2>

          <h3>4.1 保管期間</h3>
          <ul>
            <li>アカウント情報: アカウント削除まで</li>
            <li>取引履歴: 法令に定める期間</li>
          </ul>

          <h3>4.2 セキュリティ対策</h3>
          <ul>
            <li>データの暗号化（通信時・保存時）</li>
            <li>アクセス制御</li>
            <li>定期的なセキュリティ監査</li>
          </ul>

          <h2>5. お客様の権利</h2>
          <p>お客様は、以下の権利を有します。</p>
          <ul>
            <li>個人情報の開示請求</li>
            <li>個人情報の訂正・削除請求</li>
            <li>利用停止請求</li>
            <li>アカウントの削除</li>
          </ul>

          <h2>6. Cookie（クッキー）の使用</h2>
          <p>本サービスは、以下の目的でCookieを使用します。</p>
          <ul>
            <li>ユーザー認証の維持</li>
            <li>サービス利用状況の分析</li>
            <li>ユーザー体験の向上</li>
          </ul>
          <p>
            Cookieの使用を望まない場合は、ブラウザの設定で無効化できますが、一部機能が利用できなくなる可能性があります。
          </p>

          <h2>7. 本ポリシーの変更</h2>
          <p>
            当社は、必要に応じて本ポリシーを変更することがあります。変更後のポリシーは、本サービス上で通知します。
          </p>

          <h2>8. お問い合わせ</h2>
          <p>
            個人情報の取り扱いに関するお問い合わせは、以下までご連絡ください。
          </p>
          <div className="bg-gray-50 p-4 rounded-lg mt-4">
            <p className="mb-1">Stock Buddy 個人情報保護担当</p>
            <p>メール: privacy@stock-buddy.net</p>
          </div>
        </article>
      </main>
    </div>
  )
}
