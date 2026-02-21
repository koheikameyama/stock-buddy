# 東証銘柄制限の表示追加 実装計画

ユーザーが、本アプリが現在「東京証券取引所（東証）」の銘柄に限定されていることを直感的に理解できるように、UI各所への注釈の追加を行います。

## 変更内容

### UIコンポーネント

#### [MODIFY] [AddStockDialog.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/AddStockDialog.tsx)

銘柄を追加する際の入力フィールド近くに、東証銘柄のみに対応している旨のヒントテキストを追加します。

- 検索入力欄の下またはプレースホルダーに「※現在は東証銘柄のみ対応しています（例: 7203）」といった文言を追加。

#### [MODIFY] [Footer.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/components/Footer.tsx)

アプリ全体のフッターに、対応市場に関する情報を追加します。

- 「対応市場: 東京証券取引所（順次拡大予定）」のような形式で表示。

#### [MODIFY] [page.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/page.tsx)

ランディングページのヒーローセクション、または機能説明部分に注釈を追加します。

- 未ログインユーザーが、最初から制限事項を把握できるようにします。

### ダッシュボード

#### [MODIFY] [dashboard/page.tsx](file:///Users/kouheikameyama/development/stock-buddy/app/dashboard/page.tsx) (必要に応じて)

ログイン後のトップ画面で、目立たない形で市場制限を表示します。

## 検証計画

### 手動確認

1.  ランディングページを開き、東証銘柄限定の表示があることを確認する。
2.  ログインし、ダッシュボードの表示を確認する。
3.  銘柄追加ボタンを押し、ダイアログ内に入力ガイド（東証限定）が表示されていることを確認する。
4.  フッターに市場情報が表示されていることを確認する。

### 自動テスト

- 現状、UIの文言確認に関する自動テストは存在しないため、手動確認を主とします。
