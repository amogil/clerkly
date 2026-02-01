# Fast-check Generators and Configuration

This directory contains the fast-check integration for property-based testing in the testing infrastructure.

## Overview

Fast-check is integrated to provide comprehensive property-based testing with:

- **Minimum 100 iterations** per property test (as per requirements)
- **Automatic shrinking** for minimal counterexamples
- **Domain-specific generators** for application entities
- **Configurable test scenarios** for different testing needs

## Requirements Implemented

- `testing-infrastructure.3.1`: Property-based tests with fast-check library for TypeScript
- `testing-infrastructure.3.2`: Generate minimum 100 test cases for property verification
- `testing-infrastructure.3.3`: Automatic shrinking for minimal counterexamples

## File Structure

```
tests/generators/
├── index.ts                    # Main exports
├── basic-generators.ts         # Basic data type generators
├── domain-generators.ts        # Application-specific generators
├── config-generators.ts        # Configuration generators
└── README.md                   # This file

tests/
├── fast-check.config.ts        # Global fast-check configuration
├── examples/
│   └── fast-check-integration.test.ts  # Usage examples
└── setup.ts                    # Test setup with fast-check config
```

## Usage Examples

### Basic Property Testing

```typescript
import { fc } from "@fast-check/vitest";
import { nonEmptyString, positiveInteger } from "../generators";

it("should validate string and number properties", () => {
  fc.assert(
    fc.property(nonEmptyString(), positiveInteger(), (str, num) => {
      expect(str.length).toBeGreaterThan(0);
      expect(num).toBeGreaterThan(0);
      return true;
    }),
    { numRuns: 100 }, // Minimum 100 iterations
  );
});
```

### Domain-Specific Testing

```typescript
import { userProfile, coverageConfig } from "../generators";

it("should validate user profile properties", () => {
  fc.assert(
    fc.property(userProfile(), (profile) => {
      expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(profile.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      return true;
    }),
    { numRuns: 100 },
  );
});
```

### Using Configuration Presets

```typescript
import { assertCriticalProperty, assertQuickProperty } from "../fast-check.config";
import { ipcChannel } from "../generators";

// Critical business logic (500 iterations)
it("should validate critical IPC channels", () => {
  assertCriticalProperty(ipcChannel(), (channel) => {
    expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
    return true;
  });
});

// Quick development testing (50 iterations)
it("should validate IPC channels quickly", () => {
  assertQuickProperty(ipcChannel(), (channel) => {
    expect(channel).toContain(":");
    return true;
  });
});
```

## Available Generators

### Basic Generators (`basic-generators.ts`)

- `nonEmptyString()` - Non-empty strings
- `alphanumericString()` - Alphanumeric strings
- `filename()` - Valid filenames
- `filepath()` - Valid file paths
- `positiveInteger()` - Positive integers
- `percentage()` - 0-100 percentages
- `port()` - Valid port numbers
- `timestamp()` - Unix timestamps
- `url()` - Valid URLs
- `email()` - Valid email addresses

### Domain Generators (`domain-generators.ts`)

- `userId()` - UUID user identifiers
- `userProfile()` - Complete user profiles
- `authTokens()` - OAuth token structures
- `ipcChannel()` - Valid IPC channel names
- `coverageConfig()` - Coverage configuration objects
- `sidebarState()` - Sidebar state objects
- `networkError()` - Network error objects
- `mockResponse()` - HTTP response mocks

### Configuration Generators (`config-generators.ts`)

- `pbtConfigGenerator()` - Property test configurations
- `testEnvironmentConfig()` - Test environment settings
- `coverageConfigGenerator()` - Coverage configurations
- `mockConfigGenerator()` - Mock system configurations

## Configuration Presets

### Standard Configuration (100 iterations)

```typescript
const standardConfig = {
  numRuns: 100,
  timeout: 10000,
  verbose: false,
};
```

### Critical Configuration (500 iterations)

```typescript
const criticalConfig = {
  numRuns: 500,
  timeout: 30000,
  verbose: true,
};
```

### Quick Configuration (50 iterations)

```typescript
const quickConfig = {
  numRuns: 50,
  timeout: 5000,
};
```

### Comprehensive Configuration (200 iterations)

```typescript
const comprehensiveConfig = {
  numRuns: 200,
  timeout: 15000,
  skipEqualValues: true,
};
```

## Shrinking Behavior

Fast-check automatically provides minimal counterexamples when properties fail:

```typescript
// When this property fails, fast-check will shrink to minimal values
fc.assert(
  fc.property(
    fc.integer({ min: 1, max: 1000 }),
    fc.string({ minLength: 1, max: 50 }),
    (num, str) => {
      // This will fail for specific values
      if (num === 42 && str.includes("test")) {
        throw new Error(`Failed for num=${num}, str="${str}"`);
      }
      return true;
    },
  ),
  { numRuns: 100 },
);
```

If the property fails, fast-check will automatically shrink the counterexample to the smallest possible values that still cause the failure.

## Best Practices

1. **Always use minimum 100 iterations** for property tests
2. **Use domain-specific generators** instead of basic types when possible
3. **Write clear property descriptions** in test comments
4. **Use appropriate configuration presets** based on test criticality
5. **Include requirement references** in all test comments
6. **Test edge cases explicitly** with boundary value generators

## Integration with Vitest

Fast-check is integrated with Vitest through `@fast-check/vitest`:

```typescript
import { fc } from "@fast-check/vitest";

// Global configuration is applied in tests/setup.ts
// All property tests automatically use minimum 100 iterations
```

## Validation

The fast-check configuration is validated on startup to ensure:

- Minimum 100 iterations requirement is met
- Reasonable timeout values are set
- All configuration presets are valid

Run tests to verify the integration:

```bash
npm run test:unit
```

## Examples

See `tests/examples/fast-check-integration.test.ts` for comprehensive usage examples demonstrating:

- Basic property testing
- Domain-specific generators
- Configuration presets
- Shrinking behavior
- Complex property combinations
