# SSL証明書エラーの調査 (`stock-buddy.net`)

`https://stock-buddy.net/` で発生している TLS/SSL 証明書のミスマッチ（SAN mismatch）エラーの原因を調査し、解決策を提示します。

- [x] 現状のドメイン設定（DNS）の確認
- [x] 現在提示されている証明書の詳細確認
  - Apex (`stock-buddy.net`): Cloudflare/Google Trust Services (正常)
  - `www`: `150.95.255.38` (調査中)
- [x] エラー原因の特定と解決策の提示 `[/]`
