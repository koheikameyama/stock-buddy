import { NextResponse } from "next/server"
import { UnauthorizedError } from "./auth-utils"

/**
 * APIエラーの基底クラス
 */
export class APIError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly logMessage: string = message
  ) {
    super(message)
    this.name = "APIError"
  }
}

/**
 * 404 Not Found エラー
 */
export class NotFoundError extends APIError {
  constructor(message = "Not Found") {
    super(404, message)
    this.name = "NotFoundError"
  }
}

/**
 * 400 Bad Request エラー
 */
export class ValidationError extends APIError {
  constructor(message = "Validation Error") {
    super(400, message)
    this.name = "ValidationError"
  }
}

/**
 * 統一エラーハンドラ
 * try-catchでキャッチしたエラーを適切なNextResponseに変換
 */
export function handleAPIError(
  error: unknown,
  fallbackMessage = "予期せぬエラーが発生しました"
): NextResponse {
  console.error(error)

  // UnauthorizedError
  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    )
  }

  // APIError
  if (error instanceof APIError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    )
  }

  // その他のエラー
  return NextResponse.json(
    { error: fallbackMessage },
    { status: 500 }
  )
}

// UnauthorizedErrorを再エクスポート
export { UnauthorizedError } from "./auth-utils"
