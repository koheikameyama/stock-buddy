# TP/SL設定モーダルのUI改善 - 完了

ユーザーが利確（TP）および損切り（SL）のラインを設定する際、平均取得単価を基準とした「％」指定をメインにしつつ、連動して「価格」もリアルタイムに表示・変換されるように改善しました。

## 変更内容

### 1. モーダルUIの刷新

- **リアルタイム変換**: ％を入力すると目標価格が、価格を入力すると％がそれぞれ即座に計算・表示されます。
- **視認性の向上**: 平均取得単価を上部に表示し、現在の価格からどれくらいの利益（または損失）が出るかを目安として表示するようにしました。
- 対象ファイル: [IndividualSettingsModal.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/IndividualSettingsModal.tsx)

### 2. 呼び出し元の更新

- 平均取得単価（`avgPurchasePrice`）をモーダルに渡すように各クライアントコンポーネントを更新しました。
- 対象ファイル:
  - [MyStockDetailClient.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/%5Bid%5D/MyStockDetailClient.tsx)
  - [MyStocksClient.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/MyStocksClient.tsx)

## 検証結果

### 動作確認

- [x] ％（利益率・損失率）を入力すると、目標価格が正しく計算されること。
- [x] 逆に価格を直接入力しても、％の表示が正しく更新されること。
- [x] 平均取得単価や損益目安（¥）が表示され、判断しやすくなっていること。
- [x] 保存後に設定値が正しく反映されること。

> [!TIP]
> ％入力欄は `step="0.1"` を設定しており、細かい調整も可能です。利確は「+」、損切りは「-」の数値を入れることで、直感的に目標ラインを管理できます。
