# SSL証明書エラー調査結果サマリー

`https://stock-buddy.net/` および関連ドメインの接続状況を調査しました。

## 調査結果

### 1. ドメインごとの接続先 (DNS)

- **`stock-buddy.net` (Apex)**
  - 接続先: Cloudflare (`172.67.160.141`, `104.21.14.206`)
  - 証明書: Google Trust Services (正常)
- **`www.stock-buddy.net`**
  - 接続先: `150.95.255.38` (別のサーバー)
  - 状況: Apexドメインと向き先が異なっています。

### 2. Fastly エラーの原因分析

提示されたエラーメッセージは **Fastly** のエッジサーバーから返されているものです。

> Requested host does not match any Subject Alternative Names (SANs) on TLS certificate...

現在のパブリックDNSでは `stock-buddy.net` は Cloudflare を向いていますが、以下の理由でこのエラーが発生していると考えられます：

1. **DNSの伝播遅延**: 以前 Fastly を利用しており、最近 Cloudflare に移行した場合、一部のネットワーク環境（またはキャッシュ）でまだ Fastly のサーバーに接続しようとしている。
2. **サブリソースの不一致**: API呼び出しや画像などのリソースが「Fastlyを向いている古いサブドメイン」をターゲットにしており、そこで証明書エラーが発生している。
3. **インフラ構成の乖離**: Apexドメインは Cloudflare ですが、特定の経路やバックエンドで Fastly が介在しており、そこでのドメイン名設定（SAN）が不足している。

## 推奨される対応

- **DNS設定の統一**: `www` サブドメインも `stock-buddy.net` と同じ Cloudflare に向けることをお勧めします。
- **証明書の更新**: Fastly を継続利用する場合は、Fastly の管理画面で `stock-buddy.net` を証明書の SAN に追加する必要があります。
