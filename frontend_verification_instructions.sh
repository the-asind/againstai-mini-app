#!/bin/bash
set -e
echo "Running Frontend Verification..."

# 1. Build the project to ensure no type errors or build failures
echo "Building project..."
npm run build

# 2. Run unit tests to ensure no regressions in logic
echo "Running unit tests..."
npm run test

echo "Verification Complete. Build and Tests passed."
