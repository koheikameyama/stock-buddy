export default function MaintenanceMode() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="text-6xl mb-6">🔧</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          メンテナンス中
        </h1>
        <p className="text-gray-600 mb-6 leading-relaxed">
          現在、システムのメンテナンスを実施しています。
          <br />
          しばらくお待ちください。
        </p>
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            💡 メンテナンス終了後、再度アクセスしてください
          </p>
        </div>
        <div className="mt-6 text-xs text-gray-500">
          Stock Buddy
        </div>
      </div>
    </div>
  )
}
