import Link from "next/link";
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout";

export default function NotFound() {
  return (
    <AuthenticatedLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <h1 className="text-6xl font-black text-gray-200 mb-4">404</h1>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          ページが見つかりません
        </h2>
        <p className="text-gray-600 mb-8 max-w-md">
          お探しのページは削除されたか、名前が変更されたか、あるいは一時的に利用できない可能性があります。
        </p>
        <Link
          href="/dashboard"
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          ダッシュボードに戻る
        </Link>
      </div>
    </AuthenticatedLayout>
  );
}
