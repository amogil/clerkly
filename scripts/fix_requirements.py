#!/usr/bin/env python3
"""
Script to fix requirement ID references in TypeScript files.
Converts clerkly.X.Y format to clerkly.X and removes duplicates.
"""

import re
import os
from pathlib import Path
from typing import Set

def fix_requirement_line(line: str) -> str:
    """Fix a single line containing requirement references."""
    # Match "Requirements: clerkly.X.Y, clerkly.X.Z, ..."
    pattern = r'(//\s*Requirements:\s*|Requirements:\s*)(clerkly\.[a-z0-9.,\s]+)'
    
    def replace_requirements(match):
        prefix = match.group(1)
        req_list = match.group(2)
        
        # Split by comma and process each requirement
        requirements = [r.strip() for r in req_list.split(',')]
        fixed_reqs: Set[str] = set()
        
        for req in requirements:
            # Remove trailing .Y from clerkly.X.Y -> clerkly.X
            # Remove trailing .Y from clerkly.nfr.X.Y -> clerkly.nfr.X
            fixed = re.sub(r'^(clerkly\.[a-z0-9]+(?:\.[a-z0-9]+)?)\.\d+$', r'\1', req)
            if fixed.startswith('clerkly.'):
                fixed_reqs.add(fixed)
        
        # Sort and join
        new_req_list = ', '.join(sorted(fixed_reqs))
        return prefix + new_req_list
    
    return re.sub(pattern, replace_requirements, line)

def fix_file(filepath: Path) -> bool:
    """Fix requirement references in a single file. Returns True if modified."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        modified = False
        new_lines = []
        
        for line in lines:
            new_line = fix_requirement_line(line)
            if new_line != line:
                modified = True
            new_lines.append(new_line)
        
        if modified:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
            print(f"✓ Fixed: {filepath}")
            return True
        
        return False
    except Exception as e:
        print(f"✗ Error processing {filepath}: {e}")
        return False

def find_typescript_files(directory: Path) -> list[Path]:
    """Find all TypeScript files in a directory recursively."""
    files = []
    for root, dirs, filenames in os.walk(directory):
        # Skip node_modules and dist
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist', '.git']]
        
        for filename in filenames:
            if filename.endswith('.ts') and not filename.endswith('.d.ts'):
                files.append(Path(root) / filename)
    
    return files

def main():
    """Main execution."""
    project_root = Path(__file__).parent.parent
    
    # Find all TypeScript files
    src_files = find_typescript_files(project_root / 'src')
    test_files = find_typescript_files(project_root / 'tests')
    script_files = find_typescript_files(project_root / 'scripts')
    
    all_files = src_files + test_files + script_files
    
    print(f"Processing {len(all_files)} TypeScript files...")
    
    modified_count = 0
    for filepath in all_files:
        if fix_file(filepath):
            modified_count += 1
    
    print(f"\nDone! Modified {modified_count} files.")

if __name__ == '__main__':
    main()
