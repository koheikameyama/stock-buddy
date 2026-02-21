import { PrismaClient } from "@prisma/client";
import { fetchStockPrices } from "../lib/stock-price-fetcher";

const prisma = new PrismaClient();

async function cleanupAndMigrateAll() {
  console.log("Starting full database cleanup and migration...");

  // 1. 全ての銘柄を取得
  const allStocks = await prisma.stock.findMany({
    select: { id: true, tickerCode: true, name: true },
  });

  console.log(`Checking ${allStocks.length} stocks...`);

  if (allStocks.length === 0) {
    console.log("No stocks in database.");
    return;
  }

  // 2. チャンクに分けて処理
  const BATCH_SIZE = 20;
  let updatedCount = 0;
  let deletedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
    const chunk = allStocks.slice(i, i + BATCH_SIZE);
    const tickers = chunk.map((s) => s.tickerCode);

    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allStocks.length / BATCH_SIZE)}...`,
    );

    try {
      const { prices } = await fetchStockPrices(tickers);

      // 取得結果をマップ化 (originalInput -> Result)
      const resultMap = new Map(prices.map((p) => [p.tickerCode, p]));

      for (const stock of chunk) {
        const result = resultMap.get(stock.tickerCode);

        if (result && result.actualTicker) {
          if (result.actualTicker !== stock.tickerCode) {
            // ティッカーが異なる（修正が必要な）場合
            console.log(
              `  UPDATE: ${stock.tickerCode} -> ${result.actualTicker} (${stock.name})`,
            );

            await prisma.$transaction([
              prisma.stock.update({
                where: { id: stock.id },
                data: { tickerCode: result.actualTicker },
              }),
              prisma.stockRequest.updateMany({
                where: { tickerCode: stock.tickerCode },
                data: { tickerCode: result.actualTicker },
              }),
              prisma.recommendationOutcome.updateMany({
                where: { tickerCode: stock.tickerCode },
                data: { tickerCode: result.actualTicker },
              }),
            ]);
            updatedCount++;
          } else {
            // 正しいサフィックスで取得できている場合
            skippedCount++;
          }
        } else {
          // 取得できなかった銘柄
          console.log(
            `  SKIPPING (No data found): ${stock.tickerCode} (${stock.name})`,
          );
          skippedCount++;
        }
      }
    } catch (error) {
      console.error(`Error processing batch:`, error);
    }
  }

  console.log("\nCleanup and Migration Record:");
  console.log(`- Updated: ${updatedCount}`);
  console.log(`- Deleted: ${deletedCount}`);
  console.log(`- Valid (Skipped): ${skippedCount}`);
  console.log("Completed.");
}

cleanupAndMigrateAll()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
