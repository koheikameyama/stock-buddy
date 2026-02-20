import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai"
import { openai } from "@ai-sdk/openai"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { createChatTools } from "@/lib/chat-tools"
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt"
import { CHAT_CONFIG } from "@/lib/constants"

interface StockContext {
  stockId: string
  tickerCode: string
  name: string
  sector: string | null
  currentPrice: number | null
  type: "portfolio" | "watchlist"
  quantity?: number
  averagePurchasePrice?: number
  profit?: number
  profitPercent?: number
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages, stockContext } = (await request.json()) as {
    messages: UIMessage[]
    stockContext?: StockContext
  }

  // 軽量な静的コンテキスト取得
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })

  const systemPrompt = await buildChatSystemPrompt(userSettings, stockContext)

  const tools = createChatTools(session.user.id, stockContext)

  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: openai(CHAT_CONFIG.MODEL),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(CHAT_CONFIG.MAX_STEPS),
    temperature: CHAT_CONFIG.TEMPERATURE,
    maxOutputTokens: CHAT_CONFIG.MAX_TOKENS,
  })

  return result.toUIMessageStreamResponse()
}
