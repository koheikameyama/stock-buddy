import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator";
import { fetchStockPrices } from "@/lib/stock-price-fetcher";
import { removeTickerSuffix } from "@/lib/ticker-utils";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error) return error;

  try {
    // 全PortfolioStockを取得し、Transactionから計算して売却済み（quantity=0）を抽出
    const allPortfolioStocks = await prisma.portfolioStock.findMany({
      where: { userId: user.id },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            market: true,
          },
        },
        transactions: {
          orderBy: { transactionDate: "asc" },
        },
      },
    });
    const portfolioStocks = allPortfolioStocks.filter((ps) => {
      const { quantity } = calculatePortfolioFromTransactions(ps.transactions);
      return quantity === 0;
    });

    // 売却済み銘柄をマッピング（ウォッチリストの状態に関わらず全件表示）
    const soldStocks = portfolioStocks
      .map((ps) => {
        // 取引履歴から情報を計算
        const buyTransactions = ps.transactions.filter((t) => t.type === "buy");
        const sellTransactions = ps.transactions.filter(
          (t) => t.type === "sell",
        );

        if (buyTransactions.length === 0 || sellTransactions.length === 0)
          return null;

        // 最初の購入日と最後の売却日
        const firstPurchaseDate = buyTransactions[0].transactionDate;
        const lastSellDate =
          sellTransactions[sellTransactions.length - 1].transactionDate;

        // 総購入金額と総売却金額を計算
        const totalBuyAmount = buyTransactions.reduce(
          (sum, t) => sum.plus(t.totalAmount),
          new Decimal(0),
        );
        const totalSellAmount = sellTransactions.reduce(
          (sum, t) => sum.plus(t.totalAmount),
          new Decimal(0),
        );

        // 損益計算
        const totalProfit = totalSellAmount.minus(totalBuyAmount);
        const profitPercent = totalBuyAmount.gt(0)
          ? totalProfit.div(totalBuyAmount).times(100)
          : new Decimal(0);

        // 総取引数量
        const totalBuyQuantity = buyTransactions.reduce(
          (sum, t) => sum + t.quantity,
          0,
        );

        return {
          id: ps.id,
          stockId: ps.stockId,
          stock: ps.stock,
          firstPurchaseDate: firstPurchaseDate.toISOString(),
          lastSellDate: lastSellDate.toISOString(),
          totalBuyQuantity,
          totalBuyAmount: totalBuyAmount.toNumber(),
          totalSellAmount: totalSellAmount.toNumber(),
          totalProfit: totalProfit.toNumber(),
          profitPercent: profitPercent.toNumber(),
          transactions: ps.transactions.map((t) => ({
            id: t.id,
            type: t.type,
            quantity: t.quantity,
            price: t.price.toNumber(),
            totalAmount: t.totalAmount.toNumber(),
            transactionDate: t.transactionDate.toISOString(),
          })),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      // 最後の売却日でソート（新しい順）
      .sort(
        (a, b) =>
          new Date(b.lastSellDate).getTime() -
          new Date(a.lastSellDate).getTime(),
      );

    // 売却済み銘柄のティッカーコードを収集
    const tickerCodes = soldStocks.map((ss) => ss.stock.tickerCode);

    // 現在価格を取得
    const priceMap: Map<string, number> = new Map();
    if (tickerCodes.length > 0) {
      try {
        const { prices } = await fetchStockPrices(tickerCodes);
        prices.forEach((p) => {
          // サフィックスを除去してマッピング
          const code = removeTickerSuffix(p.tickerCode);
          priceMap.set(code, p.currentPrice);
        });
      } catch (error) {
        console.error("Error fetching current prices:", error);
      }
    }

    // hypothetical値を計算して追加
    const soldStocksWithHypothetical = soldStocks.map((ss) => {
      const currentPrice = priceMap.get(ss.stock.tickerCode) ?? null;

      if (currentPrice === null) {
        return {
          ...ss,
          currentPrice: null,
          hypotheticalValue: null,
          hypotheticalProfit: null,
          hypotheticalProfitPercent: null,
        };
      }

      // 今も保有してたらの金額 = 現在価格 × 総購入数
      const hypotheticalValue = currentPrice * ss.totalBuyQuantity;
      // 今も保有してたらの損益 = 今も保有してたらの金額 - 購入金額
      const hypotheticalProfit = hypotheticalValue - ss.totalBuyAmount;
      // 今も保有してたらの損益% = (損益 / 購入金額) × 100
      const hypotheticalProfitPercent =
        ss.totalBuyAmount > 0
          ? (hypotheticalProfit / ss.totalBuyAmount) * 100
          : 0;

      return {
        ...ss,
        currentPrice,
        hypotheticalValue,
        hypotheticalProfit,
        hypotheticalProfitPercent,
      };
    });

    return NextResponse.json(soldStocksWithHypothetical);
  } catch (error) {
    console.error("Error fetching sold stocks:", error);
    return NextResponse.json(
      { error: "売却済み銘柄の取得に失敗しました" },
      { status: 500 },
    );
  }
}
