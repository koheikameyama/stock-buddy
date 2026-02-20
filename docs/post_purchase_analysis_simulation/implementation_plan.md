# モーダルUIの最終調整計画

モーダルの閉じるボタンをスクロールに追従せず固定表示にし、シミュレーションモードでは不要な再分析ボタンを非表示にします。

## 変更内容

### app/my-stocks/[id]/MyStockDetailClient.tsx

#### [MODIFY] [MyStockDetailClient.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/[id]/MyStockDetailClient.tsx)

1. モーダルの背景とコンテンツの構造を調整します。
2. `max-h-[90vh]` を持つコンテナを `flex flex-col` にし、中身を `overflow-y-auto` にすることで、そのコンテナ内で `absolute` 配置されている閉じるボタンがスクロールしても動き回らない（またはスクロール領域外に留まる）ようにします。

### app/components/StockAnalysisCard.tsx

#### [MODIFY] [StockAnalysisCard.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/components/StockAnalysisCard.tsx)

1. ヘッダー内の再分析ボタン（「更新」または「今すぐ分析する」アイコンボタン）を、`isSimulation` が true の場合には表示しないように修正します。

## 検証プラン

### 手動確認

1. シミュレーションボタンをクリックしてモーダルを開く。
2. モーダル内のコンテンツをスクロールした際、右上の「✕」ボタンがその場に固定されていることを確認する。
3. モーダル内のヘッダー右側に再分析ボタンが表示されていないことを確認する。
