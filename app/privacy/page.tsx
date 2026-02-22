"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(true);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  const handleBack = () => {
    if (canGoBack) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const sections = [
    { id: "sec-1", title: "1. 収集する情報" },
    { id: "sec-2", title: "2. 情報の利用目的" },
    { id: "sec-3", title: "3. 情報の第三者提供" },
    { id: "sec-4", title: "4. 情報の保管と保護" },
    { id: "sec-5", title: "5. お客様の権利" },
    { id: "sec-6", title: "6. Cookie（クッキー）の使用" },
    { id: "sec-7", title: "7. 本ポリシーの変更" },
    { id: "sec-8", title: "8. お問い合わせ" },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const headerOffset = 80;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Simple Sticky Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors text-sm font-medium"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            戻る
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">
            プライバシーポリシー
          </h1>
          <p className="text-sm text-slate-400">最終更新日: 2026年2月22日</p>
        </div>

        <p className="mb-12 text-[15px] text-slate-600 leading-relaxed">
          Stock
          Buddy（以下「本サービス」といいます）の提供にあたり、お客様の個人情報の保護に努めております。
        </p>

        {/* Simple Table of Contents */}
        <nav className="mb-16 p-6 bg-slate-50 rounded-2xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            目次
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => scrollToSection(s.id)}
                  className="text-[13px] text-blue-600 hover:text-blue-800 transition-colors text-left"
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-16">
          <section id="sec-1" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-6 border-l-4 border-slate-200 pl-4">
              1. 収集する情報
            </h2>
            <div className="pl-5 space-y-8">
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 mb-3">
                  1.1 お客様が提供する情報
                </h3>
                <ul className="space-y-2 text-[15px] text-slate-600 list-disc pl-5">
                  <li>
                    メールアドレス、氏名、プロフィール画像（Google認証経由）
                  </li>
                  <li>投資設定情報（予算、投資期間、リスク許容度）</li>
                  <li>保有銘柄情報（銘柄、数量、取得単価）</li>
                  <li>気になる銘柄情報</li>
                </ul>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 mb-3">
                  1.2 自動的に収集される情報
                </h3>
                <ul className="space-y-2 text-[15px] text-slate-600 list-disc pl-5">
                  <li>
                    アクセスログ（IPアドレス、ブラウザ情報、アクセス日時）
                  </li>
                  <li>Cookie情報</li>
                  <li>利用状況データ（閲覧ページ、操作履歴）</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="sec-2" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-6 border-l-4 border-slate-200 pl-4">
              2. 情報の利用目的
            </h2>
            <div className="pl-5 space-y-8">
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 mb-3">
                  2.1 サービス提供のため
                </h3>
                <ul className="space-y-2 text-[15px] text-slate-600 list-disc pl-5">
                  <li>ユーザー認証、AI分析による銘柄推奨</li>
                  <li>パーソナライズされた投資アドバイス</li>
                  <li>保有銘柄管理機能の提供</li>
                </ul>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 mb-3">
                  2.2 サービス改善・コミュニケーション
                </h3>
                <ul className="space-y-2 text-[15px] text-slate-600 list-disc pl-5">
                  <li>利用状況の分析、新機能の開発、バグ修正</li>
                  <li>サービスに関する通知、重要なお知らせ、サポート対応</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="sec-3" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              3. 情報の第三者提供
            </h2>
            <div className="pl-5 space-y-4 text-[15px] text-slate-600 leading-relaxed">
              <p>
                当社は、お客様の同意がある場合や法令に基づく場合を除き、個人情報を第三者に提供しません。
              </p>
              <div className="p-5 bg-slate-50 rounded-xl">
                <p className="font-bold text-slate-800 mb-2">
                  外部サービスの利用
                </p>
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <span className="font-medium">Google OAuth</span>:
                    ユーザー認証
                  </li>
                  <li>
                    <span className="font-medium">OpenAI API</span>: AI分析機能
                  </li>
                  <li>
                    <span className="font-medium">Railway</span>: ホスティング
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section id="sec-5" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              5. お客様の権利
            </h2>
            <p className="pl-5 mb-4 text-[15px] text-slate-600">
              お客様は、以下の権利を有します。
            </p>
            <ul className="pl-10 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[15px] text-slate-600 list-disc">
              <li>個人情報の開示請求</li>
              <li>個人情報の訂正・削除請求</li>
              <li>利用停止請求</li>
              <li>アカウントの削除</li>
            </ul>
          </section>

          <section id="sec-8" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-6 border-l-4 border-slate-200 pl-4">
              8. お問い合わせ
            </h2>
            <div className="pl-5">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-sm font-bold text-slate-900 mb-1">
                  Stock Buddy 個人情報保護担当
                </p>
                <p className="text-sm text-blue-600">privacy@stock-buddy.net</p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="py-20 border-t border-slate-50 text-center">
        <p className="text-slate-300 text-[10px] uppercase tracking-widest">
          &copy; 2026 Stock Buddy
        </p>
      </footer>
    </div>
  );
}
