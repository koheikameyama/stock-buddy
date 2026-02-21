# 東証銘柄制限の表示追加 完了報告

ユーザーが現状「東証銘柄」に限定されていることを把握できるよう、UI各所に注釈とバッジを追加しました。

## 変更内容

### UIの変更

#### 1. ヘッダー (アプリ全体)

ロゴの横に「東証限定」のバッジを追加しました。常に現状の対応範囲を認識できるようになります。
render_diffs(file:///Users/kouheikameyama/development/stock-buddy/app/components/Header.tsx)

#### 2. 銘柄追加ダイアログ

検索フィールドのプレースホルダーを「東証銘柄コード...」に変更し、入力欄の下に補足テキストを追加しました。
render_diffs(file:///Users/kouheikameyama/development/stock-buddy/app/my-stocks/AddStockDialog.tsx)

#### 3. ランディングページ

ヒーローセクションの説明文の下に、東証銘柄のみに対応している旨の注釈を追加しました。
render_diffs(file:///Users/kouheikameyama/development/stock-buddy/app/page.tsx)

#### 4. フッター (共通)

対応市場として「東京証券取引所（順次拡大予定）」の情報を追加しました。
render_diffs(file:///Users/kouheikameyama/development/stock-buddy/app/components/Footer.tsx)

## 検証結果

- [x] 各画面で意図した通りにテキストが表示されていることをコードベースで確認
- [x] デザインが崩れていないことを考慮した実装（小さなバッジやヒントテキストの使用）
