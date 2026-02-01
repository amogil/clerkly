#!/bin/bash

# Requirements: testing-infrastructure.1.2
# Script to check code coverage thresholds locally before pushing to CI

set -e

echo "=========================================="
echo "    Code Coverage Threshold Check"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Run tests with coverage
echo "Running unit tests with coverage..."
npm run test:unit

echo ""
echo "=========================================="
echo "    Analyzing Coverage Results"
echo "=========================================="
echo ""

# Check if coverage summary exists
if [ ! -f coverage/coverage-summary.json ]; then
    echo -e "${RED}❌ Coverage report not found!${NC}"
    echo "Please ensure tests ran successfully and generated coverage data."
    exit 1
fi

# Extract coverage percentages using node
STATEMENTS=$(node -p "JSON.parse(require('fs').readFileSync('coverage/coverage-summary.json', 'utf8')).total.statements.pct")
BRANCHES=$(node -p "JSON.parse(require('fs').readFileSync('coverage/coverage-summary.json', 'utf8')).total.branches.pct")
FUNCTIONS=$(node -p "JSON.parse(require('fs').readFileSync('coverage/coverage-summary.json', 'utf8')).total.functions.pct")
LINES=$(node -p "JSON.parse(require('fs').readFileSync('coverage/coverage-summary.json', 'utf8')).total.lines.pct")

# Minimum threshold (85%)
THRESHOLD=85

echo "Coverage Summary:"
echo "  Statements: ${STATEMENTS}%"
echo "  Branches:   ${BRANCHES}%"
echo "  Functions:  ${FUNCTIONS}%"
echo "  Lines:      ${LINES}%"
echo ""
echo "Required Threshold: ${THRESHOLD}%"
echo ""

# Check each metric
FAILED=0

# Function to compare floats
check_threshold() {
    local value=$1
    local name=$2
    
    # Use bc for floating point comparison
    if (( $(echo "$value < $THRESHOLD" | bc -l) )); then
        echo -e "${RED}❌ ${name} coverage ${value}% is below threshold ${THRESHOLD}%${NC}"
        FAILED=1
    else
        echo -e "${GREEN}✅ ${name} coverage ${value}% meets threshold ${THRESHOLD}%${NC}"
    fi
}

check_threshold "$STATEMENTS" "Statements"
check_threshold "$BRANCHES" "Branches"
check_threshold "$FUNCTIONS" "Functions"
check_threshold "$LINES" "Lines"

echo ""

# Final result
if [ $FAILED -eq 1 ]; then
    echo -e "${RED}=========================================="
    echo "  ❌ Coverage Check Failed!"
    echo "==========================================${NC}"
    echo ""
    echo "Some coverage metrics are below the required threshold of ${THRESHOLD}%."
    echo "Please add more tests to improve coverage before pushing."
    echo ""
    echo "To view detailed coverage report, open:"
    echo "  coverage/index.html"
    echo ""
    exit 1
else
    echo -e "${GREEN}=========================================="
    echo "  ✅ All Coverage Thresholds Met!"
    echo "==========================================${NC}"
    echo ""
    echo "Your code meets all coverage requirements."
    echo "You can safely push your changes."
    echo ""
fi

# Show coverage report location
echo "Detailed coverage report available at:"
echo "  coverage/index.html"
echo ""
