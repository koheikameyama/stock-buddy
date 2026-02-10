"use client"

import { useState, useEffect } from "react"

interface EditWatchlistDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  stockId: string
  stockName: string
  addedReason: string | null | undefined
  note: string | null | undefined
}

export default function EditWatchlistDialog({
  isOpen,
  onClose,
  onSuccess,
  stockId,
  stockName,
  addedReason: initialAddedReason,
  note: initialNote,
}: EditWatchlistDialogProps) {
  const [addedReason, setAddedReason] = useState(initialAddedReason || "")
  const [note, setNote] = useState(initialNote || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setAddedReason(initialAddedReason || "")
      setNote(initialNote || "")
      setError(null)
    }
  }, [isOpen, initialAddedReason, initialNote])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const body: { addedReason?: string | null; note?: string | null } = {}

      body.addedReason = addedReason || null
      body.note = note || null

      const response = await fetch(`/api/user-stocks/${stockId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "更新に失敗しました")
      }

      onSuccess()
    } catch (err: unknown) {
      console.error(err)
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("更新に失敗しました")
      }
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            ウォッチリストを編集
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Stock Info */}
        <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-bold text-gray-900">{stockName}</h3>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Added Reason */}
          <div>
            <label
              htmlFor="addedReason"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              注目理由
            </label>
            <textarea
              id="addedReason"
              value={addedReason}
              onChange={(e) => setAddedReason(e.target.value)}
              placeholder="例: 成長性が高そう、配当が魅力的"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Note */}
          <div>
            <label
              htmlFor="note"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              メモ
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="自由にメモを残せます"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "更新中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
