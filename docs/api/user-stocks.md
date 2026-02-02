# UserStock CRUD API Documentation

## Overview

The UserStock API provides a unified interface for managing both portfolio holdings and watchlist items. A single `UserStock` record can represent either:
- **Holding**: When `quantity` is set (not null)
- **Watchlist**: When `quantity` is null

This design simplifies the data model and provides flexibility to convert between modes.

## Authentication

All endpoints require authentication via Next.js session. Include a valid session cookie in your requests.

## Endpoints

### 1. GET /api/user-stocks

Retrieve all user stocks (both holdings and watchlist).

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `"holdings"` \| `"watchlist"` \| `"all"` | `"all"` | Filter by mode |
| `sort` | `"name"` \| `"value"` \| `"date"` | `"date"` | Sort order |

#### Response

```typescript
UserStockResponse[] = [
  {
    id: string
    userId: string
    stockId: string
    quantity: number | null          // null = watchlist, number = holding
    averagePrice: number | null
    purchaseDate: string | null      // ISO 8601 format
    lastAnalysis: string | null      // ISO 8601 format
    shortTerm: string | null         // AI short-term prediction
    mediumTerm: string | null        // AI medium-term prediction
    longTerm: string | null          // AI long-term prediction
    stock: {
      id: string
      tickerCode: string             // e.g., "7203.T" for Toyota
      name: string
      sector: string | null
      market: string                 // e.g., "Tokyo Stock Exchange"
      currentPrice: number | null
    }
    createdAt: string                // ISO 8601 format
    updatedAt: string                // ISO 8601 format
  }
]
```

#### Examples

```bash
# Get all stocks
curl -X GET "http://localhost:3000/api/user-stocks" \
  -H "Cookie: next-auth.session-token=..."

# Get only holdings
curl -X GET "http://localhost:3000/api/user-stocks?mode=holdings" \
  -H "Cookie: next-auth.session-token=..."

# Get watchlist sorted by name
curl -X GET "http://localhost:3000/api/user-stocks?mode=watchlist&sort=name" \
  -H "Cookie: next-auth.session-token=..."
```

#### Status Codes

- `200 OK`: Success
- `401 Unauthorized`: Not authenticated
- `500 Internal Server Error`: Server error

---

### 2. POST /api/user-stocks

Add a new stock to holdings or watchlist.

#### Request Body

```typescript
{
  tickerCode: string              // Required: e.g., "7203.T"
  quantity?: number | null        // If provided → holding, if null → watchlist
  averagePrice?: number | null    // Optional: purchase price
  purchaseDate?: string | null    // Optional: ISO 8601 format
}
```

#### Response

Returns a `UserStockResponse` object (see GET response format above).

#### Validation Rules

1. **General**:
   - `tickerCode` is required
   - Stock must exist in database
   - Cannot add duplicate stock (unique per user)

2. **Holdings** (when `quantity` is provided):
   - Maximum 5 holdings per user
   - `quantity` must be > 0
   - `averagePrice` must be > 0 (if provided)

3. **Watchlist** (when `quantity` is null):
   - Maximum 5 watchlist items per user

#### Examples

```bash
# Add to watchlist (no quantity)
curl -X POST "http://localhost:3000/api/user-stocks" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "tickerCode": "7203.T"
  }'

# Add to holdings
curl -X POST "http://localhost:3000/api/user-stocks" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "tickerCode": "6758.T",
    "quantity": 100,
    "averagePrice": 1500.50,
    "purchaseDate": "2024-01-15T00:00:00Z"
  }'
```

#### Status Codes

- `201 Created`: Stock added successfully
- `400 Bad Request`: Validation error (e.g., limit exceeded, invalid data)
- `401 Unauthorized`: Not authenticated
- `404 Not Found`: Stock ticker not found
- `500 Internal Server Error`: Server error

---

### 3. PATCH /api/user-stocks/[id]

Update an existing UserStock. Can also convert between holding and watchlist modes.

#### Request Body

```typescript
{
  quantity?: number | null        // Set to null to convert to watchlist
  averagePrice?: number | null
  purchaseDate?: string | null
}
```

#### Response

Returns an updated `UserStockResponse` object.

#### Behavior

1. **Update holding data**: Modify quantity, averagePrice, or purchaseDate
2. **Convert holding → watchlist**: Set `quantity` to `null`
3. **Convert watchlist → holding**: Provide `quantity` value

#### Validation Rules

- Same validation rules as POST apply
- When converting to watchlist, holding-specific fields are cleared
- Limits are checked when changing modes (5 holdings, 5 watchlist items)

#### Examples

```bash
# Update quantity and price
curl -X PATCH "http://localhost:3000/api/user-stocks/clx123abc" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "quantity": 150,
    "averagePrice": 1450.00
  }'

# Convert holding to watchlist
curl -X PATCH "http://localhost:3000/api/user-stocks/clx123abc" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "quantity": null
  }'

# Convert watchlist to holding
curl -X PATCH "http://localhost:3000/api/user-stocks/clx456def" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "quantity": 50,
    "averagePrice": 2000
  }'
```

#### Status Codes

- `200 OK`: Updated successfully
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: User doesn't own this stock
- `404 Not Found`: UserStock not found
- `500 Internal Server Error`: Server error

---

### 4. DELETE /api/user-stocks/[id]

Remove a stock from holdings or watchlist.

#### Response

```typescript
{
  success: true
  message: string  // e.g., "Stock Toyota Motor Corporation (7203.T) removed successfully"
}
```

#### Example

```bash
curl -X DELETE "http://localhost:3000/api/user-stocks/clx123abc" \
  -H "Cookie: next-auth.session-token=..."
```

#### Status Codes

- `200 OK`: Deleted successfully
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: User doesn't own this stock
- `404 Not Found`: UserStock not found
- `500 Internal Server Error`: Server error

---

## Error Handling

All endpoints return consistent error responses:

```typescript
{
  error: string  // Human-readable error message
}
```

### Common Errors

| Status | Error Message | Cause |
|--------|---------------|-------|
| 400 | `tickerCode is required` | Missing required field |
| 400 | `Maximum 5 holdings allowed` | Holdings limit exceeded |
| 400 | `Maximum 5 watchlist items allowed` | Watchlist limit exceeded |
| 400 | `Quantity must be greater than 0` | Invalid quantity |
| 400 | `Average price must be greater than 0` | Invalid price |
| 400 | `Stock already exists in your portfolio or watchlist` | Duplicate stock |
| 401 | `Unauthorized` | Not logged in |
| 403 | `You don't have permission to update/delete this stock` | Wrong user |
| 404 | `Stock with ticker code "XXX" not found` | Invalid ticker |
| 404 | `User stock not found` | Invalid ID |
| 500 | `Failed to fetch/create/update/delete user stock` | Server error |

---

## Type Definitions

```typescript
// Request types
interface CreateUserStockRequest {
  tickerCode: string
  quantity?: number | null
  averagePrice?: number | null
  purchaseDate?: string | null
}

interface UpdateUserStockRequest {
  quantity?: number | null
  averagePrice?: number | null
  purchaseDate?: string | null
}

// Response type
interface UserStockResponse {
  id: string
  userId: string
  stockId: string
  quantity: number | null
  averagePrice: number | null
  purchaseDate: string | null
  lastAnalysis: string | null
  shortTerm: string | null
  mediumTerm: string | null
  longTerm: string | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
  }
  createdAt: string
  updatedAt: string
}
```

---

## Database Schema

```prisma
model UserStock {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  stockId      String
  stock        Stock     @relation(fields: [stockId], references: [id], onDelete: Cascade)

  // 数量入力あり → 保有中、なし → ウォッチ中
  quantity     Int?
  averagePrice Float?
  purchaseDate DateTime?

  // AI分析結果
  lastAnalysis DateTime?
  shortTerm    String?   @db.Text
  mediumTerm   String?   @db.Text
  longTerm     String?   @db.Text

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([userId, stockId])
  @@index([userId])
  @@index([stockId])
}
```

---

## Testing

A comprehensive test script is available at `scripts/test_user_stocks_api.py`.

```bash
# Run tests (requires authentication)
python scripts/test_user_stocks_api.py
```

The test suite covers:
- GET all stocks / holdings / watchlist
- POST create holding and watchlist
- PATCH update and mode conversion
- DELETE stock removal
- Error cases (duplicates, limits, etc.)

---

## Migration Notes

This API is part of the portfolio-watchlist unification project. See:
- **Task 3.1**: UserStock CRUD API creation
- **Migration Script**: `scripts/migration/migrate_to_userstock.py`
- **Related Tasks**: Task 3.2 (Frontend), Task 3.3 (Old API deprecation)
