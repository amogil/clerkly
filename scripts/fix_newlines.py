#!/usr/bin/env python3
"""
Script to fix missing newlines after Requirements comments.
"""

import re
import os
from pathlib import Path

def fix_newline_after_requirements(filepath: Path) -> bool:
    """Fix missing newline after Requirements comment. Returns True if modified."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Fix pattern: // Requirements: ...import -> // Requirements: ...\n\nimport
        pattern = r'(// Requirements:[^\n]+)(import\s)'
        replacement = r'\1\n\n\2'
        
        new_content = re.sub(pattern, replacement, content)
        
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
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
        if fix_newline_after_requirements(filepath):
            modified_count += 1
    
    print(f"\nDone! Modified {modified_count} files.")

if __name__ == '__main__':
    main()
