import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { searchAndAddStock } from "@/lib/stock-fetcher";
import { Decimal } from "@prisma/client/runtime/library";
import { syncPortfolioStockQuantity } from "@/lib/portfolio-calculator";
import { fetchDefaultTpSlRates } from "@/lib/portfolio-stock-utils";

interface ImportTransaction {
  date: string; // "2026-02-05"
  tickerCode: string; // "4005"
  type: "buy" | "sell";
  quantity: number;
  price: number;
}

/**
 * POST /api/import/rakuten-csv
 *
 * 楽天証券の取引履歴CSVをインポートする。
 * 各銘柄のCSV日付範囲内の既存トランザクションを削除して上書きする。
 */
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error) return error;

  const userId = user.id;
  const body = await request.json();
  const transactions: ImportTransaction[] = body.transactions;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json(
      { error: "transactions is required" },
      { status: 400 },
    );
  }

  // 銘柄コード別にグループ化
  const grouped = new Map<string, ImportTransaction[]>();
  for (const tx of transactions) {
    if (!grouped.has(tx.tickerCode)) grouped.set(tx.tickerCode, []);
    grouped.get(tx.tickerCode)!.push(tx);
  }

  const { takeProfitRate, stopLossRate } = await fetchDefaultTpSlRates(userId);

  let totalImported = 0;
  let totalReplaced = 0;
  const failed: { tickerCode: string; reason: string }[] = [];

  for (const [tickerCode, txList] of Array.from(grouped)) {
    try {
      const normalizedCode = `${tickerCode}.T`;

      // 銘柄マスタを検索（なければyfinanceから追加）
      let stock = await prisma.stock.findUnique({
        where: { tickerCode: normalizedCode },
      });

      if (!stock) {
        const searchResult = await searchAndAddStock(normalizedCode);
        if (!searchResult.success || !searchResult.stock) {
          failed.push({ tickerCode, reason: "銘柄が見つかりませんでした" });
          continue;
        }
        stock = await prisma.stock.findUnique({
          where: { id: searchResult.stock.id },
        });
        if (!stock) {
          failed.push({ tickerCode, reason: "銘柄の登録に失敗しました" });
          continue;
        }
      }

      // PortfolioStockを検索（なければ作成）
      let portfolioStock = await prisma.portfolioStock.findUnique({
        where: { userId_stockId: { userId, stockId: stock.id } },
      });

      if (!portfolioStock) {
        portfolioStock = await prisma.portfolioStock.create({
          data: {
            userId,
            stockId: stock.id,
            quantity: 0,
            takeProfitRate: takeProfitRate ? new Decimal(takeProfitRate) : null,
            stopLossRate: stopLossRate ? new Decimal(stopLossRate) : null,
          },
        });
      }

      // CSVの日付範囲を計算（この銘柄の最小〜最大約定日）
      const dates = txList.map((tx: ImportTransaction) => new Date(`${tx.date}T00:00:00.000Z`));
      const minDate = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())));

      // 日付範囲内の既存トランザクションを削除（置き換え）
      const { count: deletedCount } = await prisma.transaction.deleteMany({
        where: {
          portfolioStockId: portfolioStock.id,
          transactionDate: { gte: minDate, lte: maxDate },
        },
      });
      totalReplaced += deletedCount;

      // 新しいトランザクションを一括作成
      const newTxData = txList.map((tx: ImportTransaction) => ({
        userId,
        stockId: stock!.id,
        portfolioStockId: portfolioStock!.id,
        type: tx.type,
        quantity: tx.quantity,
        price: new Decimal(tx.price),
        totalAmount: new Decimal(tx.quantity).times(tx.price),
        transactionDate: new Date(`${tx.date}T00:00:00.000Z`),
      }));

      await prisma.transaction.createMany({ data: newTxData });
      totalImported += newTxData.length;

      // 全トランザクションから数量を再計算してPortfolioStockを更新
      await syncPortfolioStockQuantity(portfolioStock.id);
    } catch (err) {
      console.error(`Failed to import ticker ${tickerCode}:`, err);
      failed.push({ tickerCode, reason: "インポートに失敗しました" });
    }
  }

  return NextResponse.json({ imported: totalImported, replaced: totalReplaced, failed });
}
