#!/usr/bin/env node
// Requirements: testing-infrastructure.1.3

import { validateAllTestFiles, generateValidationReport } from "./test-file-validation";

/**
 * CLI utility to validate test file organization
 * Requirements: testing-infrastructure.1.3
 */
async function main() {
  try {
    console.log("🔍 Validating test file organization...\n");

    const summary = await validateAllTestFiles();
    const report = generateValidationReport(summary);

    console.log(report);

    if (summary.invalidTestFiles > 0) {
      console.log(
        "\n❌ Validation failed: Some test files are missing corresponding source files.",
      );
      process.exit(1);
    } else {
      console.log("\n✅ All test files have corresponding source files!");
      process.exit(0);
    }
  } catch (error) {
    console.error(
      "❌ Error during validation:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main };
