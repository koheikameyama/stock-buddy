# 「今も保有してたら」機能 設計書

## 概要

売却済みの銘柄について、もし売らずに持ち続けていたらどうなっていたかを表示する機能。

## 目的

- 売却判断の振り返りができる（「学びながら成長」に合致）
- 「早く売りすぎた」「良いタイミングだった」が可視化される
- 次の売却判断の参考になる

## 要件

- 総売却数（=総購入数）で計算する
- 売却時の平均単価と現在価格を比較する
- 表示場所: SoldStockCard（損益セクションの下）と銘柄詳細ページ
- 評価コメントを自動生成する

## データ構造

### APIレスポンスに追加するフィールド

```typescript
interface SoldStock {
  // 既存フィールド...

  // 新規追加
  currentPrice: number | null           // 現在価格
  hypotheticalValue: number | null      // 今も保有してたら（金額）
  hypotheticalProfit: number | null     // 今も保有してたら（損益）
  hypotheticalProfitPercent: number | null // 今も保有してたら（損益%）
}
```

## 評価コメントのロジック

```typescript
function getHypotheticalComment(hypotheticalProfitPercent: number, actualProfitPercent: number): string {
  const diff = hypotheticalProfitPercent - actualProfitPercent

  if (diff > 20) {
    return "かなり早めの利確でした"
  } else if (diff > 5) {
    return "早めの利確でした"
  } else if (diff > -5) {
    return "適切なタイミングでした"
  } else if (diff > -20) {
    return "良いタイミングでした"
  } else {
    return "絶好のタイミングでした"
  }
}
```

## UI表示

### SoldStockCard（カード）

```
┌─────────────────────────────────────┐
│ [利益確定]              トヨタ自動車 │
│ 7203 • 輸送用機器                    │
│ 2025/01/01 ~ 2025/02/15 • 100株     │
├─────────────────────────────────────┤
│ 購入金額        売却金額             │
│ ¥100,000       ¥110,000             │
├─────────────────────────────────────┤
│ 損益                    +¥10,000    │
│                         (+10%)      │
├─────────────────────────────────────┤
│ 📊 今も保有してたら      +¥30,000   │
│ → 早めの利確でした       (+30%)     │
└─────────────────────────────────────┘
```

### 銘柄詳細ページ

売却済み銘柄の場合、専用セクションを追加して表示する。

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `app/api/sold-stocks/route.ts` | 現在価格を取得し、hypothetical値を計算して返す |
| `store/types.ts` | SoldStock型に新フィールドを追加 |
| `app/my-stocks/SoldStockCard.tsx` | 「今も保有してたら」セクションを追加 |
| `app/stocks/[stockId]/page.tsx` | 売却済み情報を取得 |
| `app/stocks/[stockId]/StockDetailClient.tsx` | 売却済みの場合に専用セクションを表示 |

## アプローチ

APIで現在価格を一緒に返す方式を採用。売却済み銘柄は数が限られているため、APIで一緒に返す方がシンプルでUXも良い。

## Linearタスク

KOH-165
