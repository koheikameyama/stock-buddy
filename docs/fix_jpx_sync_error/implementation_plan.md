# JPX銘柄マスタ同期エラーの修正計画（サフィックス修正・インポートエラー対応）

GitHub Actionsおよびローカル実行時に発生している課題を解決します。

## 課題

1. 名古屋証券取引所のサフィックスが `.NG` となっていますが、`yfinance` では `.NX` が正解です。
2. スクリプト実行時に `ModuleNotFoundError: No module named 'scripts'` などのインポートエラーが発生することがあります。

## 提案される変更

### 1. サフィックスの修正

#### [MODIFY] [fetch_stock_prices.py](file:///Users/kouheikameyama/development/stock-buddy/scripts/python/fetch_stock_prices.py)

`.NG` を `.NX` に変更します。

#### [MODIFY] [sync_stock_master_from_jpx.py](file:///Users/kouheikameyama/development/stock-buddy/scripts/jpx/sync_stock_master_from_jpx.py)

コメント内の `.NG` を `.NX` に変更（整合性のため）。

### 2. インポートエラーの解決（パス通しの統一）

#### [NEW] `__init__.py` の追加

以下のディレクトリに `__init__.py` を作成し、パッケージとして認識されるようにします。

- `scripts/__init__.py`
- `scripts/python/__init__.py`
- `scripts/jpx/__init__.py`
- `scripts/lib/__init__.py`

#### [MODIFY] [sync_stock_master_from_jpx.py](file:///Users/kouheikameyama/development/stock-buddy/scripts/jpx/sync_stock_master_from_jpx.py)

#### [MODIFY] [scrape_stocks.py](file:///Users/kouheikameyama/development/stock-buddy/scripts/jpx/scrape_stocks.py)

プロジェクトルートを `sys.path` に追加する処理を導入し、インポートを `scripts.xxx` 形式に統一するか、一貫性のある方法に変更します。

## 検証計画

### 1. ローカル実行確認

- 以下のコマンドがエラーなく実行できることを確認します。
  ```bash
  export DATABASE_URL="xxx"
  python scripts/jpx/sync_stock_master_from_jpx.py
  ```

### 2. GitHub Actions

- 修正をプッシュし、Actions 上でジョブが完走することを確認します。
