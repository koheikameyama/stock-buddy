# マイ銘柄の現在価格表示問題の修正報告

## 変更内容

マイ銘柄（保有中・気になる銘柄）のリストで現在価格が正しく表示されない問題を修正しました。

### 1. ストアの修正 ([useAppStore.ts](file:///Users/kouheikameyama/development/stock-buddy/store/useAppStore.ts))

- APIから返される `.T` 付きのコードと、リクエスト時のコード（DB保存のサフィックスなし）の両方を価格 Map のキーとして保持するようにしました。これにより、どちらの形式でも価格が取得可能になりました。

### 2. コンポーネントの修正 ([StockCard.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/StockCard.tsx))

- 価格取得のロジックをカプセル化し、より安全に `currentPrice` を取り出せるようにガードを追加しました。

### 3. クライアントの修正 ([MyStocksClient.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/MyStocksClient.tsx))

- 追跡銘柄（tracked stocks）のフェッチ処理においても、ティッカーコードの正規化（`.T` の除去）を考慮したマッピング処理を追加しました。

## 検証結果

- **原因の再現**: DB内の `7203` と API返却の `7203.T` が一致しないため、フロントエンドで `prices['7203']` が `undefined` になることを確認。
- **修正の確認**: ストアおよびクライアント側でマッピングを二重（`.T` あり/なし）で持つようにしたことで、表示が復旧します。
