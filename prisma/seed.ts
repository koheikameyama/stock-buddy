import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// 学習モジュール
const learningModules = [
  {
    id: "cmlngs5d6000bwysuk1ul2ijh",
    slug: "technical-basics",
    title: "テクニカル分析入門",
    description:
      "チャートの読み方やRSI、MACDなどの基本的なテクニカル指標を学びます。初心者でも分かりやすく解説します。",
    category: "technical",
    difficulty: "beginner",
    order: 1,
    icon: "📊",
    estimatedTime: 30,
    isPublished: true,
  },
  {
    id: "cmlngs5d8000cwysugwqr89b1",
    slug: "fundamental-basics",
    title: "ファンダメンタル分析入門",
    description:
      "PER、PBR、ROEなどの財務指標の見方を学びます。企業の本質的な価値を見極める力を身につけましょう。",
    category: "fundamental",
    difficulty: "beginner",
    order: 2,
    icon: "💰",
    estimatedTime: 25,
    isPublished: true,
  },
]

// レッスン
const lessons = [
  {
    id: "cmlngs5dc000ewysuu70wkxbl",
    moduleId: "cmlngs5d6000bwysuk1ul2ijh",
    slug: "what-is-technical-analysis",
    title: "テクニカル分析とは？",
    order: 1,
    simpleContent: `# テクニカル分析とは？

株価のチャート（グラフ）を見て、今後の値動きを予測する方法です。

**ポイント**
- 過去の値動きから、今後を予測する
- 「みんながどう動くか」を読む
- 企業の業績ではなく、株価そのものを分析する

例えるなら、「天気予報」のようなもの。過去のデータから、明日の天気を予測するように、過去の株価から今後の動きを予測します。`,
    detailedContent: `# テクニカル分析の基本

テクニカル分析は、以下の3つの前提に基づいています:

## 1. 市場はすべてを織り込む
株価には、企業の業績、経済状況、投資家の心理など、すべての情報が反映されている。だから、株価そのものを分析すれば十分。

## 2. 価格はトレンドを形成する
株価は上昇・下降・横ばいのいずれかのトレンドを形成する。トレンドは、明確な転換シグナルが出るまで続く傾向がある。

## 3. 歴史は繰り返す
投資家の心理は変わらないので、似たようなパターンが繰り返される。だから、過去のパターンを学ぶことで、将来を予測できる。

## テクニカル分析で使う主なツール
- チャート（ローソク足、ライン）
- テクニカル指標（RSI、MACD、移動平均線など）
- チャートパターン（ダブルボトム、三角持ち合いなど）`,
    technicalContent: `# テクニカル分析の理論的背景

## ダウ理論（Dow Theory）
テクニカル分析の基礎となる理論。チャールズ・ダウが19世紀末に提唱。

### 6つの基本原則
1. **平均株価はすべてを織り込む**
2. **市場には3種類のトレンドがある**（主要・二次・小）
3. **主要トレンドには3つの局面がある**（先行・追随・利食い）
4. **平均は相互に確認しなければならない**
5. **トレンドは出来高でも確認される**
6. **トレンドは明確な転換シグナルが出るまで続く**

## エリオット波動理論
ラルフ・エリオットが提唱。株価は5波の上昇と3波の下降で1サイクルを形成するという理論。

## 行動ファイナンス的視点
テクニカル分析は、投資家の「認知バイアス」を利用している:
- **確証バイアス**: 自分の予想に合う情報を重視
- **アンカリング**: 最初の情報に引きずられる
- **群集心理**: 多数派に追随する傾向

これらのバイアスが、チャートパターンを形成する原因となる。`,
    relatedTermSlugs: "rsi,macd,moving-average",
  },
  {
    id: "cmlngs5di000gwysugnrx4yr5",
    moduleId: "cmlngs5d6000bwysuk1ul2ijh",
    slug: "understanding-rsi",
    title: "RSI（相対力指数）を理解する",
    order: 2,
    simpleContent: `# RSIとは？

**売られすぎ・買われすぎを判断する指標**です。

## 数値の見方
- **0〜30**: 売られすぎ → 反発の可能性あり（買いのチャンス？）
- **30〜70**: 通常範囲
- **70〜100**: 買われすぎ → 下落の可能性あり（注意が必要）

Stock Buddyでは、RSIが30を下回ると「買いシグナル」として表示されることがあります。

## 覚えておくポイント
- RSIだけで判断しない
- 他の指標と組み合わせて使う
- 強いトレンド中は「売られすぎ」「買われすぎ」が続くこともある`,
    detailedContent: `# RSI（Relative Strength Index）

## 基本的な使い方

RSIは0〜100の数値で表示されます。

### 売買シグナル
- **RSI < 30**: 売られすぎ → 買いを検討
- **RSI > 70**: 買われすぎ → 売りを検討

### ダイバージェンス（逆行現象）
重要なシグナルです：

- **強気ダイバージェンス**: 株価は下落しているが、RSIは上昇 → 反転上昇のサイン
- **弱気ダイバージェンス**: 株価は上昇しているが、RSIは下落 → 反転下落のサイン

## 注意点
- RSIだけで判断せず、他の指標と組み合わせる
- 強いトレンド中は、RSIが「売られすぎ」「買われすぎ」のまま推移することもある
- 14日間のRSIが一般的だが、期間を変えることで感度を調整できる`,
    technicalContent: `# RSI: 技術的詳細

## 計算式

\`\`\`
RSI = 100 - (100 / (1 + RS))
RS = 平均上昇幅 / 平均下落幅
\`\`\`

一般的に14日間のデータを使用。

### 計算手順
1. 過去14日間の上昇日の値上がり幅の平均を計算
2. 過去14日間の下落日の値下がり幅の平均を計算
3. RS = 上昇幅平均 / 下落幅平均
4. RSI = 100 - (100 / (1 + RS))

## Wilder's Smoothing Method
J. Welles Wilderが開発したRSIでは、単純移動平均ではなく指数移動平均（EMA）を使用:

\`\`\`
現在のRS = (前日の平均上昇 × 13 + 今日の上昇) / 14
\`\`\`

## 実装上の注意
- 最初の14日間は単純平均を使用
- 15日目以降はWilderの平滑化を適用
- RSIが50を中心に推移している場合はトレンドがない状態`,
    relatedTermSlugs: "rsi,macd",
  },
  {
    id: "cmlngs5dk000iwysuub163r4o",
    moduleId: "cmlngs5d6000bwysuk1ul2ijh",
    slug: "understanding-macd",
    title: "MACD（移動平均収束拡散法）を理解する",
    order: 3,
    simpleContent: `# MACDとは？

**トレンドの方向と強さを判断する指標**です。

## 3つの要素
1. **MACDライン**: 短期と長期の移動平均線の差
2. **シグナルライン**: MACDラインの平均
3. **ヒストグラム**: MACDラインとシグナルラインの差（棒グラフ）

## シグナルの見方
- **ゴールデンクロス**: MACDラインがシグナルラインを上に抜ける → 買いシグナル
- **デッドクロス**: MACDラインがシグナルラインを下に抜ける → 売りシグナル

シンプルに言えば、「2本の線が交差するタイミング」に注目します。`,
    detailedContent: `# MACD詳細

## MACDの構成

### MACDライン
- 12日EMA（指数移動平均）から26日EMAを引いた値
- 短期トレンドと長期トレンドの差を表す

### シグナルライン
- MACDラインの9日EMA
- MACDラインを滑らかにした線

### ヒストグラム
- MACDライン − シグナルライン
- 棒グラフで表示され、トレンドの強さを視覚化

## シグナルの種類

### ゴールデンクロス（買いシグナル）
MACDラインがシグナルラインを下から上に突き抜ける

### デッドクロス（売りシグナル）
MACDラインがシグナルラインを上から下に突き抜ける

### ゼロラインクロス
MACDラインが0を超えると上昇トレンド、0を下回ると下降トレンド

## ダイバージェンス
株価とMACDの動きが逆行する現象。トレンド転換のサインとして重要。`,
    technicalContent: `# MACD: 技術的詳細

## 計算式

\`\`\`
MACDライン = 12日EMA - 26日EMA
シグナルライン = MACDラインの9日EMA
ヒストグラム = MACDライン - シグナルライン
\`\`\`

## EMA（指数移動平均）の計算

\`\`\`
EMA = 今日の価格 × k + 昨日のEMA × (1 - k)
k = 2 / (期間 + 1)
\`\`\`

12日EMAの場合: k = 2 / 13 ≈ 0.1538

## パラメータの調整

### 標準設定（12, 26, 9）
- 多くのトレーダーが使用
- 中期的なトレンドに適している

### 短期設定（5, 13, 5）
- より敏感に反応
- ノイズも増える

### 長期設定（19, 39, 9）
- 遅いが信頼性が高い
- 大きなトレンドを捉える

## 注意点
- MACDは遅行指標（トレンド確認には有効だが、タイミングは遅れる）
- レンジ相場ではダマシが多い
- 他の指標と組み合わせて使用することを推奨`,
    relatedTermSlugs: "macd,moving-average,golden-cross",
  },
]

// 用語
const terms = [
  {
    id: "cmlngs5cf0000wysu8g1ogs7m",
    slug: "rsi",
    name: "RSI（相対力指数）",
    nameEn: "Relative Strength Index",
    category: "technical",
    simpleDescription:
      "株が「売られすぎ」か「買われすぎ」かを判断する指標。0〜100の数値で表示され、30以下なら売られすぎ、70以上なら買われすぎと判断します。",
    detailedDescription: `RSI（Relative Strength Index）は、一定期間の値上がり幅と値下がり幅の比率から算出される指標です。J.ウェルズ・ワイルダーが開発しました。14日間のデータを使うのが一般的です。

RSIが30を下回ると「売られすぎ」で反発の可能性、70を超えると「買われすぎ」で下落の可能性があると判断されます。

**ダイバージェンス（逆行現象）**も重要なシグナルです:
- 強気ダイバージェンス: 株価は下落、RSIは上昇 → 反転上昇のサイン
- 弱気ダイバージェンス: 株価は上昇、RSIは下落 → 反転下落のサイン`,
    technicalDescription: `RSI = 100 - (100 / (1 + RS))
RS = 平均上昇幅 / 平均下落幅

一般的に14日間のデータを使用。

### 計算手順
1. 過去14日間の上昇日の値上がり幅の平均を計算
2. 過去14日間の下落日の値下がり幅の平均を計算
3. RS = 上昇幅平均 / 下落幅平均
4. RSI = 100 - (100 / (1 + RS))

### Wilder's Smoothing Method
現在のRS = (前日の平均上昇 × 13 + 今日の上昇) / 14`,
    formula: "RSI = 100 - (100 / (1 + RS))\nRS = 平均上昇幅 / 平均下落幅",
    example:
      "RSIが25の場合、売られすぎ状態。過去の例では、RSI25から反発して株価が10%上昇したケースもあります。",
    relatedTermSlugs: "macd,moving-average",
  },
  {
    id: "cmlngs5cr0001wysuwjb1bk3f",
    slug: "macd",
    name: "MACD（移動平均収束拡散法）",
    nameEn: "Moving Average Convergence Divergence",
    category: "technical",
    simpleDescription:
      "トレンドの方向と強さを判断する指標。「MACDライン」と「シグナルライン」の2本の線が交差するタイミングで売買シグナルを判断します。",
    detailedDescription: `MACDは短期と長期の移動平均線の差から算出されます。

**売買シグナル**:
- **ゴールデンクロス**: MACDラインがシグナルラインを上に抜ける → 買いシグナル
- **デッドクロス**: MACDラインがシグナルラインを下に抜ける → 売りシグナル

ヒストグラム（棒グラフ）でトレンドの強さも確認できます。`,
    technicalDescription: `MACDライン = 12日EMA - 26日EMA
シグナルライン = MACDラインの9日EMA
ヒストグラム = MACDライン - シグナルライン

EMAは指数移動平均（Exponential Moving Average）。直近の価格により大きな重みを置く移動平均です。

ゼロラインクロス（MACDラインが0を上抜け/下抜け）も重要なシグナルとなります。`,
    formula:
      "MACDライン = 12日EMA - 26日EMA\nシグナルライン = MACDの9日EMA\nヒストグラム = MACDライン - シグナルライン",
    example:
      "MACDラインがシグナルラインを下から上に突き抜けた（ゴールデンクロス）場合、上昇トレンドの始まりを示唆します。",
    relatedTermSlugs: "rsi,moving-average,golden-cross",
  },
  {
    id: "cmlngs5ct0002wysuxl2kibnn",
    slug: "moving-average",
    name: "移動平均線",
    nameEn: "Moving Average",
    category: "technical",
    simpleDescription:
      "一定期間の株価の平均値を線でつないだもの。トレンドの方向を把握するのに使います。5日、25日、75日などがよく使われます。",
    detailedDescription: `移動平均線は過去の株価を平均化することで、短期的なノイズを除去し、トレンドを把握しやすくします。

**よく使われる期間**:
- 5日線: 超短期トレンド
- 25日線: 短期トレンド
- 75日線: 中期トレンド
- 200日線: 長期トレンド

**シグナル**:
- 株価が移動平均線より上 → 上昇トレンド
- 株価が移動平均線より下 → 下降トレンド`,
    technicalDescription: `**単純移動平均（SMA）**
SMA = (P1 + P2 + ... + Pn) / n

**指数移動平均（EMA）**
EMA = 今日の価格 × k + 昨日のEMA × (1 - k)
k = 2 / (n + 1)

EMAは直近の価格により大きな重みを置くため、SMAより価格変動に敏感に反応します。`,
    formula:
      "SMA = (P1 + P2 + ... + Pn) / n\nEMA = 今日の価格 × k + 昨日のEMA × (1 - k)",
    example:
      "25日移動平均線が75日移動平均線を下から上に抜けた場合（ゴールデンクロス）、上昇トレンドへの転換を示唆します。",
    relatedTermSlugs: "rsi,macd,golden-cross",
  },
  {
    id: "cmlngs5cu0003wysucrzemky8",
    slug: "per",
    name: "PER（株価収益率）",
    nameEn: "Price Earnings Ratio",
    category: "fundamental",
    simpleDescription:
      "株価が利益の何倍まで買われているかを示す指標。「PER15倍」なら、1年分の利益の15年分の価格で取引されていることを意味します。低いほど割安。",
    detailedDescription: `PER = 株価 / 1株当たり利益（EPS）

PERが低いほど「割安」、高いほど「割高」と判断されます。ただし、成長企業はPERが高くても評価されることがあります。

**一般的な目安**:
- PER 10倍以下: 割安
- PER 10〜20倍: 適正
- PER 20倍以上: 割高

同業他社との比較や、過去の平均PERとの比較が重要です。`,
    technicalDescription: `**予想PER**と**実績PER**があります。

予想PER = 株価 / 今期予想EPS
実績PER = 株価 / 前期実績EPS

業種平均との比較、PEGレシオ（PER / 成長率）との組み合わせで総合判断します。

**注意点**:
- 赤字企業はPERを計算できない
- 一時的な特別利益/損失でEPSが歪む場合がある`,
    formula: "PER = 株価 / 1株当たり利益（EPS）",
    example:
      "A社の株価が1,500円、EPSが100円の場合、PER = 1,500 / 100 = 15倍。同業他社の平均が20倍なら、A社は相対的に割安と判断できます。",
    relatedTermSlugs: "pbr,eps,roe",
  },
  {
    id: "cmlngs5cw0004wysujp4nrvhm",
    slug: "pbr",
    name: "PBR（株価純資産倍率）",
    nameEn: "Price Book-value Ratio",
    category: "fundamental",
    simpleDescription:
      "株価が会社の資産価値の何倍まで買われているかを示す指標。PBR1倍未満なら「解散価値以下」で割安とされます。",
    detailedDescription: `PBR = 株価 / 1株当たり純資産（BPS）

PBR1倍は、会社を解散した場合に戻ってくる価値と同じ株価という意味。

**一般的な目安**:
- PBR 1倍未満: 割安（ただし業績悪化の懸念がある場合も）
- PBR 1〜2倍: 適正
- PBR 2倍以上: 割高（成長期待が高い）

**注意**: 不動産を多く持つ会社は簿価と時価が乖離している場合があります。`,
    technicalDescription: `BPS = 純資産 / 発行済株式数

PBRが低い企業は「バリュー株」として投資対象になることが多い。ただし、低PBRが継続する「バリュートラップ」に注意。

**ROEとの関係**:
PBR = ROE × PER

この関係から、PBRが低くてもROEも低ければ、株価は適正とも言えます。`,
    formula: "PBR = 株価 / 1株当たり純資産（BPS）",
    example:
      "B社の株価が800円、BPSが1,000円の場合、PBR = 0.8倍。解散価値以下で取引されており、割安の可能性があります。",
    relatedTermSlugs: "per,roe",
  },
  {
    id: "cmlngs5cx0005wysu8ddqilgd",
    slug: "roe",
    name: "ROE（自己資本利益率）",
    nameEn: "Return on Equity",
    category: "fundamental",
    simpleDescription:
      "会社が株主のお金をどれだけ効率よく使って利益を出しているかを示す指標。高いほど効率が良い経営とされます。",
    detailedDescription: `ROE = 純利益 / 自己資本 × 100

**一般的な目安**:
- ROE 5%未満: 低い
- ROE 5〜10%: 普通
- ROE 10〜15%: 優秀
- ROE 15%以上: 非常に優秀

ただし、借入金を増やすことでROEを高くすることもできるため、財務レバレッジとの関係も確認が必要です。`,
    technicalDescription: `**デュポン分析**:
ROE = 売上高純利益率 × 総資産回転率 × 財務レバレッジ

この分解により、ROEが高い（または低い）理由を分析できます。

- 売上高純利益率: 利益を出す力
- 総資産回転率: 資産を効率的に使う力
- 財務レバレッジ: 借入を活用する度合い

自己資本が少ないとROEが高くなりやすいため、自己資本比率とセットで確認します。`,
    formula: "ROE = 純利益 / 自己資本 × 100（%）",
    example:
      "C社の純利益が50億円、自己資本が500億円の場合、ROE = 50 / 500 × 100 = 10%。株主資本を効率よく活用していると言えます。",
    relatedTermSlugs: "per,pbr",
  },
  {
    id: "cmlngs5cy0006wysu9xbah71r",
    slug: "eps",
    name: "EPS（1株当たり利益）",
    nameEn: "Earnings Per Share",
    category: "fundamental",
    simpleDescription:
      "1株あたりどれだけの利益を生み出しているかを示す指標。EPSが高いほど、1株の価値が高いと言えます。",
    detailedDescription: `EPS = 純利益 / 発行済株式数

**EPSの使い方**:
- PERの計算に使用: PER = 株価 / EPS
- 成長性の確認: EPSが年々増加していれば成長企業
- 配当の原資: 配当はEPSから支払われる

**注意**: 自社株買いで株式数が減ると、利益が同じでもEPSは上昇します。`,
    technicalDescription: `**基本的EPS**:
EPS = 純利益 / 発行済株式数

**希薄化後EPS**:
潜在株式（ストックオプション、転換社債など）を考慮したEPS。より保守的な指標。

**継続事業EPS**:
一時的な特別損益を除外したEPS。本業の収益力を見るのに有効。`,
    formula: "EPS = 純利益 / 発行済株式数",
    example:
      "D社の純利益が100億円、発行済株式数が1億株の場合、EPS = 100億 / 1億 = 100円。",
    relatedTermSlugs: "per,roe",
  },
  {
    id: "cmlngs5d00007wysunq83zczn",
    slug: "volume",
    name: "出来高",
    nameEn: "Trading Volume",
    category: "market",
    simpleDescription:
      "その日に売買された株式の数。出来高が多いほど、その銘柄への注目度が高いことを示します。",
    detailedDescription: `出来高は市場の活性度を示す重要な指標です。

**出来高の見方**:
- 出来高増加 + 株価上昇: 強い上昇トレンド
- 出来高増加 + 株価下落: 強い下降トレンド
- 出来高減少: トレンドの勢いが弱まっている

**注目ポイント**:
- 平均出来高と比較して、異常に多い/少ない日は要注目
- 決算発表日や材料発表時に出来高が増加することが多い`,
    technicalDescription: `**出来高の分析手法**:

1. **OBV（On Balance Volume）**: 出来高を累積して価格トレンドを確認

2. **出来高移動平均**: 5日、25日などの移動平均で出来高のトレンドを把握

3. **出来高比率**: 当日出来高 / 平均出来高で異常値を検出

**ダイバージェンス**:
株価が上昇しているのに出来高が減少 → トレンド転換のサイン`,
    formula: "出来高比率 = 当日出来高 / 平均出来高（過去N日）",
    example:
      "E社の普段の1日の出来高が10万株なのに、ある日100万株の出来高があった場合、何か大きな材料が出た可能性があります。",
    relatedTermSlugs: "volatility",
  },
  {
    id: "cmlngs5d10008wysu92h812ll",
    slug: "volatility",
    name: "ボラティリティ",
    nameEn: "Volatility",
    category: "risk",
    simpleDescription:
      "株価の変動の大きさ。ボラティリティが高いほど、株価が大きく動く可能性があり、リスクも高くなります。",
    detailedDescription: `ボラティリティは投資のリスク指標として重要です。

**ボラティリティの種類**:
- **ヒストリカル・ボラティリティ**: 過去の実績に基づく変動率
- **インプライド・ボラティリティ**: オプション価格から逆算した予想変動率

**一般的な目安（年率）**:
- 10%以下: 低ボラティリティ（安定した大型株など）
- 10〜30%: 中程度
- 30%以上: 高ボラティリティ（新興株、バイオ株など）`,
    technicalDescription: `**標準偏差による計算**:

1. 日次リターンを計算: r = (P_t - P_{t-1}) / P_{t-1}
2. リターンの平均を計算: μ = Σr / n
3. 分散を計算: σ² = Σ(r - μ)² / (n-1)
4. 標準偏差: σ = √σ²
5. 年率換算: σ_annual = σ_daily × √252

（252は年間の取引日数）`,
    formula: "年率ボラティリティ = 日次標準偏差 × √252",
    example:
      "F社の年率ボラティリティが40%の場合、統計的に約68%の確率で、1年後の株価は現在価格から±40%の範囲に収まります。",
    relatedTermSlugs: "stop-loss,volume",
  },
  {
    id: "cmlngs5d30009wysuds7eflbw",
    slug: "stop-loss",
    name: "損切り（ストップロス）",
    nameEn: "Stop Loss",
    category: "risk",
    simpleDescription:
      "損失を一定の範囲に抑えるために、あらかじめ決めた価格で売却すること。「これ以上損したくない」というラインを決めておくことです。",
    detailedDescription: `損切りは投資で最も重要なリスク管理手法の一つです。

**損切りのメリット**:
- 損失を限定できる
- 感情的な判断を防げる
- 資金を次の投資に回せる

**損切りラインの決め方**:
- 購入価格から5〜10%下落したら損切り
- 直近の安値を下回ったら損切り
- 移動平均線を下回ったら損切り`,
    technicalDescription: `**損切り注文の種類**:

1. **逆指値注文**: 指定価格に達したら成行注文を発動
2. **トレーリングストップ**: 株価上昇に合わせて損切りラインも上昇

**ポジションサイジング**:
損切りラインと投資金額から、1回の取引で失っても良い金額を計算。

許容損失額 = 投資資金 × 許容損失率（例: 2%）
投資株数 = 許容損失額 / (購入価格 - 損切り価格)`,
    formula:
      "許容損失額 = 投資資金 × 許容損失率\n投資株数 = 許容損失額 / (購入価格 - 損切り価格)",
    example:
      "100万円の投資資金で、1回の取引で2%（2万円）までの損失を許容する場合、購入価格1,000円、損切りライン950円なら、投資株数 = 2万円 / 50円 = 400株となります。",
    relatedTermSlugs: "volatility",
  },
  {
    id: "cmlngs5d4000awysusinzyfz4",
    slug: "golden-cross",
    name: "ゴールデンクロス",
    nameEn: "Golden Cross",
    category: "technical",
    simpleDescription:
      "短期の移動平均線が長期の移動平均線を下から上に突き抜けること。上昇トレンドの始まりを示す買いシグナルとされます。",
    detailedDescription: `ゴールデンクロスは最も有名なテクニカル指標の一つです。

**一般的な組み合わせ**:
- 5日線 × 25日線: 短期的なシグナル
- 25日線 × 75日線: 中期的なシグナル
- 50日線 × 200日線: 長期的なシグナル（欧米で重視）

**注意点**:
- 遅行性がある（トレンド転換してからシグナルが出る）
- もみ合い相場ではダマシが多い`,
    technicalDescription: `**シグナルの強さを判断するポイント**:

1. クロスの角度: 急角度ほど強いシグナル
2. 出来高: クロス時に出来高が増加していれば信頼性が高い
3. 株価の位置: 長期移動平均線より上でクロスすれば強い

**MACDのゴールデンクロス**:
MACDラインがシグナルラインを上抜けることも「ゴールデンクロス」と呼ばれます。`,
    formula: null,
    example:
      "G社で25日移動平均線が75日移動平均線を下から上に抜けた場合、中期的な上昇トレンドの始まりを示唆。ただし、出来高が伴っているか確認が重要です。",
    relatedTermSlugs: "macd,moving-average",
  },
]

// クイズ
const quizzes = [
  {
    id: "technical-basics-quiz",
    moduleId: "cmlngs5d6000bwysuk1ul2ijh",
    title: "テクニカル分析入門テスト",
    description: "テクニカル分析の基礎知識を確認しましょう。",
    passingScore: 70,
  },
]

// クイズ問題
const quizQuestions = [
  {
    id: "technical-basics-quiz-1",
    quizId: "technical-basics-quiz",
    order: 1,
    question:
      "RSIが25を示している場合、一般的にどのような状態と判断されますか？",
    options: [
      { id: "a", text: "売られすぎ（反発の可能性あり）" },
      { id: "b", text: "買われすぎ（下落の可能性あり）" },
      { id: "c", text: "通常範囲（様子見）" },
      { id: "d", text: "トレンド転換のサイン" },
    ],
    correctOption: "a",
    explanation:
      "RSIが30以下の場合は「売られすぎ」と判断されます。これは株価が下がりすぎている可能性があり、反発（上昇）するかもしれないというサインです。ただし、RSIだけで判断せず、他の指標も確認することが大切です。",
  },
  {
    id: "technical-basics-quiz-2",
    quizId: "technical-basics-quiz",
    order: 2,
    question:
      "MACDラインがシグナルラインを下から上に突き抜けることを何と呼びますか？",
    options: [
      { id: "a", text: "デッドクロス" },
      { id: "b", text: "ゴールデンクロス" },
      { id: "c", text: "ダイバージェンス" },
      { id: "d", text: "ブレイクアウト" },
    ],
    correctOption: "b",
    explanation:
      "MACDラインがシグナルラインを下から上に突き抜けることを「ゴールデンクロス」と呼び、買いシグナルとされます。逆に、上から下に突き抜けることを「デッドクロス」と呼び、売りシグナルとされます。",
  },
  {
    id: "technical-basics-quiz-3",
    quizId: "technical-basics-quiz",
    order: 3,
    question: "テクニカル分析の基本的な前提として正しいものはどれですか？",
    options: [
      { id: "a", text: "企業の業績だけが株価を決める" },
      { id: "b", text: "株価の動きはランダムで予測不可能" },
      { id: "c", text: "過去の価格パターンは繰り返される傾向がある" },
      { id: "d", text: "テクニカル分析は短期投資にのみ有効" },
    ],
    correctOption: "c",
    explanation:
      "テクニカル分析は「歴史は繰り返す」という前提に基づいています。投資家の心理は大きく変わらないため、似たような価格パターンが繰り返し現れると考えます。そのため、過去のパターンを学ぶことで、将来の値動きを予測しようとします。",
  },
]

async function main() {
  console.log("🌱 Seeding learning content...")

  // LearningModule をupsert
  console.log("📚 Upserting learning modules...")
  for (const mod of learningModules) {
    await prisma.learningModule.upsert({
      where: { id: mod.id },
      update: mod,
      create: mod,
    })
  }
  console.log(`  ✅ ${learningModules.length} modules upserted`)

  // Lesson をupsert
  console.log("📖 Upserting lessons...")
  for (const lesson of lessons) {
    await prisma.lesson.upsert({
      where: { id: lesson.id },
      update: lesson,
      create: lesson,
    })
  }
  console.log(`  ✅ ${lessons.length} lessons upserted`)

  // Term をupsert
  console.log("📝 Upserting terms...")
  for (const term of terms) {
    await prisma.term.upsert({
      where: { id: term.id },
      update: term,
      create: term,
    })
  }
  console.log(`  ✅ ${terms.length} terms upserted`)

  // Quiz をupsert
  console.log("❓ Upserting quizzes...")
  for (const quiz of quizzes) {
    await prisma.quiz.upsert({
      where: { id: quiz.id },
      update: quiz,
      create: quiz,
    })
  }
  console.log(`  ✅ ${quizzes.length} quizzes upserted`)

  // QuizQuestion をupsert
  console.log("❔ Upserting quiz questions...")
  for (const question of quizQuestions) {
    await prisma.quizQuestion.upsert({
      where: { id: question.id },
      update: question,
      create: question,
    })
  }
  console.log(`  ✅ ${quizQuestions.length} quiz questions upserted`)

  console.log("🎉 Learning content seeding completed!")
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
