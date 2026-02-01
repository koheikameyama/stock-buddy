# ウォッチリスト簡素化とアラート機能設計

**作成日:** 2026-02-01
**ステータス:** 設計完了

## 背景

現在のウォッチリストはオンボーディングと強く結合しており、以下の問題がある：

1. **役割の曖昧さ**: ポートフォリオのシミュレーション機能と重複
2. **複雑な情報**: 推奨株数・推奨投資額など、監視目的には不要な情報
3. **オンボーディングとの結合**: 本来独立すべき機能がオンボーディングに依存

## 設計目標

1. **ウォッチリストを純粋な「監視リスト」に**
   - 気になる銘柄の価格変動を追う
   - オンボーディングから切り離す

2. **アラート機能の追加**
   - ウォッチリスト: 「この価格まで下がったら買いたい」
   - ポートフォリオ: 「この価格で売却/利確を検討したい」

3. **段階的な実装**
   - まずは無料で全ユーザーに提供
   - 将来的な課金プランの余地を残す

## データモデル変更

### 1. Watchlist モデルの簡素化

**削除するフィールド:**
- `recommendedPrice` - オンボーディング由来の推奨価格
- `recommendedQty` - オンボーディング由来の推奨株数
- `source` - 提案元（'onboarding' | 'manual' | 'report'）
- `buyTimingScore` - 買い時スコア
- `lastAnalyzedAt` - AI分析日時
- `virtualBuyPrice`, `virtualBuyDate`, `virtualQuantity` - 仮想購入（ポートフォリオと重複）

**追加するフィールド:**
- `targetCondition` - アラート条件（'above' | 'below'）

**新しいスキーマ:**
```prisma
model Watchlist {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  stockId         String
  stock           Stock     @relation(fields: [stockId], references: [id], onDelete: Cascade)

  // 価格アラート機能
  targetPrice     Decimal?  @db.Decimal(12, 2)  // 目標価格
  targetCondition String?                       // 'above' | 'below'
  priceAlert      Boolean   @default(true)      // アラート有効/無効
  lastAlertSent   DateTime?                     // 最後の通知日時

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([userId, stockId])
  @@index([userId])
}
```

### 2. PortfolioStock にアラート機能を追加

**追加するフィールド:**
```prisma
model PortfolioStock {
  // ... 既存フィールド

  // 価格アラート機能
  targetPrice     Decimal?  @db.Decimal(12, 2)  // 目標価格
  targetCondition String?                       // 'above' | 'below'
  priceAlert      Boolean   @default(false)     // アラート有効/無効（既存データ考慮）
  lastAlertSent   DateTime?                     // 最後の通知日時
}
```

**ユースケース:**
- 「3,000円まで下がったら売却検討の通知」（below）
- 「5,000円まで上がったら利確検討の通知」（above）

### 3. User モデル（将来の課金プラン用）

**追加するフィールド:**
```prisma
model User {
  // ... 既存フィールド

  // 課金プラン（将来用）
  subscriptionPlan   String    @default("free") // 'free' | 'premium'
  subscriptionExpiry DateTime?
}
```

## UI/UX 変更

### 1. オンボーディングフロー

**現在:**
```
AI提案 → 3択（実際に購入 / シミュレーション / ウォッチリスト）
```

**新しい設計:**
```
AI提案 → 2択（実際に購入 / シミュレーション）
         ↓
      ポートフォリオに直接登録
```

- ウォッチリストへの導線を削除
- オンボーディングは「ポートフォリオ構築」に集中
- シンプルで迷わない

### 2. ウォッチリスト表示

**削除する表示:**
- 推奨株数
- 推奨投資額
- 提案元（オンボーディング/手動追加）

**表示する情報:**
- 銘柄名・ティッカー
- 現在価格・価格変動
- セクター・市場
- アラート設定状態
- 追加日

### 3. ウォッチリストへの追加

**新しい導線:**
- ダッシュボードに「ウォッチリストに追加」ボタン
- 銘柄検索モーダル → 検索 → 追加
- ポートフォリオページの「銘柄検索」と同じUI

**最大数制限:**
- 5銘柄まで（ポートフォリオと同じ）
- 初心者が管理しやすい範囲に制限

### 4. アラート設定UI

**ウォッチリスト・ポートフォリオ共通:**
- 各銘柄カードに「🔔 アラート設定」ボタン
- モーダルで以下を設定:
  - 目標価格（数値入力）
  - 条件（「以下になったら」「以上になったら」）
  - ON/OFFトグル

**アラート通知:**
- プッシュ通知で送信
- 1日1回まで（スパム防止）
- `lastAlertSent` で管理

## 実装順序

### Phase 1: スキーマ変更とマイグレーション
1. `Watchlist` から不要フィールドを削除
2. `Watchlist` に `targetCondition` を追加
3. `PortfolioStock` にアラートフィールドを追加
4. `User` に課金プランフィールドを追加（将来用）
5. マイグレーション作成・適用

### Phase 2: オンボーディング変更
1. オンボーディングから「ウォッチリスト」選択肢を削除
2. 2択（実購入/シミュレーション）のみに変更
3. API `/api/onboarding/complete` を修正

### Phase 3: ウォッチリスト表示変更
1. 推奨株数・推奨投資額の表示を削除
2. 提案元の表示を削除（完了済み）
3. シンプルな銘柄カード表示に変更

### Phase 4: ウォッチリスト追加UI
1. ダッシュボードに「ウォッチリストに追加」ボタン
2. 銘柄検索モーダル実装
3. `/api/watchlist` API を簡素化（`recommendedPrice`, `recommendedQty` を削除）

### Phase 5: アラート機能実装
1. アラート設定モーダル作成
2. ウォッチリスト・ポートフォリオ両方で使用
3. `/api/watchlist/set-alert` と `/api/portfolio/set-alert` API 作成
4. バッチジョブ（GitHub Actions）でアラートチェック
5. プッシュ通知送信

## 技術的考慮事項

### マイグレーション戦略

**既存データの扱い:**
- `recommendedPrice`, `recommendedQty` は削除（バックアップ推奨）
- `source`, `buyTimingScore` なども削除
- `virtualBuy*` フィールドも削除

**後方互換性:**
- 既存のウォッチリストエントリは保持
- 不要フィールドのみ削除

### アラートバッチジョブ

**実行頻度:**
- 1日1回（市場クローズ後）
- GitHub Actions cron で実装

**ロジック:**
```
1. priceAlert = true の全レコードを取得
2. 現在価格を取得
3. 条件チェック:
   - targetCondition = 'below' && currentPrice <= targetPrice
   - targetCondition = 'above' && currentPrice >= targetPrice
4. 条件一致 && lastAlertSent が24時間以上前
   → プッシュ通知送信
   → lastAlertSent を更新
```

## 将来の拡張

### 課金プラン

**無料版（現在）:**
- アラート機能: 利用可能
- ポートフォリオ: 5銘柄まで
- ウォッチリスト: 5銘柄まで

**プレミアム版（将来）:**
- アラート機能: 高度な条件設定
- ポートフォリオ: 10-20銘柄まで
- ウォッチリスト: 10-20銘柄まで
- 詳細なAI分析レポート

### 高度なアラート機能（将来）

- 複数条件（AND/OR）
- 期間指定（「1週間以内に○○円になったら」）
- パーセンテージベース（「10%下落したら」）
- 通知頻度設定（即時/1日1回/週1回）

## リスクと対策

### リスク1: 既存ユーザーのウォッチリストが空になる

**対策:**
- マイグレーション時にデータは保持
- ただし、オンボーディング経由で追加されたウォッチリストは意図的に削除される
- リリース前にユーザーに通知

### リスク2: アラート通知のスパム

**対策:**
- 1日1回まで制限（`lastAlertSent` で管理）
- ユーザーがON/OFFを自由に設定可能

### リスク3: 推奨株数・推奨投資額の削除による混乱

**対策:**
- 「購入した」ボタンから入力モーダルを表示
- 初期値は空欄（ユーザーが自分で判断）

## 成功指標

- ウォッチリスト利用率（追加された銘柄数）
- アラート設定率（アラートONにしている銘柄の割合）
- アラート通知のクリック率（通知から実際にアプリを開いた割合）
- ウォッチリスト → ポートフォリオへの移動率

## まとめ

この設計により：
1. **シンプル**: ウォッチリストは純粋な監視リストに
2. **実用的**: アラート機能で「買い時」「売り時」を通知
3. **拡張可能**: 将来的な課金プランの余地を残す
4. **初心者に優しい**: オンボーディングは2択のみでシンプルに
