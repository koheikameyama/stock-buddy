# 銘柄ティッカーサフィックスの自動判別と取得効率の最適化計画

## 現状の課題

- 日本株の市場（.T, .NG など）を判別するために現在 sequential なリトライ（.T で試してダメなら .NG）を行っていますが、これは銘柄数が増えると非効率です。
- `yfinance` の `.info` は非常に遅いため、一括取得 (`yf.download` や `yf.Tickers().history()`) を活用することで、判別と株価取得の両方を高速化できます。

## 変更内容（新方針：一括取得による市場判別と高速化）

### 1. 株価取得スクリプトの刷新

#### [MODIFY] [fetch_stock_prices.py](file:///Users/kouheikameyama/development/stock-buddy/scripts/python/fetch_stock_prices.py)

- `fetch_single_price` による並列処理から、`yf.download` または `yf.Tickers` を使った**バルク処理**に移行します。
- **効率的な市場判別**:
  - 判別が必要な銘柄（サフィックスが不明なもの）に対し、候補（`.T`, `.NG`）をすべて含めた一括リクエストを投げます。
  - `yf.download(tickers, period='2d')` を実行し、データが存在する（NaNでない）サフィックスを「正しい市場」として特定します。
- **取得データの統合**:
  - `history(period='2d')` を使うことで、現時点の価格 (`Close` の最終値) と前日終値 (`Close` の1つ前の値) を一度に取得でき、`.info` を個別に呼ぶ必要がなくなります。
  - 高値、安値、出来高も同時に取得可能です。

### 2. 市場判別ロジックの利用（登録時）

#### [CHECK] [stock-requests/route.ts](file:///Users/kouheikameyama/development/stock-buddy/app/api/stock-requests/route.ts)

- 既に実装済みの登録時の市場判別フローが、上記スクリプトの高速化によってよりスムーズになります。
- ユーザーが `7203` と入力した場合、バックエンドで `[7203.T, 7203.NG]` を一括確認し、ヒットした方を即座にDBに保存します。

### 3. 検索APIおよび全体への波及効果

- 検索時のリアルタイム株価表示も、一括取得への移行によりレスポンス速度が大幅に向上します。

## 検証計画

- `yf.download` が `info` よりも高速であることを確認。
- `.T` と `.NG` の同時リクエストで、正しい方のみが抽出されることを確認。
- 前日終値、騰落率などが正しく計算されていることを確認。
