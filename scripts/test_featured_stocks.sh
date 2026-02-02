#!/bin/bash
# Test script for featured stocks generation API

# Load environment variables
source .env

# Call the API
curl -X POST "http://localhost:3000/api/featured-stocks/generate" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -v
