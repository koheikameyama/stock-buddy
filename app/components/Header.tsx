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
