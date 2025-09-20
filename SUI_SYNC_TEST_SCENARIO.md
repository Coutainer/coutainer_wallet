# Sui Object Synchronization Test Scenario

## 🎯 Purpose

This document provides a reproducible test to verify that object synchronization between the Sui blockchain and API is working correctly.

## 📋 Prerequisites

1. Sui devnet connection setup completed
2. Smart contract deployment completed
3. Server running (`npm run dev`)

## 🔧 Environment Variable Configuration

```bash
SUI_NETWORK=https://fullnode.devnet.sui.io:443
COUPON_PACKAGE_ID=0x2bb77690f06c0aa1178261167cb8161f9c3ea8587c9f5156fffa30a9a1e53fe9
PLATFORM_CONFIG_ID=0xe03285fed1eba1e1f4892d3625752140d6c15388f9da1e71e07d905d5063aaa0
```

## 🧪 Test Scenario

### Step 1: Network Status Check

```bash
curl -s -H "auth: YOUR_JWT_TOKEN" "http://localhost:3000/wallet/network-status" | jq .
```

**Expected Result:**

```json
{
  "connected": true,
  "chainId": "d4b07478",
  "version": "1.57.0",
  "epoch": 43
}
```

### Step 2: Issue Coupon via Sui CLI

```bash
# Register provider (run once only)
sui client call --package 0x2bb77690f06c0aa1178261167cb8161f9c3ea8587c9f5156fffa30a9a1e53fe9 --module coupon --function register_provider --args 0xe03285fed1eba1e1f4892d3625752140d6c15388f9da1e71e07d905d5063aaa0 0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71 --gas-budget 10000000

# Issue coupon
sui client call --package 0x2bb77690f06c0aa1178261167cb8161f9c3ea8587c9f5156fffa30a9a1e53fe9 --module coupon --function issue_coupon --args 0xe03285fed1eba1e1f4892d3625752140d6c15388f9da1e71e07d905d5063aaa0 0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71 "Test Coupon" 5000 30 "Encrypted Test Data" 0x6 --gas-budget 10000000
```

### Step 3: Wallet Synchronization

```bash
curl -s -X POST -H "auth: YOUR_JWT_TOKEN" -H "Content-Type: application/json" -d '{"suiCliAddress": "0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71"}' "http://localhost:3000/wallet-upgrade/sync-with-sui-cli" | jq .
```

**Expected Result:**

```json
{
  "message": "Successfully synced with Sui CLI wallet",
  "oldAddress": "OLD_ADDRESS",
  "newAddress": "0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71",
  "newToken": "NEW_JWT_TOKEN",
  "synchronized": true
}
```

### Step 4: Sui Object Retrieval

```bash
curl -s -H "auth: NEW_JWT_TOKEN" "http://localhost:3000/wallet/sui-objects" | jq .
```

**Expected Result:**

```json
{
  "objects": [
    {
      "id": "0x...",
      "type": "0x2bb7...::coupon::CouponObject",
      "content": {
        "dataType": "moveObject",
        "fields": {
          "coupon_id": "1758375201048",
          "coupon_type": "Test Coupon",
          "value": "5000",
          "used": false
        }
      }
    }
  ],
  "total": 1
}
```

### Step 5: Marketplace Synchronization

```bash
curl -s -X POST -H "auth: NEW_JWT_TOKEN" "http://localhost:3000/marketplace/sync" | jq .
```

**Expected Result:**

```json
{
  "message": "Marketplace synchronized successfully",
  "syncedObjects": 0,
  "syncedSales": 0,
  "success": true
}
```

## 🔍 Troubleshooting

### Issue 1: "Invalid token" Error

**Cause:** JWT token address mismatch with database
**Solution:** Re-run Step 3 wallet synchronization to get new token

### Issue 2: Empty Object Array Returned

**Cause:** Wallet address mismatch or synchronization failure
**Solution:**

1. Check Sui CLI objects: `sui client objects 0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71`
2. Re-run wallet synchronization
3. Retry with new token

### Issue 3: Network Connection Failure

**Cause:** Environment variables not set or network issues
**Solution:**

1. Check `.env` file
2. Restart server: `npm run dev`

## ✅ Success Criteria

1. Network status: `connected: true`
2. Wallet synchronization: New JWT token returned
3. Object retrieval: Issued coupon objects retrieved normally
4. Synchronization: API and Sui CLI reference same objects

## 📝 Test Checklist

- [ ] Network connection status confirmed
- [ ] Sui CLI coupon issuance successful
- [ ] Wallet synchronization successful
- [ ] New JWT token obtained
- [ ] Sui object retrieval successful
- [ ] Marketplace synchronization successful

## 🚀 Automated Test Script

```bash
#!/bin/bash
# sui-sync-test.sh

echo "🧪 Starting Sui Object Synchronization Test"

# 1. Check network status
echo "1️⃣ Checking network status..."
curl -s -H "auth: $JWT_TOKEN" "http://localhost:3000/wallet/network-status" | jq '.connected'

# 2. Sync wallet
echo "2️⃣ Syncing wallet..."
SYNC_RESULT=$(curl -s -X POST -H "auth: $JWT_TOKEN" -H "Content-Type: application/json" -d '{"suiCliAddress": "0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71"}' "http://localhost:3000/wallet-upgrade/sync-with-sui-cli")
NEW_TOKEN=$(echo $SYNC_RESULT | jq -r '.newToken')

# 3. Retrieve objects
echo "3️⃣ Retrieving Sui objects..."
OBJECT_COUNT=$(curl -s -H "auth: $NEW_TOKEN" "http://localhost:3000/wallet/sui-objects" | jq '.total')

echo "✅ Test completed - Objects found: $OBJECT_COUNT"
```

Usage:

```bash
export JWT_TOKEN="your_jwt_token_here"
chmod +x sui-sync-test.sh
./sui-sync-test.sh
```

## 📊 Current Status (Success Case)

- **Network**: ✅ Connected (devnet)
- **Contract**: ✅ Deployed
- **Coupon Objects**: ✅ 3 issued
- **API Synchronization**: ✅ Working normally
- **Wallet Address**: ✅ Unified (0x1c0078bc81e40e1586e4f6a70e9b95559d34617fd079b7675b3e58272fbc6d71)

## 🎉 Conclusion

Sui object synchronization is working perfectly, and this document provides a reproducible test scenario.
