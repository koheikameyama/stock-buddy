# i18n（文言管理）導入設計

## 目的

- 文言を一元管理して保守性を向上させる
- 将来的な多言語対応に備えた基盤を構築する
- 当面は日本語のみで運用

## 要件

- 全ページ・全コンポーネントを一括で移行
- 機能・ドメインごとに翻訳ファイルを分割
- テンプレート文字列で動的な値を扱う（例: `"{{stockName}}の価格は{{price}}円です"`）
- Next.js App Router（Server Components / Client Components）の両方に対応

## アプローチ

### 採用: next-intl

Next.js App Router専用のi18nライブラリを使用する。

**選定理由:**
- App Routerとの相性が最高
- TypeScript型安全性が高い（キーの補完が効く）
- Server Components / Client Componentsの両方をサポート
- テンプレート文字列が標準サポート
- 将来の多言語対応がスムーズ

**代替案:**
- 自作の軽量i18nユーティリティ: 型安全性が低く、将来の拡張で追加実装が必要
- react-i18next: Server Componentsでの扱いが面倒でオーバースペック

## アーキテクチャ概要

```
プロジェクトルート
├── locales/
│   └── ja/              # 日本語ファイル（将来en/を追加可能）
│       ├── common.json
│       ├── portfolio.json
│       ├── stocks.json
│       ├── analysis.json
│       ├── notifications.json
│       ├── settings.json
│       ├── auth.json
│       ├── news.json
│       └── index.ts     # 全ファイルを集約
├── lib/
│   └── i18n.ts          # next-intl設定
├── types/
│   └── i18n.d.ts        # 型定義
├── middleware.ts        # ロケール検出（将来用）
└── app/
    ├── layout.tsx       # NextIntlClientProviderでラップ
    └── ...
```

**動作の流れ:**
1. `locales/ja/*.json`に文言を定義
2. Server Components: `await getTranslations('stocks')`で翻訳取得
3. Client Components: `useTranslations('stocks')`フックで翻訳取得
4. テンプレート変数: `t('price', { value: 1000 })`で動的値を挿入

## 翻訳ファイル構成

機能・ドメインごとに分割した翻訳ファイル：

### locales/ja/common.json - 共通UI要素

```json
{
  "buttons": {
    "save": "保存",
    "cancel": "キャンセル",
    "delete": "削除",
    "edit": "編集",
    "close": "閉じる",
    "back": "戻る"
  },
  "errors": {
    "loadFailed": "データの読み込みに失敗しました",
    "saveFailed": "保存に失敗しました",
    "networkError": "ネットワークエラーが発生しました"
  },
  "labels": {
    "loading": "読み込み中...",
    "noData": "データがありません"
  }
}
```

### locales/ja/portfolio.json - ポートフォリオ関連

```json
{
  "title": "ポートフォリオ",
  "summary": {
    "totalValue": "評価額合計",
    "totalGain": "損益",
    "gainRate": "損益率"
  },
  "tabs": {
    "holdings": "保有中",
    "watchlist": "ウォッチリスト",
    "sold": "売却済み"
  }
}
```

### locales/ja/stocks.json - 銘柄情報

```json
{
  "price": "{{value}}円",
  "change": "前日比 {{value}}円 ({{rate}}%)",
  "recommendation": {
    "buy": "買い推奨",
    "sell": "売り推奨",
    "hold": "様子見"
  }
}
```

### その他のファイル

- **analysis.json** - AI分析・レポート
- **notifications.json** - 通知
- **settings.json** - 設定
- **auth.json** - ログイン・利用規約
- **news.json** - ニュース

## 実装の詳細

### next-intlの設定（lib/i18n.ts）

```typescript
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const locale = 'ja'; // 当面は日本語固定

  return {
    locale,
    messages: (await import(`../locales/${locale}/index.ts`)).default
  };
});
```

### 翻訳ファイルの集約（locales/ja/index.ts）

```typescript
import common from './common.json';
import portfolio from './portfolio.json';
import stocks from './stocks.json';
import analysis from './analysis.json';
import notifications from './notifications.json';
import settings from './settings.json';
import auth from './auth.json';
import news from './news.json';

export default {
  common,
  portfolio,
  stocks,
  analysis,
  notifications,
  settings,
  auth,
  news,
};
```

### Server Componentでの使用例

```typescript
import { getTranslations } from 'next-intl/server';

export default async function StockCard({ stockId }: Props) {
  const t = await getTranslations('stocks');

  return (
    <div>
      <h2>{t('recommendation.buy')}</h2>
      <p>{t('price', { value: 1500 })}</p>
    </div>
  );
}
```

### Client Componentでの使用例

```typescript
'use client';
import { useTranslations } from 'next-intl';

export default function DeleteButton() {
  const t = useTranslations('common.buttons');

  return <button>{t('delete')}</button>;
}
```

### ルートレイアウトの修正（app/layout.tsx）

```typescript
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

export default async function RootLayout({ children }) {
  const messages = await getMessages();

  return (
    <html lang="ja">
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

### next.config.js の設定

```javascript
const withNextIntl = require('next-intl/plugin')('./lib/i18n.ts');

module.exports = withNextIntl({
  // 既存の設定
});
```

## 移行戦略とエラーハンドリング

### 移行の手順

1. **next-intlをインストール**
   ```bash
   npm install next-intl
   ```

2. **翻訳ファイルを作成**
   - 全ページ分の文言を抽出してJSONファイルに整理
   - 機能・ドメインごとに分割

3. **設定ファイルを作成**
   - `lib/i18n.ts`
   - `locales/ja/index.ts`
   - `types/i18n.d.ts`
   - `next.config.js`の修正

4. **ルートレイアウトを修正**
   - `app/layout.tsx`にNextIntlClientProviderを追加

5. **各コンポーネントを順次移行**
   - ファイル単位で移行
   - Server Components: `getTranslations()`
   - Client Components: `useTranslations()`

6. **移行後の確認**
   - 元のハードコード文言を削除
   - ビルドエラーがないか確認
   - 型チェックが通るか確認

### エラーハンドリング

**翻訳キーが存在しない場合:**
- next-intlがキー名をそのまま表示（開発中に気づきやすい）
- 本番環境では警告ログを出力

**翻訳ファイルの読み込み失敗:**
- ビルド時エラーで検知
- JSONの構文エラーもビルド時に検知

**型チェック:**
- TypeScript型定義で存在しないキーを使用するとコンパイルエラー
- コード補完でタイポを防止

### 型安全性の確保

```typescript
// types/i18n.d.ts
type Messages = typeof import('../locales/ja/index.ts').default;

declare global {
  interface IntlMessages extends Messages {}
}

export {};
```

これにより、`t('stocks.price')`のようなキーがコード補完され、タイポを防げる。

### 移行完了のチェックリスト

- [ ] 全ページで翻訳関数を使用している
- [ ] ハードコードされた日本語文字列がない
- [ ] 型補完が効いている
- [ ] ビルドエラーがない
- [ ] 開発環境で全ページが正常に表示される
- [ ] 本番ビルドが成功する

## 将来の拡張性

### 多言語対応

英語対応が必要になった場合：

1. `locales/en/`ディレクトリを作成
2. 各JSONファイルを英語版で作成
3. `lib/i18n.ts`でロケール検出ロジックを追加
4. `middleware.ts`でロケールルーティングを設定

### 動的な翻訳の追加

新しい翻訳が必要になった場合：

1. 該当するJSONファイルにキーを追加
2. 型定義が自動更新される
3. コンポーネントで`t('newKey')`を使用

## 参考リンク

- [next-intl公式ドキュメント](https://next-intl-docs.vercel.app/)
- [Next.js App Router Internationalization](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
