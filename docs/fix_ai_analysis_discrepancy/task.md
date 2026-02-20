# タスクリスト - AI分析の判断不一致の修正

- [x] `lib/purchase-recommendation-core.ts` の再修正
  - [x] 出来高分析 (`buildVolumeAnalysisContext`) の追加
  - [x] 相対強度分析 (`buildRelativeStrengthContext`) の追加
  - [x] プロンプトの再刷新（キャッシュ予測よりリアルタイムシグナルを優先するよう指示）
  - [x] **テクニカル指標による強制補正ロジックの導入**（`getCombinedSignal` を活用）
- [x] 動作確認（ブライトパス・バイオ等の下落銘柄で一貫性を確認）
- [x] 修正内容の解説（Walkthrough）の更新
