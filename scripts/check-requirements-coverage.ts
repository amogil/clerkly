#!/usr/bin/env ts-node
// Requirements: clerkly.2.8, clerkly.2.9
/**
 * Script to verify requirements coverage in code and tests
 * Checks:
 * 1. All requirements are referenced in code
 * 2. All requirements are referenced in tests
 * 3. All tests have structured comments (Preconditions, Action, Assertions, Requirements)
 * 4. All code has requirement comments
 */

import * as fs from 'fs';
import * as path from 'path';

interface Requirement {
  id: string;
  description: string;
}

interface CoverageReport {
  totalRequirements: number;
  coveredInCode: Set<string>;
  coveredInTests: Set<string>;
  uncoveredInCode: string[];
  uncoveredInTests: string[];
  filesWithoutRequirements: string[];
  testsWithoutStructure: string[];
}

// Extract requirements from requirements.md
function extractRequirements(requirementsPath: string): Requirement[] {
  const content = fs.readFileSync(requirementsPath, 'utf-8');
  const requirements: Requirement[] = [];

  // Match requirement IDs like clerkly.1.1, clerkly.2.3, clerkly.nfr.1.1
  const reqPattern = /\*\*ID:\*\*\s+(clerkly\.[a-z0-9.]+)/gi;
  let match;

  while ((match = reqPattern.exec(content)) !== null) {
    requirements.push({
      id: match[1],
      description: '',
    });
  }

  // Also extract from criteria sections
  const criteriaPattern = /^(\d+\.\d+)\.\s+/gm;
  const currentReqId: string[] = [];

  content.split('\n').forEach((line) => {
    const idMatch = line.match(/\*\*ID:\*\*\s+(clerkly\.[a-z0-9.]+)/i);
    if (idMatch) {
      currentReqId[0] = idMatch[1];
    }

    const criteriaMatch = line.match(criteriaPattern);
    if (criteriaMatch && currentReqId[0]) {
      const fullId = `${currentReqId[0]}.${criteriaMatch[1]}`;
      if (!requirements.find((r) => r.id === fullId)) {
        requirements.push({
          id: fullId,
          description: line,
        });
      }
    }
  });

  return requirements;
}

// Find all TypeScript files in a directory
function findTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('dist')) {
        findTypeScriptFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Extract requirement references from a file
function extractRequirementReferences(filePath: string): Set<string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const requirements = new Set<string>();

  // Match "Requirements: clerkly.1.1, clerkly.2.3"
  const reqPattern = /Requirements:\s+(clerkly\.[a-z0-9.,\s]+)/gi;
  let match;

  while ((match = reqPattern.exec(content)) !== null) {
    const reqList = match[1].split(',').map((r) => r.trim());
    reqList.forEach((req) => {
      if (req.startsWith('clerkly.')) {
        requirements.add(req);
      }
    });
  }

  return requirements;
}

// Check if a test file has structured comments
function checkTestStructure(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for structured comment pattern
  const structuredPattern =
    /\/\*\s*Preconditions:[\s\S]*?Action:[\s\S]*?Assertions:[\s\S]*?Requirements:/;

  return structuredPattern.test(content);
}

// Check if a source file has requirement comments
function checkSourceRequirements(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for requirement comments at file level or method level
  const reqPattern = /\/\/\s*Requirements:/;

  return reqPattern.test(content);
}

// Main analysis function
function analyzeRequirementsCoverage(): CoverageReport {
  const requirementsPath = path.join(
    __dirname,
    '..',
    '.kiro',
    'specs',
    'clerkly',
    'requirements.md'
  );
  const srcDir = path.join(__dirname, '..', 'src');
  const testsDir = path.join(__dirname, '..', 'tests');

  // Extract all requirements
  const requirements = extractRequirements(requirementsPath);
  console.log(`\nFound ${requirements.length} requirements in requirements.md`);

  // Find all source and test files
  const sourceFiles = findTypeScriptFiles(srcDir);
  const testFiles = findTypeScriptFiles(testsDir);

  console.log(`Found ${sourceFiles.length} source files`);
  console.log(`Found ${testFiles.length} test files`);

  // Extract requirement references from code
  const coveredInCode = new Set<string>();
  const filesWithoutRequirements: string[] = [];

  sourceFiles.forEach((file) => {
    const refs = extractRequirementReferences(file);
    refs.forEach((ref) => coveredInCode.add(ref));

    if (!checkSourceRequirements(file)) {
      filesWithoutRequirements.push(file);
    }
  });

  // Extract requirement references from tests
  const coveredInTests = new Set<string>();
  const testsWithoutStructure: string[] = [];

  testFiles.forEach((file) => {
    const refs = extractRequirementReferences(file);
    refs.forEach((ref) => coveredInTests.add(ref));

    if (!checkTestStructure(file)) {
      testsWithoutStructure.push(file);
    }
  });

  // Find uncovered requirements
  const uncoveredInCode: string[] = [];
  const uncoveredInTests: string[] = [];

  requirements.forEach((req) => {
    if (!coveredInCode.has(req.id)) {
      uncoveredInCode.push(req.id);
    }
    if (!coveredInTests.has(req.id)) {
      uncoveredInTests.push(req.id);
    }
  });

  return {
    totalRequirements: requirements.length,
    coveredInCode,
    coveredInTests,
    uncoveredInCode,
    uncoveredInTests,
    filesWithoutRequirements,
    testsWithoutStructure,
  };
}

// Print report
function printReport(report: CoverageReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('REQUIREMENTS COVERAGE REPORT');
  console.log('='.repeat(80));

  console.log(`\nTotal Requirements: ${report.totalRequirements}`);
  console.log(
    `Covered in Code: ${report.coveredInCode.size} (${((report.coveredInCode.size / report.totalRequirements) * 100).toFixed(1)}%)`
  );
  console.log(
    `Covered in Tests: ${report.coveredInTests.size} (${((report.coveredInTests.size / report.totalRequirements) * 100).toFixed(1)}%)`
  );

  if (report.uncoveredInCode.length > 0) {
    console.log('\n⚠️  Requirements NOT covered in code:');
    report.uncoveredInCode.forEach((req) => console.log(`  - ${req}`));
  } else {
    console.log('\n✅ All requirements are covered in code!');
  }

  if (report.uncoveredInTests.length > 0) {
    console.log('\n⚠️  Requirements NOT covered in tests:');
    report.uncoveredInTests.forEach((req) => console.log(`  - ${req}`));
  } else {
    console.log('\n✅ All requirements are covered in tests!');
  }

  if (report.filesWithoutRequirements.length > 0) {
    console.log('\n⚠️  Source files WITHOUT requirement comments:');
    report.filesWithoutRequirements.forEach((file) => console.log(`  - ${file}`));
  } else {
    console.log('\n✅ All source files have requirement comments!');
  }

  if (report.testsWithoutStructure.length > 0) {
    console.log('\n⚠️  Test files WITHOUT structured comments:');
    report.testsWithoutStructure.forEach((file) => console.log(`  - ${file}`));
  } else {
    console.log('\n✅ All test files have structured comments!');
  }

  console.log('\n' + '='.repeat(80));

  // Exit with error if there are issues
  const hasIssues =
    report.uncoveredInCode.length > 0 ||
    report.uncoveredInTests.length > 0 ||
    report.filesWithoutRequirements.length > 0 ||
    report.testsWithoutStructure.length > 0;

  if (hasIssues) {
    console.log('\n❌ Requirements coverage check FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ Requirements coverage check PASSED');
    process.exit(0);
  }
}

// Run the analysis
const report = analyzeRequirementsCoverage();
printReport(report);
