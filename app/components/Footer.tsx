import Link from "next/link"

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900">Stock Buddy</h3>
            <p className="text-sm text-gray-600 mt-1">
              投資初心者のための資産運用サポート
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 mb-4 text-sm">
            <Link
              href="/privacy"
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              プライバシーポリシー
            </Link>
            <span className="text-gray-400">|</span>
            <Link
              href="/terms"
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              利用規約
            </Link>
            <span className="text-gray-400">|</span>
            <Link
              href="/disclaimer"
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              免責事項
            </Link>
          </div>

          <p className="text-xs text-gray-500">
            © 2026 Stock Buddy. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
