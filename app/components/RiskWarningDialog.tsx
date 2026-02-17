"use client"

interface RiskWarningDialogProps {
  isOpen: boolean
  warnings: string[]
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export default function RiskWarningDialog({
  isOpen,
  warnings,
  onConfirm,
  onCancel,
  loading = false,
}: RiskWarningDialogProps) {
  if (!isOpen || warnings.length === 0) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900">
            この銘柄にはリスクがあります
          </h2>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <ul className="space-y-2">
            {warnings.map((warning, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-amber-800">
                <span className="flex-shrink-0 mt-0.5">・</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          投資は自己責任です。上記リスクを理解した上で追加しますか？
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {loading ? "追加中..." : "追加する"}
          </button>
        </div>
      </div>
    </div>
  )
}
