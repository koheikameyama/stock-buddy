# フロントエンドパターン

## データ取得とローディング表示

**データ取得は基本的に非同期にしてスケルトン表示してください。**

### 理由

1. **UX向上**: ページ全体がブロックされず、ユーザーが待機状態を認識できる
2. **体感速度**: スケルトンがあると読み込みが速く感じる
3. **レイアウトシフト防止**: スケルトンがコンテンツと同じサイズを確保

### 基本パターン

```typescript
// ✅ 良い例: Suspenseとスケルトンを使用
import { Suspense } from "react"
import { StockListSkeleton } from "@/components/skeletons"

export default function Page() {
  return (
    <Suspense fallback={<StockListSkeleton />}>
      <StockList />
    </Suspense>
  )
}

// データ取得コンポーネント（Server Component）
async function StockList() {
  const stocks = await fetchStocks()
  return <StockListContent stocks={stocks} />
}
```

```typescript
// ❌ 悪い例: ページ全体でawait
export default async function Page() {
  const stocks = await fetchStocks() // ページ全体がブロック
  return <StockListContent stocks={stocks} />
}
```

### スケルトンコンポーネント

スケルトンは `components/skeletons/` に配置してください。

```typescript
// components/skeletons/stock-list-skeleton.tsx
export function StockListSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
      ))}
    </div>
  )
}
```

### チェックリスト

新しいページ・コンポーネント作成時：

- [ ] データ取得は別コンポーネントに分離
- [ ] `Suspense` でラップ
- [ ] 適切なスケルトンを `fallback` に指定
- [ ] スケルトンのサイズは実コンテンツと同じにする

## 文言の国際化（i18n）

**フロントエンドに表示する文言はすべて i18n に定義し、呼び出して使用してください。**

- コンポーネント内にハードコードしない
- 翻訳ファイルから呼び出す

### ✅ 良い例

```typescript
import { useTranslations } from "next-intl"

export function StockCard() {
  const t = useTranslations("StockCard")
  return <p>{t("noData")}</p>
}
```

```json
// messages/ja.json
{
  "StockCard": {
    "noData": "データがありません"
  }
}
```

### ❌ 悪い例

```typescript
// 文言をコンポーネントにハードコード
export function StockCard() {
  return <p>データがありません</p>
}
```

### チェックリスト

- [ ] 表示文言は i18n ファイル（`messages/`）に定義
- [ ] コンポーネントでは `useTranslations` / `getTranslations` で呼び出す
- [ ] 文言を直接コンポーネントに書かない
