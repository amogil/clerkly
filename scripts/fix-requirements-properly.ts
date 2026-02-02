#!/usr/bin/env ts-node
// Requirements: clerkly.2, clerkly.nfr.4
/**
 * Script to properly fix requirement ID references
 * Converts clerkly.X.Y format to clerkly.X and removes duplicates
 */

import * as fs from 'fs';
import * as path from 'path';

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

function fixRequirementReferences(filePath: string): void {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Find all "Requirements: ..." lines
  const reqPattern = /(\/\/\s*Requirements:\s*|Requirements:\s*)(clerkly\.[a-z0-9.,\s]+)/gi;

  content = content.replace(reqPattern, (match, prefix, reqList) => {
    const requirements = reqList.split(',').map((r: string) => r.trim());
    const fixedReqs = new Set<string>();

    requirements.forEach((req: string) => {
      // Remove trailing digits after the main requirement ID
      // clerkly.1.1 -> clerkly.1
      // clerkly.2.5 -> clerkly.2
      // clerkly.nfr.1.2 -> clerkly.nfr.1
      const fixed = req.replace(/^(clerkly\.[a-z0-9]+(?:\.[a-z0-9]+)?)\.\d+$/, '$1');
      if (fixed.startsWith('clerkly.')) {
        fixedReqs.add(fixed);
      }
    });

    const newReqList = Array.from(fixedReqs).sort().join(', ');
    if (newReqList !== reqList.trim()) {
      modified = true;
    }
    return prefix + newReqList;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed: ${filePath}`);
  }
}

// Main execution
const srcDir = path.join(__dirname, '..', 'src');
const testsDir = path.join(__dirname, '..', 'tests');
const scriptsDir = path.join(__dirname, '..', 'scripts');

const allFiles = [
  ...findTypeScriptFiles(srcDir),
  ...findTypeScriptFiles(testsDir),
  ...findTypeScriptFiles(scriptsDir),
];

console.log(`Processing ${allFiles.length} TypeScript files...`);

allFiles.forEach((file) => {
  fixRequirementReferences(file);
});

console.log('\nDone!');
