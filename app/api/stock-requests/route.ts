import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { fetchStockPrices } from "@/lib/stock-price-fetcher";
import { prepareTickerForDB } from "@/lib/ticker-utils";

/**
 * 銘柄リクエストを作成する
 */
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error) return error;

  try {
    const body = await request.json();
    const { tickerCode, name, market, reason } = body;

    // バリデーション
    if (!tickerCode || tickerCode.trim() === "") {
      return NextResponse.json(
        { error: "ティッカーコードを入力してください" },
        { status: 400 },
      );
    }

    const normalizedTicker = prepareTickerForDB(tickerCode);

    // 市場判別を実施
    // 日本株（数字のみ、または新形式）の場合、実際に存在する市場（.T または .NG）を特定する
    // 米国株等の場合も、実際にデータが取得できるかを確認する
    let finalTicker = normalizedTicker;
    try {
      const { prices } = await fetchStockPrices([normalizedTicker]);
      if (prices.length > 0 && prices[0].actualTicker) {
        finalTicker = prices[0].actualTicker;
      } else {
        // 取得できない（実在しない）銘柄は登録させない
        return NextResponse.json(
          {
            error:
              "銘柄が見つからないか、データを取得できませんでした。ティッカーコードを確認してください。",
          },
          { status: 404 },
        );
      }
    } catch (error) {
      console.warn(`Market detection failed for ${normalizedTicker}:`, error);
      return NextResponse.json(
        {
          error:
            "銘柄の実在確認に失敗しました。時間をおいて再度お試しください。",
        },
        { status: 500 },
      );
    }

    // 既に同じティッカーコードの銘柄が存在するかチェック
    const existingStock = await prisma.stock.findUnique({
      where: { tickerCode: finalTicker },
      select: { id: true, name: true },
    });

    if (existingStock) {
      return NextResponse.json(
        {
          error: "この銘柄は既に登録されています",
          stock: existingStock,
        },
        { status: 409 },
      );
    }

    // 同じユーザーが同じティッカーコードで既にリクエストしているかチェック
    const existingRequest = await prisma.stockRequest.findFirst({
      where: {
        userId: user.id,
        tickerCode: finalTicker,
        status: {
          in: ["pending", "approved"],
        },
      },
    });

    if (existingRequest) {
      return NextResponse.json(
        {
          error: "この銘柄は既にリクエスト済みです",
          request: existingRequest,
        },
        { status: 409 },
      );
    }

    // リクエストを作成
    const stockRequest = await prisma.stockRequest.create({
      data: {
        userId: user.id,
        tickerCode: finalTicker,
        name: name?.trim() || null,
        market: market?.trim() || null,
        reason: reason?.trim() || null,
        status: "pending",
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "銘柄追加のリクエストを送信しました",
        request: stockRequest,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Stock request creation error:", error);
    return NextResponse.json(
      { error: "リクエストの作成に失敗しました" },
      { status: 500 },
    );
  }
}

/**
 * ユーザーの銘柄リクエスト一覧を取得する
 */
export async function GET(request: NextRequest) {
  const { user, error: getError } = await getAuthUser();
  if (getError) return getError;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: { userId: string; status?: string } = {
      userId: user.id,
    };

    if (status) {
      where.status = status;
    }

    const requests = await prisma.stockRequest.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return NextResponse.json({
      requests,
      count: requests.length,
    });
  } catch (error) {
    console.error("Stock requests fetch error:", error);
    return NextResponse.json(
      { error: "リクエストの取得に失敗しました" },
      { status: 500 },
    );
  }
}
