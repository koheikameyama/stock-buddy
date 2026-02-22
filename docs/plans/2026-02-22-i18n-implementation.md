# i18n (文言管理) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 文言を一元管理するため、next-intlを使用したi18nシステムを全ページ・全コンポーネントに導入する

**Architecture:** next-intlライブラリを使用し、翻訳ファイルを機能・ドメインごとに分割（locales/ja/*.json）。Server ComponentsとClient Componentsの両方で翻訳関数を使用できるようにする。

**Tech Stack:** next-intl, Next.js 15 App Router, TypeScript

---

## Task 1: パッケージのインストールと基本設定

**Files:**
- Modify: `package.json`
- Create: `lib/i18n.ts`
- Modify: `next.config.js`

**Step 1: next-intlをインストール**

```bash
npm install next-intl
```

Expected: package.jsonに`next-intl`が追加される

**Step 2: next-intl設定ファイルを作成**

Create: `lib/i18n.ts`

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

**Step 3: next.config.jsを更新**

Modify: `next.config.js`

既存の設定をnext-intlプラグインでラップ：

```javascript
const withNextIntl = require('next-intl/plugin')('./lib/i18n.ts');

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

module.exports = withNextIntl(withPWA(nextConfig));
```

**Step 4: ビルド確認（まだ翻訳ファイルがないのでエラーになるが確認）**

```bash
npm run build
```

Expected: エラーが出るが、next-intlが正しく読み込まれていることを確認

**Step 5: コミット**

```bash
git add package.json package-lock.json lib/i18n.ts next.config.js
git commit -m "feat: install and configure next-intl"
```

---

## Task 2: 翻訳ファイルディレクトリ構造の作成

**Files:**
- Create: `locales/ja/common.json`
- Create: `locales/ja/portfolio.json`
- Create: `locales/ja/stocks.json`
- Create: `locales/ja/analysis.json`
- Create: `locales/ja/notifications.json`
- Create: `locales/ja/settings.json`
- Create: `locales/ja/auth.json`
- Create: `locales/ja/news.json`
- Create: `locales/ja/index.ts`

**Step 1: locales/ja/common.json を作成**

Create: `locales/ja/common.json`

```json
{
  "appName": "Stock Buddy",
  "buttons": {
    "save": "保存",
    "cancel": "キャンセル",
    "delete": "削除",
    "edit": "編集",
    "close": "閉じる",
    "back": "戻る",
    "add": "追加",
    "remove": "削除",
    "confirm": "確認",
    "send": "送信",
    "search": "検索",
    "filter": "絞り込み",
    "clear": "クリア",
    "apply": "適用",
    "yes": "はい",
    "no": "いいえ",
    "ok": "OK"
  },
  "errors": {
    "loadFailed": "データの読み込みに失敗しました",
    "saveFailed": "保存に失敗しました",
    "deleteFailed": "削除に失敗しました",
    "networkError": "ネットワークエラーが発生しました",
    "serverError": "サーバーエラーが発生しました",
    "invalidInput": "入力内容に誤りがあります",
    "required": "必須項目です",
    "unauthorized": "認証が必要です",
    "forbidden": "アクセス権限がありません",
    "notFound": "データが見つかりません"
  },
  "labels": {
    "loading": "読み込み中...",
    "noData": "データがありません",
    "search": "検索",
    "filter": "絞り込み",
    "sort": "並び替え",
    "date": "日付",
    "time": "時刻",
    "status": "ステータス",
    "type": "種別",
    "all": "すべて"
  },
  "navigation": {
    "home": "ホーム",
    "dashboard": "ダッシュボード",
    "portfolio": "ポートフォリオ",
    "watchlist": "ウォッチリスト",
    "analysis": "分析",
    "news": "ニュース",
    "settings": "設定",
    "menu": "メニュー",
    "notifications": "通知"
  },
  "badge": {
    "tokyoStockExchange": "東証限定"
  }
}
```

**Step 2: locales/ja/portfolio.json を作成**

Create: `locales/ja/portfolio.json`

```json
{
  "title": "ポートフォリオ",
  "myStocks": "マイ銘柄",
  "summary": {
    "title": "サマリー",
    "totalValue": "評価額合計",
    "totalInvestment": "投資額合計",
    "totalGain": "損益",
    "gainRate": "損益率",
    "cash": "現金",
    "totalAssets": "総資産",
    "unrealizedGain": "含み損益",
    "realizedGain": "確定損益",
    "dailyChange": "本日の変動",
    "cashRatio": "現金比率"
  },
  "tabs": {
    "holdings": "保有中",
    "watchlist": "ウォッチリスト",
    "sold": "売却済み",
    "tracked": "追跡銘柄"
  },
  "addStock": {
    "title": "銘柄を追加",
    "searchPlaceholder": "銘柄名またはティッカーで検索",
    "selectType": "追加先を選択",
    "portfolio": "ポートフォリオ",
    "watchlist": "ウォッチリスト",
    "purchaseDate": "購入日",
    "quantity": "株数",
    "purchasePrice": "購入価格",
    "success": "銘柄を追加しました"
  },
  "stockCard": {
    "currentPrice": "現在価格",
    "purchasePrice": "購入価格",
    "quantity": "保有数",
    "totalValue": "評価額",
    "gain": "損益",
    "gainRate": "損益率",
    "dayChange": "日次変動",
    "addedDate": "追加日",
    "purchaseDate": "購入日",
    "soldDate": "売却日",
    "soldPrice": "売却価格",
    "viewDetails": "詳細を見る",
    "edit": "編集",
    "delete": "削除",
    "sell": "売却",
    "buy": "購入"
  },
  "deleteConfirm": {
    "title": "銘柄を削除しますか？",
    "message": "この操作は取り消せません。",
    "success": "銘柄を削除しました"
  },
  "sellConfirm": {
    "title": "銘柄を売却しますか？",
    "soldPrice": "売却価格",
    "soldDate": "売却日",
    "success": "銘柄を売却しました"
  },
  "editTransaction": {
    "title": "取引を編集",
    "success": "取引を更新しました"
  },
  "additionalPurchase": {
    "title": "追加購入",
    "success": "追加購入を記録しました"
  },
  "analysis": {
    "title": "ポートフォリオ分析",
    "overallAnalysis": "総合分析",
    "composition": "構成",
    "history": "履歴",
    "performance": "パフォーマンス"
  },
  "settings": {
    "takeProfitLine": "利確ライン",
    "stopLossLine": "損切りライン",
    "targetBuyPrice": "目標購入価格",
    "enableAlerts": "アラートを有効にする"
  },
  "limits": {
    "portfolioMax": "ポートフォリオは最大{max}銘柄まで追加できます",
    "watchlistMax": "ウォッチリストは最大{max}銘柄まで追加できます",
    "trackedMax": "追跡銘柄は最大{max}銘柄まで追加できます"
  }
}
```

**Step 3: locales/ja/stocks.json を作成**

Create: `locales/ja/stocks.json`

```json
{
  "title": "銘柄情報",
  "details": "銘柄詳細",
  "search": "銘柄を検索",
  "price": "{value}円",
  "priceYen": "{value}円",
  "change": "前日比 {value}円 ({rate}%)",
  "changePositive": "+{value}円 (+{rate}%)",
  "changeNegative": "{value}円 ({rate}%)",
  "volume": "出来高",
  "marketCap": "時価総額",
  "high": "高値",
  "low": "安値",
  "open": "始値",
  "close": "終値",
  "previousClose": "前日終値",
  "ticker": "ティッカー",
  "name": "銘柄名",
  "sector": "セクター",
  "industry": "業種",
  "description": "概要",
  "recommendation": {
    "buy": "買い推奨",
    "sell": "売り推奨",
    "hold": "様子見",
    "strongBuy": "強い買い推奨",
    "strongSell": "強い売り推奨"
  },
  "analysis": {
    "title": "分析",
    "technical": "テクニカル分析",
    "fundamental": "ファンダメンタル分析",
    "aiAnalysis": "AI分析",
    "summary": "分析サマリー",
    "strength": "強み",
    "weakness": "弱み",
    "opportunity": "機会",
    "threat": "脅威"
  },
  "tabs": {
    "overview": "概要",
    "chart": "チャート",
    "news": "ニュース",
    "financials": "財務",
    "technical": "テクニカル"
  },
  "chart": {
    "title": "株価チャート",
    "period1d": "1日",
    "period5d": "5日",
    "period1m": "1ヶ月",
    "period3m": "3ヶ月",
    "period6m": "6ヶ月",
    "period1y": "1年",
    "periodMax": "最大"
  },
  "financials": {
    "revenue": "売上高",
    "profit": "利益",
    "eps": "EPS",
    "per": "PER",
    "pbr": "PBR",
    "roe": "ROE",
    "dividendYield": "配当利回り",
    "debtRatio": "負債比率"
  },
  "technical": {
    "rsi": "RSI",
    "macd": "MACD",
    "sma": "単純移動平均",
    "ema": "指数移動平均",
    "bollingerBands": "ボリンジャーバンド",
    "support": "サポートライン",
    "resistance": "レジスタンスライン"
  },
  "actions": {
    "addToPortfolio": "ポートフォリオに追加",
    "addToWatchlist": "ウォッチリストに追加",
    "removeFromPortfolio": "ポートフォリオから削除",
    "removeFromWatchlist": "ウォッチリストから削除",
    "track": "追跡する",
    "untrack": "追跡を解除"
  },
  "delisted": {
    "warning": "この銘柄は上場廃止になりました",
    "date": "上場廃止日"
  },
  "priceUnavailable": "価格情報を取得できません",
  "featured": {
    "title": "今日の注目銘柄",
    "buyOpportunity": "今日の買いチャンス",
    "sellAlert": "売却検討",
    "highGrowth": "高成長期待",
    "undervalued": "割安銘柄"
  }
}
```

**Step 4: locales/ja/analysis.json を作成**

Create: `locales/ja/analysis.json`

```json
{
  "title": "分析",
  "aiReport": {
    "title": "AIレポート",
    "daily": "日次レポート",
    "weekly": "週次レポート",
    "accuracy": "精度レポート",
    "outcomes": "結果分析"
  },
  "tabs": {
    "overview": "概要",
    "detailed": "詳細",
    "outcomes": "結果"
  },
  "recommendation": {
    "title": "推奨",
    "reason": "理由",
    "confidence": "信頼度",
    "targetPrice": "目標価格",
    "stopLoss": "損切りライン",
    "timeframe": "期間"
  },
  "performance": {
    "title": "パフォーマンス",
    "returns": "リターン",
    "risk": "リスク",
    "sharpeRatio": "シャープレシオ",
    "maxDrawdown": "最大ドローダウン",
    "winRate": "勝率",
    "avgGain": "平均利益",
    "avgLoss": "平均損失"
  },
  "market": {
    "title": "マーケット分析",
    "trend": "トレンド",
    "sentiment": "センチメント",
    "volatility": "ボラティリティ",
    "movers": "値動き上位",
    "gainers": "上昇ランキング",
    "losers": "下落ランキング"
  },
  "sector": {
    "title": "セクター分析",
    "trend": "セクタートレンド",
    "heatmap": "ヒートマップ",
    "performance": "セクター別パフォーマンス"
  },
  "staleAnalysis": {
    "warning": "この分析は古い可能性があります",
    "lastUpdated": "最終更新"
  },
  "timestamp": {
    "analyzed": "分析日時",
    "updated": "更新日時"
  }
}
```

**Step 5: locales/ja/notifications.json を作成**

Create: `locales/ja/notifications.json`

```json
{
  "title": "通知",
  "noNotifications": "通知はありません",
  "markAllAsRead": "すべて既読にする",
  "markAsRead": "既読にする",
  "unread": "未読",
  "types": {
    "priceAlert": "価格アラート",
    "recommendation": "推奨",
    "news": "ニュース",
    "system": "システム",
    "portfolio": "ポートフォリオ"
  },
  "push": {
    "title": "プッシュ通知",
    "enable": "プッシュ通知を有効にする",
    "disable": "プッシュ通知を無効にする",
    "enablePrompt": "プッシュ通知を有効にしますか？",
    "enableDescription": "重要な更新をリアルタイムで受け取れます",
    "notSupported": "お使いのブラウザはプッシュ通知に対応していません"
  },
  "settings": {
    "priceAlerts": "価格アラート",
    "recommendations": "推奨通知",
    "news": "ニュース通知",
    "dailyReport": "日次レポート",
    "weeklyReport": "週次レポート"
  }
}
```

**Step 6: locales/ja/settings.json を作成**

Create: `locales/ja/settings.json`

```json
{
  "title": "設定",
  "account": {
    "title": "アカウント",
    "email": "メールアドレス",
    "name": "名前",
    "avatar": "アバター",
    "logout": "ログアウト"
  },
  "notifications": {
    "title": "通知設定",
    "push": "プッシュ通知",
    "email": "メール通知",
    "priceAlerts": "価格アラート",
    "recommendations": "推奨通知",
    "news": "ニュース",
    "reports": "レポート"
  },
  "preferences": {
    "title": "表示設定",
    "language": "言語",
    "theme": "テーマ",
    "currency": "通貨",
    "timezone": "タイムゾーン"
  },
  "portfolio": {
    "title": "ポートフォリオ設定",
    "defaultTakeProfitRate": "デフォルト利確率",
    "defaultStopLossRate": "デフォルト損切率",
    "riskTolerance": "リスク許容度",
    "investmentStyle": "投資スタイル"
  },
  "investmentStyle": {
    "conservative": "保守的",
    "balanced": "バランス",
    "aggressive": "積極的",
    "dayTrader": "デイトレーダー",
    "swingTrader": "スイングトレーダー",
    "longTerm": "長期投資"
  },
  "privacy": {
    "title": "プライバシー",
    "dataUsage": "データ使用",
    "analytics": "分析",
    "cookies": "Cookie"
  },
  "about": {
    "title": "このアプリについて",
    "version": "バージョン",
    "terms": "利用規約",
    "privacy": "プライバシーポリシー",
    "disclaimer": "免責事項",
    "contact": "お問い合わせ"
  },
  "save": {
    "success": "設定を保存しました",
    "failed": "設定の保存に失敗しました"
  }
}
```

**Step 7: locales/ja/auth.json を作成**

Create: `locales/ja/auth.json`

```json
{
  "login": {
    "title": "ログイン",
    "withGoogle": "Googleでログイン",
    "email": "メールアドレス",
    "password": "パスワード",
    "submit": "ログイン",
    "forgotPassword": "パスワードをお忘れですか？",
    "noAccount": "アカウントをお持ちでない方",
    "signup": "新規登録"
  },
  "signup": {
    "title": "新規登録",
    "withGoogle": "Googleで登録",
    "email": "メールアドレス",
    "password": "パスワード",
    "confirmPassword": "パスワード（確認）",
    "submit": "登録",
    "hasAccount": "すでにアカウントをお持ちの方",
    "login": "ログイン"
  },
  "terms": {
    "title": "利用規約",
    "accept": "利用規約に同意する",
    "acceptAndContinue": "同意して続ける",
    "lastUpdated": "最終更新日",
    "content": "利用規約の内容"
  },
  "privacy": {
    "title": "プライバシーポリシー",
    "accept": "プライバシーポリシーに同意する",
    "lastUpdated": "最終更新日",
    "content": "プライバシーポリシーの内容"
  },
  "disclaimer": {
    "title": "免責事項",
    "accept": "免責事項に同意する",
    "content": "免責事項の内容"
  },
  "termsAcceptance": {
    "title": "利用規約とプライバシーポリシー",
    "description": "Stock Buddyをご利用いただくには、利用規約とプライバシーポリシーへの同意が必要です。",
    "termsLink": "利用規約を読む",
    "privacyLink": "プライバシーポリシーを読む",
    "disclaimerLink": "免責事項を読む",
    "acceptTerms": "利用規約に同意する",
    "acceptPrivacy": "プライバシーポリシーに同意する",
    "submit": "同意して続ける",
    "bothRequired": "両方の同意が必要です"
  }
}
```

**Step 8: locales/ja/news.json を作成**

Create: `locales/ja/news.json`

```json
{
  "title": "ニュース",
  "latest": "最新ニュース",
  "marketNews": "マーケットニュース",
  "stockNews": "個別銘柄ニュース",
  "relatedNews": "関連ニュース",
  "noNews": "ニュースがありません",
  "readMore": "続きを読む",
  "source": "配信元",
  "publishedAt": "公開日時",
  "categories": {
    "all": "すべて",
    "market": "マーケット",
    "economy": "経済",
    "stocks": "個別銘柄",
    "earnings": "決算",
    "analysis": "分析"
  },
  "filters": {
    "category": "カテゴリー",
    "date": "日付",
    "relevance": "関連度"
  }
}
```

**Step 9: index.tsで全ファイルを集約**

Create: `locales/ja/index.ts`

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

**Step 10: ビルド確認**

```bash
npm run build
```

Expected: ビルド成功（まだコンポーネントは変更していないので警告が出る可能性あり）

**Step 11: コミット**

```bash
git add locales/
git commit -m "feat: create translation files for i18n"
```

---

## Task 3: TypeScript型定義の作成

**Files:**
- Create: `types/i18n.d.ts`

**Step 1: 型定義ファイルを作成**

Create: `types/i18n.d.ts`

```typescript
type Messages = typeof import('../locales/ja/index.ts').default;

declare global {
  interface IntlMessages extends Messages {}
}

export {};
```

**Step 2: コミット**

```bash
git add types/i18n.d.ts
git commit -m "feat: add TypeScript type definitions for i18n"
```

---

## Task 4: ルートレイアウトの更新

**Files:**
- Modify: `app/layout.tsx`

**Step 1: app/layout.tsxを更新**

Modify: `app/layout.tsx`

既存の内容に`NextIntlClientProvider`を追加：

```typescript
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import AuthenticatedLayout from "./components/AuthenticatedLayout";
import PWARegister from "./components/PWARegister";
import InstallPrompt from "./components/InstallPrompt";
import PushNotificationPrompt from "./components/PushNotificationPrompt";
import { BadgeProvider } from "./contexts/BadgeContext";
import GoogleAnalytics from "./components/GoogleAnalytics";
import AdSense from "./components/AdSense";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

export const metadata: Metadata = {
  title: "Stock Buddy - AI投資アシスタント",
  description: "AIが投資をサポートするスマートな投資アシスタントアプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Stock Buddy",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  return (
    <html lang="ja">
      <head>
        <GoogleAnalytics />
        <AdSense />
      </head>
      <body className="antialiased bg-gray-50">
        <NextIntlClientProvider messages={messages}>
          <BadgeProvider>
            <AuthenticatedLayout>{children}</AuthenticatedLayout>
            <Toaster position="top-center" />
            <PWARegister />
            <InstallPrompt />
            <PushNotificationPrompt />
          </BadgeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 2: ビルド確認**

```bash
npm run build
```

Expected: ビルド成功

**Step 3: コミット**

```bash
git add app/layout.tsx
git commit -m "feat: add NextIntlClientProvider to root layout"
```

---

## Task 5: 共通コンポーネントの移行（Header）

**Files:**
- Modify: `app/components/Header.tsx`

**Step 1: Headerコンポーネントを更新**

Modify: `app/components/Header.tsx`

```typescript
import { auth } from "@/auth";
import Image from "next/image";
import Link from "next/link";
import NotificationBell from "./NotificationBell";
import { getTranslations } from 'next-intl/server';

export default async function Header() {
  const session = await auth();
  const t = await getTranslations('common');

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          {/* ロゴ・タイトル */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/favicon.png"
              alt={t('appName')}
              width={32}
              height={32}
              className="rounded"
            />
            <span className="text-xl font-bold text-gray-900">{t('appName')}</span>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-200 ml-1">
              {t('badge.tokyoStockExchange')}
            </span>
          </Link>

          {/* 通知ベル - ログイン済みの場合のみ表示 */}
          {session && <NotificationBell />}
        </div>
      </div>
    </header>
  );
}
```

**Step 2: 動作確認**

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開いてヘッダーが正しく表示されることを確認

**Step 3: コミット**

```bash
git add app/components/Header.tsx
git commit -m "feat: migrate Header component to use i18n"
```

---

## Task 6: 共通コンポーネントの移行（BottomNavigation）

**Files:**
- Modify: `app/components/BottomNavigation.tsx`

**Step 1: BottomNavigationコンポーネントを更新**

Modify: `app/components/BottomNavigation.tsx`

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  ChartBarIcon,
  NewspaperIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import {
  HomeIcon as HomeIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  NewspaperIcon as NewspaperIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
} from "@heroicons/react/24/solid";
import { useBadge } from "../contexts/BadgeContext";
import { useTranslations } from 'next-intl';

export default function BottomNavigation() {
  const pathname = usePathname();
  const { hasUnread } = useBadge();
  const t = useTranslations('common.navigation');

  const navItems = [
    {
      name: t('home'),
      href: "/dashboard",
      icon: HomeIcon,
      activeIcon: HomeIconSolid,
    },
    {
      name: t('portfolio'),
      href: "/my-stocks",
      icon: ChartBarIcon,
      activeIcon: ChartBarIconSolid,
    },
    {
      name: t('news'),
      href: "/news",
      icon: NewspaperIcon,
      activeIcon: NewspaperIconSolid,
      badge: hasUnread,
    },
    {
      name: t('menu'),
      href: "/menu",
      icon: Cog6ToothIcon,
      activeIcon: Cog6ToothIconSolid,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-inset-bottom">
      <div className="max-w-6xl mx-auto px-2">
        <div className="flex justify-around">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = isActive ? item.activeIcon : item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center py-2 px-3 relative ${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-xs mt-1">{item.name}</span>
                {item.badge && (
                  <span className="absolute top-1 right-2 h-2 w-2 bg-red-500 rounded-full"></span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
```

**Step 2: 動作確認**

```bash
npm run dev
```

ボトムナビゲーションが正しく表示されることを確認

**Step 3: コミット**

```bash
git add app/components/BottomNavigation.tsx
git commit -m "feat: migrate BottomNavigation component to use i18n"
```

---

## Task 7: 共通コンポーネントの移行（DeleteButton, BackButton）

**Files:**
- Modify: `app/components/DeleteButton.tsx`
- Modify: `app/components/BackButton.tsx`

**Step 1: DeleteButtonコンポーネントを更新**

Modify: `app/components/DeleteButton.tsx`

```typescript
"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import { useTranslations } from 'next-intl';

interface DeleteButtonProps {
  onDelete: () => void;
  label?: string;
}

export default function DeleteButton({ onDelete, label }: DeleteButtonProps) {
  const t = useTranslations('common.buttons');

  return (
    <button
      onClick={onDelete}
      className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
    >
      <TrashIcon className="h-4 w-4" />
      {label || t('delete')}
    </button>
  );
}
```

**Step 2: BackButtonコンポーネントを更新**

Modify: `app/components/BackButton.tsx`

```typescript
"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useTranslations } from 'next-intl';

interface BackButtonProps {
  label?: string;
  onClick?: () => void;
}

export default function BackButton({ label, onClick }: BackButtonProps) {
  const router = useRouter();
  const t = useTranslations('common.buttons');

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      router.back();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
    >
      <ArrowLeftIcon className="h-5 w-5" />
      <span>{label || t('back')}</span>
    </button>
  );
}
```

**Step 3: コミット**

```bash
git add app/components/DeleteButton.tsx app/components/BackButton.tsx
git commit -m "feat: migrate DeleteButton and BackButton to use i18n"
```

---

## Task 8: ダッシュボードページの移行

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/DashboardClient.tsx`
- Modify: `app/dashboard/PortfolioSummary.tsx`
- Modify: `app/dashboard/BudgetSummary.tsx`
- Modify: `app/dashboard/FeaturedStocksByCategory.tsx`

**Step 1: dashboard/page.tsxを更新**

Modify: `app/dashboard/page.tsx`

Server Componentなので`getTranslations`を使用。主に条件分岐で使用されている文言を置き換え：

```typescript
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Header from "@/app/components/Header";
import BottomNavigation from "@/app/components/BottomNavigation";
import DashboardClient from "./DashboardClient";
import FeaturedStocksByCategory from "./FeaturedStocksByCategory";
import PortfolioSummary from "./PortfolioSummary";
import PortfolioHistoryChart from "./PortfolioHistoryChart";
import PortfolioCompositionChart from "./PortfolioCompositionChart";
import NikkeiSummary from "./NikkeiSummary";
import BudgetSummary from "./BudgetSummary";
import { SectorTrendHeatmap } from "./SectorTrendHeatmap";
import { getRichStyleLabel } from "@/lib/constants";
import { getTranslations } from 'next-intl/server';

export default async function DashboardPage() {
  const session = await auth();
  const t = await getTranslations();

  if (!session?.user?.email) {
    redirect("/login");
  }

  // ユーザー情報を取得
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      termsAccepted: true,
      privacyPolicyAccepted: true,
      settings: true,
      watchlistStocks: {
        select: { id: true },
      },
      portfolioStocks: {
        select: { id: true },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  // 利用規約・プライバシーポリシー未同意の場合は同意ページへリダイレクト
  if (!user.termsAccepted || !user.privacyPolicyAccepted) {
    redirect("/terms-acceptance");
  }

  const hasHoldings = user.portfolioStocks.length > 0;
  const hasWatchlist = user.watchlistStocks.length > 0;

  // 投資スタイルラベルを取得
  const investmentStyleLabel = user.settings?.investmentStyle
    ? getRichStyleLabel(user.settings.investmentStyle as string)
    : null;

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">
        <DashboardClient userId={user.id} />

        {/* 投資スタイル表示 */}
        {investmentStyleLabel && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{investmentStyleLabel.icon}</span>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {investmentStyleLabel.label}
                </h3>
                <p className="text-sm text-gray-600">
                  {investmentStyleLabel.tagline}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* セクタートレンド */}
        <div className="mb-6">
          <SectorTrendHeatmap />
        </div>

        {/* 日経平均サマリー */}
        <div className="mb-6">
          <NikkeiSummary />
        </div>

        {/* ポートフォリオ保有がある場合 */}
        {hasHoldings && (
          <>
            <div className="mb-6">
              <BudgetSummary userId={user.id} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <PortfolioSummary userId={user.id} />
              <PortfolioCompositionChart userId={user.id} />
            </div>
            <div className="mb-6">
              <PortfolioHistoryChart userId={user.id} />
            </div>
          </>
        )}

        {/* ポートフォリオが空の場合 */}
        {!hasHoldings && !hasWatchlist && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {t('portfolio.title')}
            </h2>
            <p className="text-gray-600 mb-4">
              まだ銘柄を登録していません。下の「今日の注目銘柄」から気になる銘柄を追加してみましょう。
            </p>
            <Link
              href="/my-stocks"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              {t('portfolio.myStocks')}
            </Link>
          </div>
        )}

        {/* 今日の注目銘柄 */}
        <FeaturedStocksByCategory userId={user.id} />
      </main>
      <BottomNavigation />
    </>
  );
}
```

**Step 2: DashboardClient.tsxを更新**

Modify: `app/dashboard/DashboardClient.tsx`

Client Componentなので`useTranslations`を使用：

```typescript
"use client";

import { useEffect } from "react";
import { useTranslations } from 'next-intl';

interface DashboardClientProps {
  userId: string;
}

export default function DashboardClient({ userId }: DashboardClientProps) {
  const t = useTranslations('common');

  useEffect(() => {
    // バッジ数を取得する処理など
    async function fetchBadges() {
      try {
        const res = await fetch("/api/badges");
        if (res.ok) {
          const data = await res.json();
          // バッジ処理
        }
      } catch (error) {
        console.error(t('errors.loadFailed'), error);
      }
    }

    fetchBadges();
  }, [userId, t]);

  return null;
}
```

**Step 3: PortfolioSummary.tsxを更新**

Modify: `app/dashboard/PortfolioSummary.tsx`

```typescript
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { getTranslations } from 'next-intl/server';

interface PortfolioSummaryProps {
  userId: string;
}

export default async function PortfolioSummary({
  userId,
}: PortfolioSummaryProps) {
  const t = await getTranslations('portfolio');

  // ... 既存のデータ取得ロジック ...

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {t('summary.title')}
        </h2>
        <Link
          href="/my-stocks"
          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          {t('myStocks')}
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">{t('summary.totalValue')}</span>
          <span className="text-lg font-semibold text-gray-900">
            {totalValue.toLocaleString()}円
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">{t('summary.totalGain')}</span>
          <span
            className={`text-lg font-semibold ${
              totalGain >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {totalGain >= 0 ? "+" : ""}
            {totalGain.toLocaleString()}円
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">{t('summary.gainRate')}</span>
          <span
            className={`text-lg font-semibold ${
              gainRate >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {gainRate >= 0 ? "+" : ""}
            {gainRate.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: BudgetSummary.tsxとFeaturedStocksByCategory.tsxも同様に更新**

各コンポーネントで表示している文言を翻訳関数に置き換え。

**Step 5: コミット**

```bash
git add app/dashboard/
git commit -m "feat: migrate dashboard components to use i18n"
```

---

## Task 9: マイ銘柄ページの移行

**Files:**
- Modify: `app/my-stocks/page.tsx`
- Modify: `app/my-stocks/MyStocksClient.tsx`
- Modify: `app/my-stocks/StockCard.tsx`
- Modify: `app/my-stocks/AddStockDialog.tsx`

各コンポーネントで`getTranslations`または`useTranslations`を使用して文言を置き換え。

**Step 1〜4: 各ファイルを順次更新**

詳細は省略しますが、以下のパターンで更新：

- Server Component: `const t = await getTranslations('portfolio')`
- Client Component: `const t = useTranslations('portfolio')`
- JSX内の文字列: `{t('key')}`
- 動的な値: `{t('price', { value: 1500 })}`

**Step 5: コミット**

```bash
git add app/my-stocks/
git commit -m "feat: migrate my-stocks components to use i18n"
```

---

## Task 10: 銘柄詳細ページの移行

**Files:**
- Modify: `app/stocks/[stockId]/page.tsx`
- Modify: `app/stocks/[stockId]/StockDetailClient.tsx`
- Modify: `app/components/StockHeader.tsx`
- Modify: `app/components/CurrentPriceCard.tsx`
- Modify: `app/components/PurchaseRecommendation.tsx`
- Modify: `app/components/TechnicalAnalysis.tsx`
- Modify: `app/components/FinancialMetrics.tsx`
- Modify: `app/components/RelatedNews.tsx`

同様に翻訳関数を使用して更新。

**Step 1〜7: 各ファイルを順次更新**

**Step 8: コミット**

```bash
git add app/stocks/ app/components/
git commit -m "feat: migrate stock detail components to use i18n"
```

---

## Task 11: ニュースページの移行

**Files:**
- Modify: `app/news/page.tsx`
- Modify: `app/news/NewsPageClient.tsx`

**Step 1〜2: 各ファイルを更新**

**Step 3: コミット**

```bash
git add app/news/
git commit -m "feat: migrate news components to use i18n"
```

---

## Task 12: AIレポートページの移行

**Files:**
- Modify: `app/ai-report/page.tsx`
- Modify: `app/ai-report/AIReportClient.tsx`
- Modify: `app/ai-report/components/AnalysisTab.tsx`
- Modify: `app/ai-report/components/OutcomesTab.tsx`

**Step 1〜4: 各ファイルを更新**

**Step 5: コミット**

```bash
git add app/ai-report/
git commit -m "feat: migrate ai-report components to use i18n"
```

---

## Task 13: 設定・認証ページの移行

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/terms/page.tsx`
- Modify: `app/privacy/page.tsx`
- Modify: `app/disclaimer/page.tsx`
- Modify: `app/terms-acceptance/page.tsx`

**Step 1〜6: 各ファイルを更新**

**Step 7: コミット**

```bash
git add app/settings/ app/login/ app/terms/ app/privacy/ app/disclaimer/ app/terms-acceptance/
git commit -m "feat: migrate settings and auth pages to use i18n"
```

---

## Task 14: 通知ページの移行

**Files:**
- Modify: `app/notifications/page.tsx`
- Modify: `app/components/NotificationBell.tsx`
- Modify: `app/components/PushNotificationPrompt.tsx`

**Step 1〜3: 各ファイルを更新**

**Step 4: コミット**

```bash
git add app/notifications/ app/components/NotificationBell.tsx app/components/PushNotificationPrompt.tsx
git commit -m "feat: migrate notification components to use i18n"
```

---

## Task 15: その他のページ・コンポーネントの移行

**Files:**
- Modify: `app/menu/page.tsx`
- Modify: `app/menu/MenuClient.tsx`
- Modify: `app/market-movers/page.tsx`
- Modify: `app/portfolio-analysis/page.tsx`
- Modify: `app/not-found.tsx`

**Step 1〜5: 各ファイルを更新**

**Step 6: コミット**

```bash
git add app/menu/ app/market-movers/ app/portfolio-analysis/ app/not-found.tsx
git commit -m "feat: migrate remaining pages to use i18n"
```

---

## Task 16: ハードコード文字列の検索と削除

**Files:**
- All modified files

**Step 1: 日本語文字列が残っていないか検索**

```bash
# コンポーネント内の日本語文字列を検索
grep -r "[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]" app/ --include="*.tsx" --include="*.ts"
```

**Step 2: 見つかった文字列を翻訳関数に置き換え**

各ファイルで残っているハードコード文字列を翻訳ファイルに追加し、翻訳関数を使用するよう修正。

**Step 3: コミット**

```bash
git add .
git commit -m "feat: remove remaining hardcoded strings"
```

---

## Task 17: ビルドとテスト

**Files:**
- N/A

**Step 1: TypeScriptの型チェック**

```bash
npx tsc --noEmit
```

Expected: 型エラーがないことを確認

**Step 2: 本番ビルド**

```bash
npm run build
```

Expected: ビルドが成功することを確認

**Step 3: 開発サーバーで動作確認**

```bash
npm run dev
```

ブラウザで以下のページを確認：
- [ ] ダッシュボード（/dashboard）
- [ ] マイ銘柄（/my-stocks）
- [ ] 銘柄詳細（/stocks/[stockId]）
- [ ] ニュース（/news）
- [ ] AIレポート（/ai-report）
- [ ] 設定（/settings）
- [ ] 通知（/notifications）
- [ ] メニュー（/menu）

**Step 4: 翻訳キーの存在確認**

存在しないキーを使用している場合、開発環境でキー名がそのまま表示されるので確認。

---

## Task 18: ドキュメント更新とコミット

**Files:**
- Modify: `README.md`（必要に応じて）
- Create: `docs/i18n.md`（i18nの使い方ドキュメント）

**Step 1: i18nドキュメントを作成**

Create: `docs/i18n.md`

```markdown
# i18n（多言語対応）ガイド

## 概要

このプロジェクトではnext-intlを使用してi18nを実装しています。

## 翻訳ファイルの構造

翻訳ファイルは `locales/ja/` に機能・ドメインごとに分割されています：

- `common.json` - 共通UI要素
- `portfolio.json` - ポートフォリオ関連
- `stocks.json` - 銘柄情報
- `analysis.json` - AI分析・レポート
- `notifications.json` - 通知
- `settings.json` - 設定
- `auth.json` - ログイン・利用規約
- `news.json` - ニュース

## 使い方

### Server Componentの場合

\`\`\`typescript
import { getTranslations } from 'next-intl/server';

export default async function MyComponent() {
  const t = await getTranslations('stocks');

  return <h1>{t('title')}</h1>;
}
\`\`\`

### Client Componentの場合

\`\`\`typescript
'use client';
import { useTranslations } from 'next-intl';

export default function MyComponent() {
  const t = useTranslations('stocks');

  return <h1>{t('title')}</h1>;
}
\`\`\`

### 動的な値の挿入

\`\`\`typescript
// JSONファイル
{
  "price": "{value}円"
}

// コンポーネント
{t('price', { value: 1500 })}
// 出力: 1500円
\`\`\`

## 新しい翻訳の追加

1. 該当するJSONファイルにキーを追加
2. TypeScript型定義が自動更新される
3. コンポーネントで`t('newKey')`を使用

## 将来の多言語対応

英語対応が必要になった場合：
1. `locales/en/`ディレクトリを作成
2. 各JSONファイルを英語版で作成
3. `lib/i18n.ts`でロケール検出ロジックを追加
```

**Step 2: README更新（必要に応じて）**

**Step 3: 最終コミット**

```bash
git add docs/i18n.md README.md
git commit -m "docs: add i18n documentation"
```

---

## 完了確認チェックリスト

- [ ] next-intlがインストールされている
- [ ] 翻訳ファイルが全て作成されている
- [ ] ルートレイアウトにNextIntlClientProviderが追加されている
- [ ] 全ページ・コンポーネントで翻訳関数を使用している
- [ ] ハードコードされた日本語文字列がない
- [ ] TypeScript型チェックが通る
- [ ] 本番ビルドが成功する
- [ ] 開発環境で全ページが正常に表示される
- [ ] ドキュメントが更新されている

---

## 注意事項

### 翻訳ファイルの更新

翻訳ファイルを更新した場合、開発サーバーを再起動する必要があります：

```bash
# 開発サーバーを停止（Ctrl+C）
npm run dev  # 再起動
```

### 型補完

`types/i18n.d.ts`により、`t('key')`のkeyが型補完されます。存在しないキーを使用するとTypeScriptエラーになります。

### ネストされたキー

翻訳キーはドット記法でネストできます：

```typescript
t('portfolio.summary.totalValue')  // "評価額合計"
```

### パフォーマンス

next-intlはビルド時に翻訳ファイルをバンドルするため、ランタイムでのパフォーマンスへの影響はありません。
