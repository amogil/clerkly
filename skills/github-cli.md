# GitHub CLI Skill

This skill describes working with GitHub using the `gh` CLI tool.

## Installation

```bash
# Check if gh is installed
gh --version

# If not installed, install via Homebrew (macOS)
brew install gh

# Authentication
gh auth login
```

## Working with Issues

### Viewing Issues

```bash
# List all open issues in the current repository
gh issue list

# List issues with filters
gh issue list --state open          # Open only
gh issue list --state closed        # Closed only
gh issue list --state all           # All issues
gh issue list --assignee @me        # Assigned to me
gh issue list --label bug           # With label "bug"
gh issue list --author username     # Created by user

# Viewing a specific issue
gh issue view 123                   # By number
gh issue view 123 --web             # Open in browser

# View with comments
gh issue view 123 --comments
```

### Creating Issues

```bash
# Interactive creation
gh issue create

# Creation with parameters
gh issue create --title "Bug title" --body "Description"

# With labels and assignees
gh issue create --title "Feature" --label enhancement --assignee username

# From a file
gh issue create --title "Title" --body-file description.md
```

### Managing Issues

```bash
# Close issue
gh issue close 123

# Reopen issue
gh issue reopen 123

# Add a comment
gh issue comment 123 --body "Comment text"

# Edit issue
gh issue edit 123 --title "New title"
gh issue edit 123 --add-label bug
gh issue edit 123 --remove-label enhancement
gh issue edit 123 --add-assignee username
```

## Working with Pull Requests

### Viewing PRs

```bash
# PR list
gh pr list
gh pr list --state open
gh pr list --state merged
gh pr list --author @me

# Viewing a specific PR
gh pr view 456
gh pr view 456 --web
gh pr view 456 --comments

# Check CI/CD status
gh pr checks 456
```

### Creating PRs

```bash
# Interactive creation
gh pr create

# Creation with parameters
gh pr create --title "PR title" --body "Description"
gh pr create --draft                # Create as draft
gh pr create --base main            # Specify base branch
```

### Managing PRs

```bash
# Checkout PR locally
gh pr checkout 456

# Merge PR
gh pr merge 456
gh pr merge 456 --squash            # Squash merge
gh pr merge 456 --rebase            # Rebase merge

# Close without merge
gh pr close 456

# Review PR
gh pr review 456 --approve
gh pr review 456 --request-changes --body "Comments"
gh pr review 456 --comment --body "General comment"
```

## Working with Repositories

```bash
# View repository information
gh repo view
gh repo view owner/repo

# Cloning
gh repo clone owner/repo

# Creating a repository
gh repo create my-repo --public
gh repo create my-repo --private

# Forking a repository
gh repo fork owner/repo
```

## Working with Releases

```bash
# Release list
gh release list

# View release
gh release view v1.0.0

# Create release
gh release create v1.0.0 --title "Version 1.0.0" --notes "Release notes"

# Upload files to release
gh release upload v1.0.0 dist/*.zip
```

## Working with Gists

```bash
# Gist list
gh gist list

# Create gist
gh gist create file.txt
gh gist create file.txt --public

# View gist
gh gist view gist-id
```

## Useful Commands

```bash
# Open repository in browser
gh repo view --web

# Open issue/PR in browser
gh issue view 123 --web
gh pr view 456 --web

# Search issues
gh issue list --search "bug in:title"

# Current branch status
gh pr status

# View workflow runs (GitHub Actions)
gh run list
gh run view run-id
gh run watch run-id              # Watch execution
```

## Output Formatting

```bash
# JSON format
gh issue list --json number,title,state

# Custom format with jq
gh issue list --json number,title | jq '.[] | "\(.number): \(.title)"'

# Limit number of results
gh issue list --limit 10
```

## Aliases

Creating aliases for frequent commands:

```bash
# Create alias
gh alias set issues 'issue list --assignee @me'

# Use
gh issues

# Alias list
gh alias list
```

## Configuration

```bash
# View configuration
gh config list

# Set default editor
gh config set editor vim

# Set browser
gh config set browser firefox

# Set protocol (https/ssh)
gh config set git_protocol ssh
```

## Workflow Examples

### Working with an Issue

```bash
# 1. View issue list
gh issue list --label bug

# 2. Open a specific issue
gh issue view 123

# 3. Assign to self
gh issue edit 123 --add-assignee @me

# 4. Add a comment
gh issue comment 123 --body "Working on this"

# 5. Close after fix
gh issue close 123 --comment "Fixed in PR #456"
```

### Creating a PR from an Issue

```bash
# 1. Create branch for issue
git checkout -b fix-issue-123

# 2. Make changes and commit
git add .
git commit -m "Fix issue #123"

# 3. Push branch
git push -u origin fix-issue-123

# 4. Create PR linked to issue
gh pr create --title "Fix: Issue #123" --body "Closes #123"
```

## Automation

### Script to view your tasks

```bash
#!/bin/bash
echo "=== My Open Issues ==="
gh issue list --assignee @me --state open

echo -e "\n=== My Open PRs ==="
gh pr list --author @me --state open

echo -e "\n=== PRs Waiting for My Review ==="
gh pr list --search "review-requested:@me"
```

### Script to create an issue from a template

```bash
#!/bin/bash
TITLE="$1"
BODY="$2"

gh issue create \
  --title "$TITLE" \
  --body "$BODY" \
  --label bug \
  --assignee @me
```

## Troubleshooting

```bash
# Authentication issues
gh auth status
gh auth refresh

# Re-authentication
gh auth logout
gh auth login

# Check version
gh --version

# Update gh
brew upgrade gh
```
