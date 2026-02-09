"use client"

import { useState, useRef, useEffect } from "react"
import { useChatContext } from "@/app/contexts/ChatContext"

interface Message {
  role: "user" | "assistant"
  content: string
}

const DEFAULT_QUESTIONS = [
  "今日の注目点は？",
  "ポートフォリオどう？",
  "何か気をつけることある？",
]

const PORTFOLIO_STOCK_QUESTIONS = [
  "今後の見通しは？",
  "売り時？まだ持つべき？",
  "追加購入すべき？",
]

const WATCHLIST_STOCK_QUESTIONS = [
  "今後の見通しは？",
  "今が買い時？",
  "どんなリスクがある？",
]

export default function GlobalChat() {
  const { stockContext } = useChatContext()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 銘柄が変わったら会話をリセット
  const prevStockRef = useRef<string | null>(null)
  useEffect(() => {
    const currentStockKey = stockContext?.tickerCode ?? null
    if (prevStockRef.current !== currentStockKey) {
      setMessages([])
      prevStockRef.current = currentStockKey
    }
  }, [stockContext])

  // 質問候補を決定
  const suggestedQuestions = stockContext
    ? stockContext.type === "portfolio"
      ? PORTFOLIO_STOCK_QUESTIONS
      : WATCHLIST_STOCK_QUESTIONS
    : DEFAULT_QUESTIONS

  // メッセージが更新されたら自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim()) return

    const userMessage: Message = {
      role: "user",
      content: messageText.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageText.trim(),
          conversationHistory: messages.slice(-4),
          stockContext: stockContext,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      const data = await response.json()

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("Chat error:", error)
      const errorMessage: Message = {
        role: "assistant",
        content:
          "申し訳ございません。エラーが発生しました。もう一度お試しください。",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleSuggestedQuestion = (question: string) => {
    sendMessage(question)
  }

  const toggleChat = () => {
    setIsOpen(!isOpen)
  }

  // チャットタイトル
  const chatTitle = stockContext
    ? `${stockContext.name}について相談`
    : "投資について相談"

  // プレースホルダー
  const placeholder = stockContext
    ? `${stockContext.name}について質問...`
    : "投資について相談..."

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={toggleChat}
        className={`fixed bottom-6 right-6 w-14 h-14 ${
          stockContext ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
        } text-white rounded-full shadow-lg flex items-center justify-center transition-all z-50`}
        title={chatTitle}
      >
        {isOpen ? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-white rounded-xl shadow-2xl flex flex-col z-50 border border-gray-200">
          {/* Header */}
          <div className={`${
            stockContext ? "bg-green-600" : "bg-blue-600"
          } text-white px-4 py-3 rounded-t-xl flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <div>
                <h3 className="font-semibold text-sm">{chatTitle}</h3>
                {stockContext && (
                  <p className="text-xs opacity-80">{stockContext.tickerCode}</p>
                )}
              </div>
            </div>
            <button
              onClick={toggleChat}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {stockContext ? (
                  <>
                    <p className="mb-4 font-semibold text-gray-700">
                      {stockContext.name}について質問してください
                    </p>
                    <p className="text-sm">
                      この銘柄に特化したアドバイスをします
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mb-4">投資について何でも質問してください</p>
                    <p className="text-sm">
                      あなたの保有銘柄やウォッチリストをもとにアドバイスします
                    </p>
                  </>
                )}
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? stockContext
                        ? "bg-green-600 text-white"
                        : "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="animate-pulse flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    </div>
                    <span className="text-sm text-gray-600">考えています...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Questions */}
          {messages.length === 0 && (
            <div className="px-4 pb-3">
              <p className="text-xs text-gray-500 mb-2">💡 よくある質問:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestedQuestion(question)}
                    className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                      stockContext
                        ? "bg-green-50 text-green-700 hover:bg-green-100"
                        : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                    disabled={isLoading}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholder}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={`px-4 py-2 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm ${
                  stockContext
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                送信
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
