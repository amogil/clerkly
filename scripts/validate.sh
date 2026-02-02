#!/bin/bash

# Validation Script for Clerkly Project
# This script runs all validation commands sequentially as described in AGENTS.md

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print step header
print_step() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo -e "${BLUE}Starting validation process for Clerkly...${NC}\n"

# 1. TypeScript Compilation
print_step "1. TypeScript Compilation"
echo "Running: npm run build"
if npm run build; then
    print_success "TypeScript compilation passed"
else
    print_error "TypeScript compilation failed"
    exit 1
fi

# 2. ESLint
print_step "2. ESLint"
echo "Running: npm run lint"
if npm run lint; then
    print_success "ESLint checks passed"
else
    print_warning "ESLint checks failed. Attempting to fix..."
    if npm run lint:fix; then
        print_success "ESLint auto-fix successful"
    else
        print_error "ESLint checks failed and could not be auto-fixed"
        exit 1
    fi
fi

# 3. Prettier
print_step "3. Prettier"
echo "Running: npm run format:check"
if npm run format:check; then
    print_success "Prettier formatting checks passed"
else
    print_warning "Prettier formatting issues found. Attempting to fix..."
    if npm run format; then
        print_success "Prettier auto-format successful"
    else
        print_error "Prettier formatting failed"
        exit 1
    fi
fi

# 4. Unit Tests
print_step "4. Unit Tests"
echo "Running: npm run test:unit"
if npm run test:unit; then
    print_success "Unit tests passed"
else
    print_error "Unit tests failed"
    exit 1
fi

# 5. Property-Based Tests
print_step "5. Property-Based Tests"
echo "Running: npm run test:property"
if npm run test:property; then
    print_success "Property-based tests passed"
else
    print_error "Property-based tests failed"
    exit 1
fi

# 6. Test Coverage
print_step "6. Test Coverage"
echo "Running: npm run test:coverage"
if npm run test:coverage; then
    print_success "Test coverage check passed"
else
    print_error "Test coverage check failed"
    exit 1
fi

# 7. Security Audit (informational)
print_step "7. Security Audit (Informational)"
echo "Running: npm audit"
if npm audit --production; then
    print_success "No security vulnerabilities found in production dependencies"
else
    print_warning "Security vulnerabilities found. Review npm audit output above."
    print_warning "Note: This is informational only and won't fail the validation"
fi

# Final success message
echo -e "\n${GREEN}🎉 All validation steps completed successfully!${NC}"
echo -e "${GREEN}The project meets all quality standards defined in AGENTS.md${NC}\n"

# Summary of what was validated
echo -e "${BLUE}Validated:${NC}"
echo "✅ TypeScript compilation (no errors)"
echo "✅ ESLint (all checks passing)"
echo "✅ Prettier (code formatting correct)"
echo "✅ Unit tests (all passing)"
echo "✅ Property-based tests (all passing)"
echo "✅ Test coverage (meets thresholds)"
echo "✅ Security audit (informational)"
echo ""
echo -e "${YELLOW}Note: Functional tests are excluded from validation as per AGENTS.md${NC}"
echo -e "${YELLOW}They show windows on screen and should only be run manually.${NC}"
echo -e "${YELLOW}To run functional tests: npm run test:functional${NC}"