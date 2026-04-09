# Quick test script for file-upload-service endpoints
# Run this after starting the service with: pnpm dev

$baseUrl = "http://localhost:4001"

Write-Host "`n=== Testing File Upload Service Endpoints ===" -ForegroundColor Cyan

# Test 1: Root endpoint
Write-Host "`n1. Testing Root Endpoint (GET /)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
    Write-Host "✓ Root endpoint working" -ForegroundColor Green
    Write-Host "  Service: $($response.service)" -ForegroundColor Gray
    Write-Host "  Version: $($response.version)" -ForegroundColor Gray
    Write-Host "  Status: $($response.status)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Root endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Health check (general)
Write-Host "`n2. Testing Health Endpoint (GET /health)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "✓ Health endpoint working" -ForegroundColor Green
    Write-Host "  Status: $($response.status)" -ForegroundColor Gray
    Write-Host "  Database: $($response.database.status)" -ForegroundColor Gray
    Write-Host "  Memory Used: $($response.memory.heapUsedMB) MB" -ForegroundColor Gray
} catch {
    Write-Host "✗ Health endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Liveness probe
Write-Host "`n3. Testing Liveness Probe (GET /health/live)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health/live" -Method Get
    Write-Host "✓ Liveness probe working" -ForegroundColor Green
    Write-Host "  Status: $($response.status)" -ForegroundColor Gray
    Write-Host "  Uptime: $($response.uptime) seconds" -ForegroundColor Gray
} catch {
    Write-Host "✗ Liveness probe failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Readiness probe
Write-Host "`n4. Testing Readiness Probe (GET /health/ready)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health/ready" -Method Get
    Write-Host "✓ Readiness probe working" -ForegroundColor Green
    Write-Host "  Status: $($response.status)" -ForegroundColor Gray
    Write-Host "  MongoDB: $($response.checks.mongodb)" -ForegroundColor Gray
    Write-Host "  Redis: $($response.checks.redis)" -ForegroundColor Gray
    Write-Host "  Storage: $($response.checks.storage)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Readiness probe failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Invalid route (404)
Write-Host "`n5. Testing 404 Handler (GET /invalid-route)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/invalid-route" -Method Get -ErrorAction Stop
    Write-Host "✗ Should have returned 404" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "✓ 404 handler working correctly" -ForegroundColor Green
    } else {
        Write-Host "✗ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== All Tests Complete ===" -ForegroundColor Cyan
Write-Host "`nTo start the service: pnpm dev" -ForegroundColor Gray
Write-Host "Service should be running on: $baseUrl`n" -ForegroundColor Gray
