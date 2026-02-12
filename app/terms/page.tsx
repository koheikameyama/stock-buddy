"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function TermsOfServicePage() {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(true)

  useEffect(() => {
    setCanGoBack(window.history.length > 1)
  }, [])

  const handleBack = () => {
    if (canGoBack) {
      router.back()
    } else {
      window.close()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <button
            onClick={handleBack}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            {canGoBack ? "← 戻る" : "× 閉じる"}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <article className="bg-white rounded-lg shadow-sm p-6 sm:p-8 prose prose-sm sm:prose max-w-none">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            利用規約
          </h1>
          <p className="text-sm text-gray-600 mb-8">最終更新日: 2026年2月1日</p>

          <h2>第1条（適用）</h2>
          <ol>
            <li>
              本利用規約（以下「本規約」といいます）は、Stock Buddy（以下「本サービス」といいます）の利用条件を定めるものです。
            </li>
            <li>
              本規約は、本サービスを利用するすべてのユーザー（以下「ユーザー」といいます）に適用されます。
            </li>
            <li>
              ユーザーは、本サービスを利用することにより、本規約に同意したものとみなされます。
            </li>
          </ol>

          <h2>第2条（定義）</h2>
          <p>本規約において使用する用語の定義は、以下のとおりとします。</p>
          <ol>
            <li>「本サービス」とは、当社が提供するStock Buddyおよびこれに関連するサービス一切を指します。</li>
            <li>「ユーザー」とは、本サービスを利用する個人を指します。</li>
            <li>「登録情報」とは、ユーザーが本サービスに登録した情報を指します。</li>
            <li>「投資設定」とは、予算、投資期間、リスク許容度等、ユーザーが本サービスで設定する情報を指します。</li>
            <li>「保有銘柄」とは、ユーザーが本サービスで管理する株式の保有情報を指します。</li>
          </ol>

          <h2>第3条（アカウント登録）</h2>
          <ol>
            <li>
              本サービスの利用を希望する方は、Google認証を通じてアカウント登録を行うものとします。
            </li>
            <li>
              ユーザーは、登録情報について、正確かつ最新の情報を提供するものとします。
            </li>
            <li>
              ユーザーは、自己の責任において、アカウント情報を適切に管理するものとします。
            </li>
          </ol>

          <h2>第4条（本サービスの内容）</h2>
          <p>本サービスは、以下の機能を提供します。</p>
          <ol>
            <li>AI分析による銘柄推奨機能</li>
            <li>保有銘柄管理機能</li>
            <li>気になる銘柄機能</li>
            <li>シミュレーション機能</li>
            <li>投資情報の提供</li>
          </ol>
          <p className="font-bold text-red-600 mt-4">
            ただし、本サービスは投資助言サービスではなく、投資判断はユーザー自身の責任において行うものとします。
          </p>

          <h2>第5条（免責事項）</h2>
          <ol>
            <li>
              <strong>投資助言の否定</strong><br />
              本サービスで提供される情報、分析、推奨は、あくまで参考情報であり、投資助言や投資勧誘を目的とするものではありません。
            </li>
            <li>
              <strong>投資リスクの認識</strong><br />
              ユーザーは、以下のリスクを理解し、自己の責任において投資判断を行うものとします。
              <ul>
                <li>投資元本が減少する可能性があること</li>
                <li>過去の実績は将来の結果を保証するものではないこと</li>
                <li>市場の変動により損失が発生する可能性があること</li>
              </ul>
            </li>
            <li>
              <strong>情報の正確性</strong><br />
              当社は、本サービスで提供する情報の正確性、完全性、有用性について保証するものではありません。
            </li>
            <li>
              <strong>サービスの中断・停止</strong><br />
              当社は、システムメンテナンス、障害、その他やむを得ない事由により、本サービスの全部または一部を予告なく中断・停止することがあります。
            </li>
            <li>
              <strong>損害賠償の制限</strong><br />
              当社は、本サービスの利用により生じた損害について、当社に故意または重過失がある場合を除き、一切の責任を負いません。
            </li>
          </ol>

          <h2>第6条（禁止事項）</h2>
          <p>ユーザーは、本サービスの利用にあたり、以下の行為を行ってはならないものとします。</p>
          <ol>
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>当社、他のユーザー、または第三者の知的財産権、肖像権、プライバシー、名誉その他の権利または利益を侵害する行為</li>
            <li>本サービスの運営を妨害するおそれのある行為</li>
            <li>不正アクセスまたはこれを試みる行為</li>
            <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
            <li>虚偽の情報を登録する行為</li>
            <li>本サービスの信用を毀損する行為</li>
            <li>その他、当社が不適切と判断する行為</li>
          </ol>

          <h2>第7条（利用制限）</h2>
          <p>当社は、ユーザーが以下のいずれかに該当する場合、事前の通知なく、本サービスの全部または一部の利用を制限することができます。</p>
          <ol>
            <li>本規約に違反した場合</li>
            <li>登録情報に虚偽があった場合</li>
            <li>支払いを遅延した場合（有料プランの場合）</li>
            <li>その他、当社が本サービスの利用を適当でないと判断した場合</li>
          </ol>

          <h2>第8条（知的財産権）</h2>
          <ol>
            <li>
              本サービスに関する知的財産権は、すべて当社または当社にライセンスを許諾している者に帰属します。
            </li>
            <li>
              ユーザーは、本サービスの利用により、何らの知的財産権も取得しないものとします。
            </li>
          </ol>

          <h2>第9条（本規約の変更）</h2>
          <ol>
            <li>
              当社は、必要に応じて本規約を変更することができます。
            </li>
            <li>
              変更後の規約は、本サービス上で通知した時点から効力を生じるものとします。
            </li>
            <li>
              ユーザーが変更後の規約に同意しない場合は、本サービスの利用を中止するものとします。
            </li>
          </ol>

          <h2>第10条（退会）</h2>
          <ol>
            <li>
              ユーザーは、いつでも本サービスから退会することができます。
            </li>
            <li>
              退会後、ユーザーのデータは当社のプライバシーポリシーに従って削除されます。
            </li>
          </ol>

          <h2>第11条（準拠法・管轄裁判所）</h2>
          <ol>
            <li>
              本規約の解釈にあたっては、日本法を準拠法とします。
            </li>
            <li>
              本サービスに関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </li>
          </ol>

          <h2>第12条（お問い合わせ）</h2>
          <p>本規約に関するお問い合わせは、以下までご連絡ください。</p>
          <div className="bg-gray-50 p-4 rounded-lg mt-4">
            <p className="mb-1">Stock Buddy カスタマーサポート</p>
            <p>メール: support@stock-buddy.net</p>
          </div>
        </article>
      </main>
    </div>
  )
}
