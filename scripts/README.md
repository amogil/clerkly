# Validation Scripts

This directory contains validation scripts for the Clerky project that ensure code quality and compliance with project standards.

## Available Scripts

### validate.sh (Unix/Linux/macOS)

Bash script that runs all validation checks sequentially with colored output and automatic error handling.

### validate.bat (Windows)

Batch script equivalent for Windows systems with similar functionality.

## Usage

### Recommended (via npm):

```bash
npm run validate        # Unix/Linux/macOS
npm run validate:win    # Windows
```

### Direct execution:

```bash
./scripts/validate.sh   # Unix/Linux/macOS (requires chmod +x)
scripts\validate.bat    # Windows
```

## What Gets Validated

1. **TypeScript Compilation** - Ensures all TypeScript code compiles without errors
2. **ESLint Check** - Code quality and style validation with auto-fix
3. **Prettier Formatting** - Code formatting validation with auto-format
4. **Unit Tests** - All unit tests must pass
5. **Functional Tests** - All end-to-end tests must pass
6. **Requirements Coverage** - Ensures all requirements are covered by tests
7. **Security Audit** - Informational security vulnerability check

## Features

- **Automatic Error Recovery**: ESLint and Prettier issues are automatically fixed when possible
- **Colored Output**: Clear visual feedback with success/warning/error indicators
- **Early Exit**: Stops on first critical error for faster feedback
- **Detailed Reporting**: Shows exactly what was validated and the results
- **Cross-Platform**: Works on Unix/Linux/macOS and Windows

## Exit Codes

- `0`: All validations passed successfully
- `1`: One or more critical validations failed

## Requirements

These scripts follow the validation standards defined in `AGENTS.md` and ensure compliance with all project quality requirements.
