# JPX銘柄マスタ同期エラーの修正計画

GitHub Actionsの `sync-jpx-master.yml` ワークフローで発生している `ModuleNotFoundError` を解決します。

## 背景

`sync-jpx-master` ジョブが失敗しており、原因は `sync_stock_master_from_jpx.py` が依存している `yfinance` ライブラリがインストールされていないためです。このスクリプトは `scripts/python/fetch_stock_prices.py` をインポートしており、そこで `yfinance` が使用されています。

## 提案される変更

### GitHub Actions ワークフロー

#### [MODIFY] [sync-jpx-master.yml](file:///Users/kouheikameyama/development/stock-buddy/.github/workflows/sync-jpx-master.yml)

`Install dependencies` ステップに `yfinance` を追加します。また、`yfinance` の動作を安定させるために `lxml` も追加します。

```diff
-        run: pip install requests pandas openpyxl xlrd psycopg2-binary
+        run: pip install requests pandas openpyxl xlrd psycopg2-binary yfinance lxml
```

## 検証計画

### 自動テスト

- 修正後のワークフローを GitHub Actions 上で実行（手動トリガーまたはスケジュール実行の待機）。
- `python scripts/jpx/sync_stock_master_from_jpx.py` をローカル環境で依存関係をインストールした状態で実行し、インポートエラーが出ないことを確認する。

### 手動確認

- GitHub Actions のログで `Sync JPX stock master` ステップが正常に終了することを確認。
- Slack 通知が `✅ JPX銘柄マスタの同期に成功しました` となることを確認。
