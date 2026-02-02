#!/usr/bin/env python3
"""
Test script for UserStock CRUD API

Tests all endpoints:
- GET /api/user-stocks (with various filters)
- POST /api/user-stocks (create holding and watchlist)
- PATCH /api/user-stocks/[id] (update and mode conversion)
- DELETE /api/user-stocks/[id]

Usage:
    python scripts/test_user_stocks_api.py
"""

import requests
import sys
import os
from typing import Dict, Any, Optional

# Configuration
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
# Note: This script requires a valid session cookie for authentication
# You'll need to log in through the browser first and copy the cookie

def print_section(title: str):
    """Print a formatted section header"""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

def print_result(success: bool, message: str, data: Optional[Dict[Any, Any]] = None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if data:
        print(f"Response: {data}")

def test_get_all_stocks(session: requests.Session):
    """Test GET /api/user-stocks (all)"""
    print_section("Test 1: GET all user stocks")

    response = session.get(f"{APP_URL}/api/user-stocks")
    success = response.status_code == 200

    if success:
        data = response.json()
        print_result(True, f"Retrieved {len(data)} stocks")
        for stock in data[:3]:  # Show first 3
            mode = "holding" if stock["quantity"] is not None else "watchlist"
            print(f"  - {stock['stock']['name']} ({stock['stock']['tickerCode']}) - {mode}")
    else:
        print_result(False, f"Status {response.status_code}: {response.text}")

    return success, response.json() if success else None

def test_get_holdings(session: requests.Session):
    """Test GET /api/user-stocks?mode=holdings"""
    print_section("Test 2: GET holdings only")

    response = session.get(f"{APP_URL}/api/user-stocks?mode=holdings")
    success = response.status_code == 200

    if success:
        data = response.json()
        print_result(True, f"Retrieved {len(data)} holdings")
        for stock in data:
            print(f"  - {stock['stock']['name']}: {stock['quantity']} shares @ {stock['averagePrice']}")
    else:
        print_result(False, f"Status {response.status_code}: {response.text}")

    return success, response.json() if success else None

def test_get_watchlist(session: requests.Session):
    """Test GET /api/user-stocks?mode=watchlist"""
    print_section("Test 3: GET watchlist only")

    response = session.get(f"{APP_URL}/api/user-stocks?mode=watchlist")
    success = response.status_code == 200

    if success:
        data = response.json()
        print_result(True, f"Retrieved {len(data)} watchlist items")
        for stock in data:
            print(f"  - {stock['stock']['name']} ({stock['stock']['tickerCode']})")
    else:
        print_result(False, f"Status {response.status_code}: {response.text}")

    return success, response.json() if success else None

def test_create_watchlist_item(session: requests.Session, ticker: str = "7203.T"):
    """Test POST /api/user-stocks (watchlist)"""
    print_section(f"Test 4: POST create watchlist item ({ticker})")

    payload = {
        "tickerCode": ticker,
        "quantity": None,
    }

    response = session.post(f"{APP_URL}/api/user-stocks", json=payload)
    success = response.status_code == 201

    if success:
        data = response.json()
        print_result(True, f"Created watchlist item: {data['stock']['name']}")
        return success, data
    else:
        print_result(False, f"Status {response.status_code}: {response.text}")
        return success, None

def test_create_holding(session: requests.Session, ticker: str = "6758.T"):
    """Test POST /api/user-stocks (holding)"""
    print_section(f"Test 5: POST create holding ({ticker})")

    payload = {
        "tickerCode": ticker,
        "quantity": 100,
        "averagePrice": 1500.50,
        "purchaseDate": "2024-01-15T00:00:00Z",
    }

    response = session.post(f"{APP_URL}/api/user-stocks", json=payload)
    success = response.status_code == 201

    if success:
        data = response.json()
        print_result(True, f"Created holding: {data['stock']['name']} ({data['quantity']} shares)")
        return success, data
    else:
        print_result(False, f"Status {response.status_code}: {response.text}")
        return success, None

def test_update_holding(session: requests.Session, stock_id: str):
    """Test PATCH /api/user-stocks/[id] (update quantity)"""
    print_section(f"Test 6: PATCH update holding quantity")

    payload = {
        "quantity": 150,
        "averagePrice": 1450.00,
    }

    response = session.patch(f"{APP_URL}/api/user-stocks/{stock_id}", json=payload)
    success = response.status_code == 200

    if success:
        data = response.json()
        print_result(True, f"Updated to {data['quantity']} shares @ {data['averagePrice']}")
        return success, data
    else:
        print_result(False, f"Status {response.status_code}: {response.text}")
        return success, None

def test_convert_to_watchlist(session: requests.Session, stock_id: str):
    """Test PATCH /api/user-stocks/[id] (holding → watchlist)"""
    print_section(f"Test 7: PATCH convert holding to watchlist")

    payload = {
        "quantity": None,
    }

    response = session.patch(f"{APP_URL}/api/user-stocks/{stock_id}", json=payload)
    success = response.status_code == 200

    if success:
        data = response.json()
        is_watchlist = data['quantity'] is None
        print_result(success and is_watchlist, f"Converted to watchlist (quantity: {data['quantity']})")
        return success and is_watchlist, data
    else:
        print_result(False, f"Status {response.status_code}: {response.text}")
        return success, None

def test_delete_stock(session: requests.Session, stock_id: str):
    """Test DELETE /api/user-stocks/[id]"""
    print_section(f"Test 8: DELETE user stock")

    response = session.delete(f"{APP_URL}/api/user-stocks/{stock_id}")
    success = response.status_code == 200

    if success:
        data = response.json()
        print_result(True, f"Deleted: {data.get('message', 'Success')}")
        return success, data
    else:
        print_result(False, f"Status {response.status_code}: {response.text}")
        return success, None

def test_duplicate_stock(session: requests.Session, ticker: str):
    """Test POST with duplicate stock (should fail)"""
    print_section(f"Test 9: POST duplicate stock (should fail)")

    payload = {
        "tickerCode": ticker,
        "quantity": None,
    }

    response = session.post(f"{APP_URL}/api/user-stocks", json=payload)
    success = response.status_code == 400  # Should fail

    if success:
        print_result(True, "Correctly rejected duplicate stock")
        return True, response.json()
    else:
        print_result(False, f"Should have returned 400, got {response.status_code}")
        return False, None

def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("  UserStock CRUD API Test Suite")
    print("=" * 60)
    print(f"\nAPI URL: {APP_URL}")
    print("\nNote: You must be logged in for these tests to work.")
    print("The script will use session cookies if running locally.\n")

    # Create session
    session = requests.Session()

    # For local testing, you may need to add session cookie manually
    # session.cookies.set("next-auth.session-token", "YOUR_SESSION_TOKEN")

    try:
        # Test 1-3: GET endpoints
        test_get_all_stocks(session)
        test_get_holdings(session)
        test_get_watchlist(session)

        # Test 4: Create watchlist item
        success, watchlist_item = test_create_watchlist_item(session, "7203.T")

        # Test 5: Create holding
        success, holding = test_create_holding(session, "6758.T")

        if holding:
            # Test 6: Update holding
            test_update_holding(session, holding["id"])

            # Test 7: Convert to watchlist
            test_convert_to_watchlist(session, holding["id"])

            # Test 8: Delete stock
            test_delete_stock(session, holding["id"])

        # Test 9: Try to create duplicate (should fail)
        if watchlist_item:
            test_duplicate_stock(session, watchlist_item["stock"]["tickerCode"])

            # Cleanup: delete the watchlist item we created
            test_delete_stock(session, watchlist_item["id"])

        print_section("Test Suite Complete")
        print("✅ All tests completed. Check results above.")

    except Exception as e:
        print(f"\n❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
