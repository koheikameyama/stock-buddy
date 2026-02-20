# マイ銘柄の現在価格表示問題の修正計画

## 概要

マイ銘柄（保有中リスト等）で現在価格が「価格情報なし」と表示される問題を修正します。
原因として、DBに保存されているティッカーコード（例: "7203"）とAPIから返されるコード（例: "7203.T"）の形式不一致により、フロントエンドで価格情報が正しくマッピングできていない可能性が高いです。

## ユーザーレビューが必要な項目

- 特になし（内部的な形式変換の改善のため）

## 提案される変更

### [Component: Store]

#### [MODIFY] [useAppStore.ts](file:///Users/kouheikameyama/development/stock-buddy/store/useAppStore.ts)

- `fetchStockPrices` 内で、APIから返却された価格情報（`.T` 付与済み）を、リクエストされた元のティッカーコード（`.T` なしの場合がある）にマッピングし直して `result` Map に格納するように修正します。
- これにより、`MyStocksClient.tsx` が `7203` でリクエストした場合でも、結果の Map から `7203` をキーとして価格が取り出せるようになります。

### [Component: Frontend]

#### [MODIFY] [MyStocksClient.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/MyStocksClient.tsx)

- 必要に応じて、`priceRecord` の構築時にキーの整合性が保たれるようにします。

#### [MODIFY] [StockCard.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/StockCard.tsx)

- `prices` から取得する際のキーを確実にするため、フォールバックの仕組み（`/\\.T$/` の有無の両方をチェック）を念のため追加します。

## 検証計画

### 自動テスト

- なし

### 手動検証

- ローカル環境で「マイ銘柄」画面を開き、現在価格が正しく表示されることを確認します。
- 損益計算が正しく行われていることを確認します。
