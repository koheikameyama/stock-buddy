# 購入判断分析機能 - 設計書

## 概要

「気になる」銘柄（ウォッチリスト）に対して、毎日AI分析を行い購入判断を提供する機能。

### 目的

- 投資初心者が「いつ買えばいいか分からない」という不安を解消
- シンプルな判断（買い/待ち/見送り）と具体的な購入提案を提供
- 毎日更新されることで、買い時を逃さない

### ターゲットユーザー

- 投資初心者（「始めたいけど怖い」人）
- 気になる銘柄は登録したが、購入のタイミングが分からない人

---

## 機能仕様

### 1. 表示方法

**トグルボタン方式**

- 「気になる」銘柄のStockCardに「💰 購入判断を見る」ボタンを配置
- ボタンをクリックすると、購入判断分析が展開表示される
- 「保有中」銘柄には表示されない（既に購入済みのため）

### 2. 分析内容

#### 初期リリース（シンプル版）

**A. シンプルな判断**
- 買い（buy）/ 待ち（hold）/ 見送り（pass）の3段階
- 平易な言葉での理由説明（1-2文）

**B. 具体的な購入提案**
- 推奨購入数量（例: 100株）
- 目安価格帯（例: 1,500円以下）
- 必要金額の概算
- 注意点

**C. 信頼度表示**
- 0-100%のパーセンテージ
- プログレスバーで視覚化

#### 将来拡張（詳細版）

- グラフ・チャート表示
- 詳細な指標（テクニカル/ファンダメンタル）
- リスク/リターン分析
- 「詳しく見る」トグルで表示/非表示

### 3. 表示イメージ

```
┌─────────────────────────────────┐
│ StockCard                       │
│                                 │
│ [編集] [気になる→保有中に変更]  │
│                                 │
│ [🔮 今後の予測を見る]          │  ← 既存の予測トグル
│                                 │
│ [💰 購入判断を見る] ← NEW      │  ← 新規追加
└─────────────────────────────────┘

↓ クリックすると展開

┌─────────────────────────────────┐
│ 💡 今が買い時です！             │
│                                 │
│ この銘柄は安定した成長が        │
│ 期待できます。現在の価格は      │
│ 割安な水準にあります。          │
│                                 │
│ 📊 おすすめの買い方             │
│ • 購入数量: 100株               │
│ • 目安価格: 1,500円以下         │
│ • 必要金額: 約150,000円         │
│                                 │
│ ⚠️ 注意点                       │
│ 株価は変動します。余裕資金で    │
│ 始めましょう。                  │
│                                 │
│ 信頼度 ████████░░ 75%           │
└─────────────────────────────────┘
```

---

## データモデル

### PurchaseRecommendationテーブル

```prisma
model PurchaseRecommendation {
  id        String   @id @default(cuid())
  stockId   String
  stock     Stock    @relation(fields: [stockId], references: [id])
  date      DateTime // 分析日（UTC 00:00:00）

  // 基本判断
  recommendation String // "buy" | "hold" | "pass"
  confidence     Float  // 0.0-1.0（信頼度）

  // 購入提案（recommendationが"buy"の場合のみ）
  recommendedQuantity Int?     // 推奨購入数量
  recommendedPrice    Decimal? @db.Decimal(10, 2) // 推奨価格
  estimatedAmount     Decimal? @db.Decimal(12, 2) // 必要金額の概算

  // 説明（平易な言葉で）
  reason      String @db.Text // 判断理由
  caution     String @db.Text // 注意点

  // 将来拡張用（グラフ・指標データなど）
  analysisData Json? // 柔軟に追加データを保存可能

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([stockId, date]) // 同じ銘柄・同じ日は1件のみ
  @@index([date])
}
```

### Stockモデルへのリレーション追加

```prisma
model Stock {
  // 既存フィールド...
  purchaseRecommendations PurchaseRecommendation[]
}
```

---

## 分析生成フロー

### 1. タイミング

**毎日1回、GitHub Actionsで自動実行**

- 既存の日次分析ワークフロー（`daily-analysis.yml`）に統合
- 株価予測と同じタイミングで購入判断も生成
- 実行時刻: 毎日JST 8:00（UTC 23:00前日）

### 2. 対象銘柄

**「気になる」銘柄（ウォッチリスト）のみ**

- `UserStock`テーブルで`quantity IS NULL`の銘柄
- 最大5銘柄（ウォッチリストの上限）

### 3. 生成ロジック

**OpenAI APIでAI分析**

#### 入力データ
- 銘柄の基本情報（名前、セクター、現在価格）
- 既存の株価予測データ（短期/中期/長期トレンド）
- 過去の株価データ（直近30日）
- 市場全体のトレンド（可能であれば）

#### プロンプト例
```
あなたは投資初心者向けのAIコーチです。
以下の銘柄について、購入判断をしてください。

【銘柄情報】
- 名前: トヨタ自動車
- 現在価格: 1,500円
- 短期予測: 上昇傾向（1,550-1,600円）
- 中期予測: 横ばい（1,500-1,600円）
- 長期予測: 上昇傾向（1,600-1,800円）

【回答形式】
1. 判断: "buy", "hold", "pass"のいずれか
2. 信頼度: 0.0-1.0（小数点2桁）
3. 理由: 初心者に分かりやすい言葉で1-2文
4. 推奨購入数量（buyの場合）: 100株単位
5. 推奨価格（buyの場合）: 具体的な価格帯
6. 注意点: 1-2文

【制約】
- 専門用語は使わない
- ROE、PER、株価収益率などの指標は使わない
- 「成長性」「安定性」のような平易な言葉を使う
```

#### 出力データ
```json
{
  "recommendation": "buy",
  "confidence": 0.75,
  "reason": "この銘柄は安定した成長が期待できます。現在の価格は割安な水準にあります。",
  "recommendedQuantity": 100,
  "recommendedPrice": 1500,
  "estimatedAmount": 150000,
  "caution": "株価は変動します。余裕資金で始めましょう。"
}
```

### 4. データ保存

- `PurchaseRecommendation`テーブルに保存
- 同じ銘柄・同じ日付の既存データは上書き（upsert）
- 過去30日より古いデータは自動削除（オプション）

---

## API設計

### GET `/api/stocks/[stockId]/purchase-recommendation`

#### 概要
指定された銘柄の最新の購入判断を取得

#### レスポンス例（200 OK）
```json
{
  "stockId": "abc123",
  "stockName": "トヨタ自動車",
  "tickerCode": "7203",
  "currentPrice": "1500.00",
  "recommendation": "buy",
  "confidence": 0.75,
  "reason": "この銘柄は安定した成長が期待できます。現在の価格は割安な水準にあります。",
  "recommendedQuantity": 100,
  "recommendedPrice": "1500.00",
  "estimatedAmount": "150000.00",
  "caution": "株価は変動します。余裕資金で始めましょう。",
  "analyzedAt": "2026-02-03T00:00:00Z"
}
```

#### エラーレスポンス
- 404: 購入判断データがまだ生成されていない
- 500: サーバーエラー

---

## UI/UXコンポーネント

### 1. StockCard（更新）

**追加要素**
- 「💰 購入判断を見る」トグルボタン
- `useState`で表示/非表示を管理
- 「気になる」銘柄（`quantity === null`）の場合のみ表示

**コード例**
```tsx
const [showPurchaseRecommendation, setShowPurchaseRecommendation] = useState(false)
const isWatchlist = stock.quantity === null

{isWatchlist && (
  <button
    onClick={() => setShowPurchaseRecommendation(!showPurchaseRecommendation)}
    className="mt-4 w-full px-4 py-2 bg-green-50 text-green-700 rounded-lg"
  >
    {showPurchaseRecommendation ? "購入判断を非表示" : "💰 購入判断を見る"}
  </button>
)}

{showPurchaseRecommendation && (
  <PurchaseRecommendation stockId={stock.stockId} />
)}
```

### 2. PurchaseRecommendationコンポーネント（新規作成）

**ファイル**: `app/components/PurchaseRecommendation.tsx`

**Props**
```tsx
interface PurchaseRecommendationProps {
  stockId: string
}
```

**機能**
- APIから購入判断データを取得（`/api/stocks/[stockId]/purchase-recommendation`）
- ローディング状態表示
- エラー表示（データがない場合）
- 判断に応じた表示（買い/待ち/見送り）

**UIパターン**

1. **買い推奨（buy）**
```tsx
<div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-md p-6">
  <div className="flex items-center gap-2 mb-4">
    <span className="text-2xl">💡</span>
    <h3 className="text-lg font-bold text-green-800">今が買い時です！</h3>
  </div>

  <p className="text-sm text-gray-700 mb-4">{reason}</p>

  <div className="bg-white rounded-lg p-4 mb-4">
    <p className="text-xs text-gray-600 mb-2">📊 おすすめの買い方</p>
    <ul className="text-sm text-gray-800 space-y-1">
      <li>• 購入数量: {recommendedQuantity}株</li>
      <li>• 目安価格: {recommendedPrice}円以下</li>
      <li>• 必要金額: 約{estimatedAmount.toLocaleString()}円</li>
    </ul>
  </div>

  <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
    <p className="text-xs text-amber-800">⚠️ {caution}</p>
  </div>

  <div className="flex items-center gap-2">
    <div className="flex-1 bg-gray-200 rounded-full h-2">
      <div className="bg-green-500 h-2 rounded-full" style={{width: `${confidence * 100}%`}} />
    </div>
    <span className="text-xs text-gray-600">信頼度 {Math.round(confidence * 100)}%</span>
  </div>
</div>
```

2. **様子見（hold）**
```tsx
<div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg shadow-md p-6">
  <div className="flex items-center gap-2 mb-4">
    <span className="text-2xl">⏳</span>
    <h3 className="text-lg font-bold text-blue-800">もう少し様子を見ましょう</h3>
  </div>

  <p className="text-sm text-gray-700 mb-4">{reason}</p>

  <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4">
    <p className="text-xs text-blue-800">💡 今は焦らず、タイミングを待ちましょう</p>
  </div>

  {/* 信頼度バー */}
</div>
```

3. **見送り（pass）**
```tsx
<div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg shadow-md p-6">
  <div className="flex items-center gap-2 mb-4">
    <span className="text-2xl">🚫</span>
    <h3 className="text-lg font-bold text-gray-800">今は見送りがおすすめです</h3>
  </div>

  <p className="text-sm text-gray-700 mb-4">{reason}</p>

  <div className="bg-gray-100 border-l-4 border-gray-400 p-3 mb-4">
    <p className="text-xs text-gray-700">💡 他の銘柄を検討してみましょう</p>
  </div>

  {/* 信頼度バー */}
</div>
```

---

## 実装タスク

### フェーズ1: データベース・API

1. **Prismaスキーマ更新**
   - `PurchaseRecommendation`モデル追加
   - `Stock`モデルにリレーション追加
   - マイグレーション作成・適用

2. **API実装**
   - `GET /api/stocks/[stockId]/purchase-recommendation`
   - データ取得・整形・レスポンス

3. **分析生成スクリプト**
   - `scripts/generate_purchase_recommendations.py`
   - OpenAI API連携
   - データベース保存（upsert）

4. **GitHub Actions更新**
   - `daily-analysis.yml`に購入判断生成ステップを追加
   - 環境変数設定確認

### フェーズ2: UI/UXコンポーネント

5. **PurchaseRecommendationコンポーネント作成**
   - `app/components/PurchaseRecommendation.tsx`
   - API連携
   - 3パターンのUI実装（buy/hold/pass）

6. **StockCard更新**
   - トグルボタン追加
   - 「気になる」銘柄の判定
   - 条件付きレンダリング

### フェーズ3: テスト・デプロイ

7. **動作確認**
   - ローカル環境でのテスト
   - 各判断パターンの表示確認
   - エラーハンドリング確認

8. **本番デプロイ**
   - `git push origin main`
   - Railway自動デプロイ確認
   - 初回分析生成の確認

---

## 将来の拡張計画

### 詳細分析表示（Phase 2）

- 「詳しく見る」トグルボタン
- グラフ・チャート表示
  - 株価推移グラフ
  - 出来高グラフ
  - 移動平均線
- 詳細指標
  - テクニカル指標（簡易版）
  - ファンダメンタル指標（簡易版）
- リスク/リターン分析

### 通知機能（Phase 3）

- 「買い時」になったらプッシュ通知
- メール通知
- 通知設定（オン/オフ、頻度）

### パーソナライズ（Phase 4）

- ユーザーの予算を考慮した提案
- 投資スタイルに応じた判断
- 過去の購入履歴を学習

---

## 注意事項

### プロダクトコンセプトへの準拠

- ✅ 専門用語を使わない
- ✅ シンプルで分かりやすい判断
- ✅ 具体的な行動提案
- ✅ 初心者に寄り添う表現

### 法的・倫理的配慮

- 投資判断はあくまで「参考情報」である旨を明記
- 「投資は自己責任」の注意書きを表示
- 過度に断定的な表現を避ける
- リスクについて適切に説明する

### データ品質

- AI分析の精度向上
- プロンプトの継続的な改善
- エラーハンドリングの充実
- データの定期的な検証

---

## まとめ

この機能により、「気になる」銘柄を登録したユーザーが、**いつ購入すればいいか**という判断を毎日受け取れるようになります。初心者にも分かりやすいシンプルな判断と具体的な購入提案により、投資の第一歩を後押しします。

将来的にはグラフや詳細指標を追加し、ユーザーの成長に合わせて情報量を増やしていくことが可能です。
