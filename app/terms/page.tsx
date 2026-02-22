"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function TermsOfServicePage() {
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
    { id: "art-1", title: "第1条（適用）" },
    { id: "art-2", title: "第2条（定義）" },
    { id: "art-3", title: "第3条（アカウント登録）" },
    { id: "art-4", title: "第4条（本サービスの内容）" },
    { id: "art-5", title: "第5条（免責事項）" },
    { id: "art-6", title: "第6条（禁止事項）" },
    { id: "art-7", title: "第7条（利用制限）" },
    { id: "art-8", title: "第8条（知的財産権）" },
    { id: "art-9", title: "第9条（本規約の変更）" },
    { id: "art-10", title: "第10条（退会）" },
    { id: "art-11", title: "第11条（準拠法・管轄裁判所）" },
    { id: "art-12", title: "第12条（お問い合わせ）" },
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
            利用規約
          </h1>
          <p className="text-sm text-slate-400">最終更新日: 2026年2月22日</p>
        </div>

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
          <section id="art-1" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              第1条（適用）
            </h2>
            <div className="pl-5 space-y-3 text-[15px] leading-relaxed text-slate-600">
              <p>
                1. 本利用規約（以下「本規約」といいます）は、Stock
                Buddy（以下「本サービス」といいます）の利用条件を定めるものです。
              </p>
              <p>
                2.
                本規約は、本サービスを利用するすべてのユーザー（以下「ユーザー」といいます）に適用されます。
              </p>
              <p>
                3.
                ユーザーは、本サービスを利用することにより、本規約に同意したものとみなされます。
              </p>
            </div>
          </section>

          <section id="art-2" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              第2条（定義）
            </h2>
            <p className="pl-5 mb-4 text-[15px] text-slate-600">
              本規約において使用する用語の定義は、以下のとおりとします。
            </p>
            <ul className="pl-5 space-y-3 text-[15px] leading-relaxed text-slate-600">
              <li className="flex gap-2">
                <span>1.</span>
                <span>
                  「本サービス」とは、当社が提供するStock
                  Buddyおよびこれに関連するサービス一切を指します。
                </span>
              </li>
              <li className="flex gap-2">
                <span>2.</span>
                <span>
                  「ユーザー」とは、本サービスを利用する個人を指します。
                </span>
              </li>
              <li className="flex gap-2">
                <span>3.</span>
                <span>
                  「登録情報」とは、ユーザーが本サービスに登録した情報を指します。
                </span>
              </li>
              <li className="flex gap-2">
                <span>4.</span>
                <span>
                  「投資設定」とは、予算、投資期間、リスク許容度等、ユーザーが本サービスで設定する情報を指します。
                </span>
              </li>
              <li className="flex gap-2">
                <span>5.</span>
                <span>
                  「保有銘柄」とは、ユーザーが本サービスで管理する株式の保有情報を指します。
                </span>
              </li>
            </ul>
          </section>

          <section id="art-3" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              第3条（アカウント登録）
            </h2>
            <div className="pl-5 space-y-3 text-[15px] leading-relaxed text-slate-600">
              <p>
                1.
                本サービスの利用を希望する方は、Google認証を通じてアカウント登録を行うものとします。
              </p>
              <p>
                2.
                ユーザーは、登録情報について、正確かつ最新の情報を提供するものとします。
              </p>
              <p>
                3.
                ユーザーは、自己の責任において、アカウント情報を適切に管理するものとします。
              </p>
            </div>
          </section>

          <section id="art-4" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              第4条（本サービスの内容）
            </h2>
            <p className="pl-5 mb-4 text-[15px] text-slate-600">
              本サービスは、以下の機能を提供します。
            </p>
            <ul className="pl-10 list-disc space-y-2 text-[15px] text-slate-600">
              <li>AI分析による銘柄推奨機能</li>
              <li>保有銘柄管理機能</li>
              <li>気になる銘柄機能</li>
              <li>シミュレーション機能</li>
              <li>投資情報の提供</li>
            </ul>
            <div className="mt-6 p-4 bg-rose-50 rounded-xl text-rose-800 text-sm font-medium">
              ただし、本サービスは投資助言サービスではなく、投資判断はユーザー自身の責任において行うものとします。
            </div>
          </section>

          <section id="art-5" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              第5条（免責事項）
            </h2>
            <div className="pl-5 space-y-8 text-[15px] leading-relaxed text-slate-600">
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  1. 投資助言の否定
                </p>
                <p>
                  本サービスで提供される情報、分析、推奨は、あくまで参考情報であり、投資助言や投資勧誘を目的とするものではありません。
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  2. 投資リスクの認識
                </p>
                <p className="mb-2">
                  ユーザーは、以下のリスクを理解し、自己の責任において投資判断を行うものとします。
                </p>
                <ul className="pl-5 list-disc space-y-1">
                  <li>投資元本が減少する可能性があること</li>
                  <li>過去の実績は将来の結果を保証するものではないこと</li>
                  <li>市場の変動により損失が発生する可能性があること</li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">3. 情報の正確性</p>
                <p>
                  当社は、本サービスで提供する情報の正確性、完全性、有用性について保証するものではありません。
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  4. サービスの中断・停止
                </p>
                <p>
                  当社は、システムメンテナンス、障害、その他やむを得ない事由により、本サービスの全部または一部を予告なく中断・停止することがあります。
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">
                  5. 損害賠償の制限
                </p>
                <p>
                  当社は、本サービスの利用により生じた損害について、当社に故意または重過失がある場合を除き、一切の責任を負いません。
                </p>
              </div>
            </div>
          </section>

          <section id="art-6" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              第6条（禁止事項）
            </h2>
            <p className="pl-5 mb-4 text-[15px] text-slate-600">
              ユーザーは、本サービスの利用にあたり、以下の行為を行ってはならないものとします。
            </p>
            <ul className="pl-5 space-y-2 text-[15px] text-slate-600">
              <li className="flex gap-2">
                <span>•</span>
                <span>法令または公序良俗に違反する行為</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>犯罪行為に関連する行為</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>
                  当社または第三者の知的財産権、プライバシー等を侵害する行為
                </span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>本サービスの運営を妨害するおそれのある行為</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>不正アクセスまたはこれを試みる行為</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>他のユーザーの個人情報を収集する行為</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>虚偽の情報を登録する行為</span>
              </li>
            </ul>
          </section>

          <section id="art-11" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              第11条（準拠法・管轄裁判所）
            </h2>
            <div className="pl-5 space-y-3 text-[15px] text-slate-600">
              <p>1. 本規約の解釈にあたっては、日本法を準拠法とします。</p>
              <p>
                2.
                本サービスに関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
              </p>
            </div>
          </section>

          <section id="art-12" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4 border-l-4 border-slate-200 pl-4">
              第12条（お問い合わせ）
            </h2>
            <div className="pl-5">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-sm font-bold text-slate-900 mb-1">
                  Stock Buddy カスタマーサポート
                </p>
                <p className="text-sm text-blue-600">support@stock-buddy.net</p>
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
