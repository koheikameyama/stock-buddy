import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout";
import MyStockDetailClient from "./MyStockDetailClient";
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator";
import { StockDetailSkeleton } from "@/components/skeletons";

export default async function MyStockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user?.email) {
    redirect("/login");
  }

  return (
    <AuthenticatedLayout maxWidth="4xl">
      <Suspense fallback={<StockDetailSkeleton />}>
        <StockDetailContent email={session.user.email} stockId={id} />
      </Suspense>
    </AuthenticatedLayout>
  );
}

async function StockDetailContent({
  email,
  stockId,
}: {
  email: string;
  stockId: string;
}) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    redirect("/login");
  }

  // Fetch the specific user stock (either portfolio or watchlist)
  const [portfolioStock, watchlistStock] = await Promise.all([
    prisma.portfolioStock.findFirst({
      where: {
        id: stockId,
        userId: user.id,
      },
      include: {
        stock: true,
        transactions: {
          orderBy: {
            transactionDate: "desc",
          },
        },
      },
    }),
    prisma.watchlistStock.findFirst({
      where: {
        id: stockId,
        userId: user.id,
      },
      include: {
        stock: {
          include: {
            analyses: {
              orderBy: { analyzedAt: "desc" },
              take: 1,
              select: { limitPrice: true },
            },
          },
        },
      },
    }),
  ]);

  const userStock = portfolioStock || watchlistStock;

  if (!userStock) {
    redirect("/my-stocks");
  }

  // Calculate portfolio values from transactions
  let calculatedQuantity: number | undefined;
  let calculatedAveragePrice: number | undefined;
  let calculatedPurchaseDate: string | undefined;

  if (portfolioStock && portfolioStock.transactions.length > 0) {
    const { quantity, averagePurchasePrice } =
      calculatePortfolioFromTransactions(portfolioStock.transactions);
    calculatedQuantity = quantity;
    calculatedAveragePrice = averagePurchasePrice.toNumber();

    // Get the first purchase date
    const firstBuyTransaction = [...portfolioStock.transactions]
      .sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())
      .find((t) => t.type === "buy");
    calculatedPurchaseDate = firstBuyTransaction?.transactionDate.toISOString();
  }

  // Transform to unified format
  // Transform to unified format for chat context and display
  const portfolioDetails =
    portfolioStock &&
    calculatedQuantity !== undefined &&
    calculatedAveragePrice !== undefined
      ? {
          quantity: calculatedQuantity,
          averagePurchasePrice: calculatedAveragePrice,
          profit:
            (userStock.stock.latestPrice
              ? Number(userStock.stock.latestPrice)
              : calculatedAveragePrice) *
              calculatedQuantity -
            calculatedAveragePrice * calculatedQuantity,
          // 上記は暫定的。MyStockDetailClient内で最新価格を使って再計算されるが、初期値として渡す
          profitPercent: 0,
        }
      : undefined;

  const stockData = {
    id: userStock.id,
    stockId: userStock.stockId,
    type: portfolioStock ? ("portfolio" as const) : ("watchlist" as const),
    // Portfolio fields (calculated from transactions)
    quantity: calculatedQuantity,
    averagePurchasePrice: calculatedAveragePrice,
    purchaseDate: calculatedPurchaseDate,
    // Individual TP/SL settings (rates in %)
    takeProfitRate: portfolioStock?.takeProfitRate
      ? Number(portfolioStock.takeProfitRate)
      : null,
    stopLossRate: portfolioStock?.stopLossRate
      ? Number(portfolioStock.stopLossRate)
      : null,
    // Watchlist fields
    targetBuyPrice: watchlistStock?.targetBuyPrice
      ? Number(watchlistStock.targetBuyPrice)
      : null,
    // AI suggested limit price (fallback for buy alert)
    limitPrice: watchlistStock?.stock.analyses?.[0]?.limitPrice
      ? Number(watchlistStock.stock.analyses[0].limitPrice)
      : null,
    transactions: portfolioStock?.transactions.map((t) => ({
      id: t.id,
      type: t.type,
      quantity: t.quantity,
      price: Number(t.price),
      totalAmount: Number(t.totalAmount),
      transactionDate: t.transactionDate.toISOString(),
    })),
    // Stock info
    stock: {
      id: userStock.stock.id,
      tickerCode: userStock.stock.tickerCode,
      name: userStock.stock.name,
      sector: userStock.stock.sector,
      market: userStock.stock.market,
      currentPrice: userStock.stock.latestPrice
        ? Number(userStock.stock.latestPrice)
        : null,
      fiftyTwoWeekHigh: userStock.stock.fiftyTwoWeekHigh
        ? Number(userStock.stock.fiftyTwoWeekHigh)
        : null,
      fiftyTwoWeekLow: userStock.stock.fiftyTwoWeekLow
        ? Number(userStock.stock.fiftyTwoWeekLow)
        : null,
      // Financial metrics
      pbr: userStock.stock.pbr ? Number(userStock.stock.pbr) : null,
      per: userStock.stock.per ? Number(userStock.stock.per) : null,
      roe: userStock.stock.roe ? Number(userStock.stock.roe) : null,
      operatingCF: userStock.stock.operatingCF
        ? Number(userStock.stock.operatingCF)
        : null,
      freeCF: userStock.stock.freeCF ? Number(userStock.stock.freeCF) : null,
      // Earnings data
      isProfitable: userStock.stock.isProfitable,
      profitTrend: userStock.stock.profitTrend,
      revenueGrowth: userStock.stock.revenueGrowth
        ? Number(userStock.stock.revenueGrowth)
        : null,
      netIncomeGrowth: userStock.stock.netIncomeGrowth
        ? Number(userStock.stock.netIncomeGrowth)
        : null,
      eps: userStock.stock.eps ? Number(userStock.stock.eps) : null,
      latestRevenue: userStock.stock.latestRevenue
        ? Number(userStock.stock.latestRevenue)
        : null,
      latestNetIncome: userStock.stock.latestNetIncome
        ? Number(userStock.stock.latestNetIncome)
        : null,
      fetchFailCount: userStock.stock.fetchFailCount,
      isDelisted: userStock.stock.isDelisted,
    },
  };

  return (
    <MyStockDetailClient
      stock={stockData}
      portfolioDetails={portfolioDetails}
    />
  );
}
