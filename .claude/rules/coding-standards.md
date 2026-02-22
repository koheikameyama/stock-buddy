# コーディング規約

## マジックナンバーを避ける

**コード内に直接数値を書かないでください。**

- 閾値、制限値、設定値は `lib/constants.ts` で定義する
- 定数には意味のある名前をつける

```typescript
// ✅ 良い例
import { PORTFOLIO_ANALYSIS } from "@/lib/constants";
if (daysSincePurchase <= PORTFOLIO_ANALYSIS.RECENT_PURCHASE_DAYS) { ... }

// ❌ 悪い例
if (daysSincePurchase <= 3) { ... }
```

## 後方互換性

**URLやAPIの後方互換性は担保しません。**

- 旧URLから新URLへのリダイレクトやreplaceは不要
- 古いURLを参照している通知等は、そのままエラーになってOK
- 新しい実装に合わせて、関連する全ての箇所を一括で更新する

```typescript
// ❌ 不要: 後方互換性のためのURL変換
url = url.replace(/^\/watchlist\//, "/my-stocks/");

// ✅ 正しい: 新しいURLをそのまま使用
const url = notification.url;
```

## ループ処理の並列化

**ループ内の非同期処理は可能な限り並列化してください。**

### TypeScript: p-limitを使用

```typescript
import pLimit from "p-limit";

const limit = pLimit(5); // 同時実行数を制限

// ❌ 悪い例: 順次実行
for (const item of items) {
  await processItem(item);
}

// ✅ 良い例: 並列実行
const tasks = items.map((item) =>
  limit(async () => {
    await processItem(item);
  }),
);
await Promise.all(tasks);
```

### Python: ThreadPoolExecutorを使用

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

# ✅ 良い例: 並列実行
with ThreadPoolExecutor(max_workers=3) as executor:
    futures = [executor.submit(process_item, item) for item in items]
    for future in as_completed(futures):
        result = future.result()
```

### 同時実行数の目安

| 処理タイプ            | 推奨同時実行数 | 理由                   |
| --------------------- | -------------- | ---------------------- |
| OpenAI API            | 3〜5           | レート制限を回避       |
| DB操作                | 10〜20         | コネクションプール考慮 |
| 外部API（yfinance等） | 5〜10          | サーバー負荷考慮       |
| プッシュ通知          | 10             | ネットワーク効率       |

### パイプライン化の検討

処理が2つ以上の段階に分かれる場合（例: データ取得 → AI処理 → DB保存）、Producer-Consumerパターンでパイプライン化を検討してください。

```python
import queue
import threading
from concurrent.futures import ThreadPoolExecutor

SENTINEL = None

def producer(items: list, q: queue.Queue):
    for item in items:
        result = fetch_data(item)
        q.put(result)
    q.put(SENTINEL)

def main():
    q: queue.Queue = queue.Queue(maxsize=CONCURRENCY * 2)
    thread = threading.Thread(target=producer, args=(items, q), daemon=True)
    thread.start()

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = []
        while True:
            item = q.get()
            if item is SENTINEL:
                break
            futures.append(executor.submit(process_item, item))

        for future in futures:
            result = future.result()
```

## 設計ファイルの扱い

実装された設計ファイルはコミット前に削除してください。
