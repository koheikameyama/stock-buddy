import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchStockPrices } from "@/lib/stock-price-fetcher";
import { removeTickerSuffix, prepareTickerForYahoo } from "@/lib/ticker-utils";

/**
 * Stock Search API
 *
 * Search stocks by ticker code or company name
 * GET /api/stocks/search?q=トヨタ
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");

    if (!query || query.length < 1) {
      return NextResponse.json({ stocks: [] });
    }

    // 検索クエリを正規化
    // 1. DB検索用：サフィックスなし（例: 7203.T -> 7203）
    const dbTickerQuery = removeTickerSuffix(query);

    // Convert half-width to full-width for Japanese character search
    const toFullWidth = (str: string) => {
      return str.replace(/[A-Za-z0-9]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) + 0xfee0);
      });
    };
    const fullWidthQuery = toFullWidth(query);

    const stocks = await prisma.stock.findMany({
      where: {
        OR: [
          { tickerCode: { startsWith: dbTickerQuery, mode: "insensitive" } },
          { tickerCode: { startsWith: query, mode: "insensitive" } },
          { tickerCode: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { name: { contains: fullWidthQuery, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        market: true,
        sector: true,
      },
      take: 20, // Limit results
    });

    // リアルタイム株価を取得（Yahoo Finance用にサフィックスを補完）
    const tickerCodesForYahoo = stocks.map((s) =>
      prepareTickerForYahoo(s.tickerCode),
    );
    const { prices } = await fetchStockPrices(tickerCodesForYahoo);

    // DBコードと取得結果をマッピング
    const priceMap = new Map();
    prices.forEach((p) => {
      priceMap.set(p.tickerCode, p.currentPrice);
    });

    // Format response with latest price
    const formattedStocks = stocks.map((stock) => ({
      id: stock.id,
      tickerCode: stock.tickerCode,
      name: stock.name,
      market: stock.market,
      sector: stock.sector,
      latestPrice: priceMap.get(stock.tickerCode) ?? null,
      latestPriceDate: null, // リアルタイム取得なので常に最新
    }));

    // Sort results: prioritize exact ticker matches
    const sortedStocks = formattedStocks.sort((a, b) => {
      const aStartsWithQuery = a.tickerCode
        .toLowerCase()
        .startsWith(dbTickerQuery.toLowerCase());
      const bStartsWithQuery = b.tickerCode
        .toLowerCase()
        .startsWith(dbTickerQuery.toLowerCase());

      if (aStartsWithQuery && !bStartsWithQuery) return -1;
      if (!aStartsWithQuery && bStartsWithQuery) return 1;

      return 0;
    });

    return NextResponse.json({ stocks: sortedStocks });
  } catch (error) {
    console.error("Error searching stocks:", error);
    return NextResponse.json(
      { error: "Failed to search stocks" },
      { status: 500 },
    );
  }
}
