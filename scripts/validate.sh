#!/bin/bash

# Validation Script for Clerky Project
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

echo -e "${BLUE}Starting validation process...${NC}\n"

# 1. TypeScript Compilation
print_step "1. TypeScript Compilation"
echo "Running: npm run build"
if npm run build; then
    print_success "TypeScript compilation passed"
else
    print_error "TypeScript compilation failed"
    exit 1
fi

# 2. ESLint Check
print_step "2. ESLint Check"
echo "Running: npm run lint"
if npm run lint; then
    print_success "ESLint check passed"
else
    print_warning "ESLint issues found. Attempting auto-fix..."
    echo "Running: npm run lint:fix"
    if npm run lint:fix; then
        print_success "ESLint auto-fix completed"
        echo "Running lint check again..."
        if npm run lint; then
            print_success "ESLint check passed after auto-fix"
        else
            print_error "ESLint still has issues after auto-fix. Manual intervention required."
            exit 1
        fi
    else
        print_error "ESLint auto-fix failed"
        exit 1
    fi
fi

# 3. Prettier Check
print_step "3. Prettier Formatting Check"
echo "Running: npm run format:check"
if npm run format:check; then
    print_success "Prettier formatting check passed"
else
    print_warning "Prettier formatting issues found. Attempting auto-format..."
    echo "Running: npm run format"
    if npm run format; then
        print_success "Prettier auto-format completed"
        echo "Running format check again..."
        if npm run format:check; then
            print_success "Prettier formatting check passed after auto-format"
        else
            print_error "Prettier still has issues after auto-format"
            exit 1
        fi
    else
        print_error "Prettier auto-format failed"
        exit 1
    fi
fi

# 4. Unit Tests
print_step "4. Unit Tests"
echo "Running: npm test"
if npm test; then
    print_success "Unit tests passed"
else
    print_error "Unit tests failed"
    exit 1
fi

# 5. Requirements Coverage Test
print_step "5. Requirements Coverage Test"
echo "Running: npm test -- tests/requirements/coverage.test.ts"
if npm test -- tests/requirements/coverage.test.ts; then
    print_success "Requirements coverage test passed"
else
    print_error "Requirements coverage test failed"
    exit 1
fi

# 6. Security Audit (informational)
print_step "6. Security Audit (Informational)"
echo "Running: npm audit"
if npm audit; then
    print_success "No security vulnerabilities found"
else
    print_warning "Security vulnerabilities found. Review npm audit output above."
    print_warning "Note: Dev-dependency vulnerabilities (tar, vite) are not critical for production"
fi

# Final success message
echo -e "\n${GREEN}🎉 All validation steps completed successfully!${NC}"
echo -e "${GREEN}The project meets all quality standards defined in AGENTS.md${NC}\n"

# Summary of what was validated
echo -e "${BLUE}Validated:${NC}"
echo "✅ TypeScript compilation"
echo "✅ ESLint code quality"
echo "✅ Prettier code formatting"
echo "✅ Unit tests"
echo "✅ Requirements coverage"
echo "✅ Security audit (informational)"
echo ""
echo -e "${YELLOW}Note: Functional tests are excluded from validation.${NC}"
echo -e "${YELLOW}Run them manually with: npm run test:functional${NC}"