# LLM API連携

**LLM（OpenAI等）からの出力は必ず構造化してください。**

## 理由

1. **精度向上**: 構造化出力により、LLMが明確な形式で回答するため精度が上がる
2. **パース容易**: JSONスキーマに従った出力なのでパースエラーが発生しない
3. **型安全**: TypeScriptで型定義でき、フロントエンドで安全に扱える

## 基本パターン（OpenAI）

```python
# ✅ 良い例: 構造化出力を使用
SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "improvement_suggestion",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "改善対象"},
                "action": {"type": "string", "enum": ["強化", "見直し", "調整"]},
                "reason": {"type": "string", "description": "理由"}
            },
            "required": ["target", "action", "reason"],
            "additionalProperties": False
        }
    }
}

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[...],
    response_format=SCHEMA,  # 構造化出力を指定
)
result = json.loads(response.choices[0].message.content)
```

```python
# ❌ 悪い例: 自由形式のテキスト出力
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "user", "content": "改善ポイントを1行で出力してください"}
    ],
)
text = response.choices[0].message.content  # パースしにくい
```

## チェックリスト

LLM API連携を実装する際：

- [ ] 出力形式をJSON Schemaで定義
- [ ] `response_format` パラメータで構造化出力を指定
- [ ] TypeScript側で対応する型定義を作成
