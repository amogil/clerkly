#!/bin/bash

# Script to fix requirement ID references in code
# Changes from clerkly.X.Y format to clerkly.X (criteria Y)

echo "Fixing requirement ID references..."

# Fix clerkly.1.X -> clerkly.1 (criteria X)
find src tests -type f -name "*.ts" -exec sed -i '' 's/clerkly\.1\.[0-9]/clerkly.1/g' {} +

# Fix clerkly.2.X -> clerkly.2 (criteria X)
find src tests -type f -name "*.ts" -exec sed -i '' 's/clerkly\.2\.[0-9]/clerkly.2/g' {} +

# Fix clerkly.nfr.1.X -> clerkly.nfr.1 (criteria X)
find src tests -type f -name "*.ts" -exec sed -i '' 's/clerkly\.nfr\.1\.[0-9]/clerkly.nfr.1/g' {} +

# Fix clerkly.nfr.2.X -> clerkly.nfr.2 (criteria X)
find src tests -type f -name "*.ts" -exec sed -i '' 's/clerkly\.nfr\.2\.[0-9]/clerkly.nfr.2/g' {} +

# Fix clerkly.nfr.3.X -> clerkly.nfr.3 (criteria X)
find src tests -type f -name "*.ts" -exec sed -i '' 's/clerkly\.nfr\.3\.[0-9]/clerkly.nfr.3/g' {} +

# Fix clerkly.nfr.4.X -> clerkly.nfr.4 (criteria X)
find src tests -type f -name "*.ts" -exec sed -i '' 's/clerkly\.nfr\.4\.[0-9]/clerkly.nfr.4/g' {} +

echo "Done! Requirement IDs have been fixed."
