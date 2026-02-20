# SSL証明書エラー調査・解決計画

`https://stock-buddy.net/` で発生している「Requested host does not match any Subject Alternative Names (SANs)」エラーの原因を特定し、解決策を提示します。

## 調査状況

- `stock-buddy.net` (Apex) は現在 Cloudflare (`172.67.160.141`, `104.21.14.206`) を向いている。
- `www.stock-buddy.net` は別のIP (`150.95.255.38`) を向いている。
- エラーメッセージには `Fastly` のドキュメントへのリンクが含まれており、Fastlyが関与している可能性が高い。

## 提案される調査・修正手順

### 1. 証明書の詳細確認

実際に `stock-buddy.net` にアクセスした際に提示される証明書の `Subject Alternative Name` を確認し、`stock-buddy.net` が含まれているか検証します。

### 2. インフラ構成の特定

なぜ Fastly のエラーが出るのかを確認します。

- Cloudflare がフロントに立ち、オリジンとして Fastly を使用している可能性。
- または、以前 Fastly を利用しており、DNSの伝播待ち、あるいは古い設定が残っている可能性。

### 3. DNSおよびTLS設定の修正

- Apexドメイン (`stock-buddy.net`) とサブドメイン (`www.stock-buddy.net`) の向き先を統一するか、それぞれに対して正しい証明書を適用します。
- Fastly/Cloudflare 等のコントロールパネルで、対象ドメインを SAN に含めるよう設定を更新します。

## 検証計画

- `curl -vI https://stock-buddy.net/` で再度チェックし、エラーが出ないことを確認。
- `openssl s_client` で SANs にドメインが含まれていることを確認。
