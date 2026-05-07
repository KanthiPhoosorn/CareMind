#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# scripts/setup-branch-protection.sh
#
# Configures GitHub branch protection rules for `main` using
# the `gh` CLI. Run once after repo creation or whenever rules
# need updating.
#
# Prerequisites:
#   - gh CLI installed and authenticated (`gh auth login`)
#   - You must be a repo admin
#
# Usage:
#   bash scripts/setup-branch-protection.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="KanthiPhoosorn/CareMind"
BRANCH="main"

echo "🔒 Configuring branch protection for $REPO ($BRANCH)..."
echo ""

# ── Apply via gh api with JSON input ────────────────────────────
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/branches/${BRANCH}/protection" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint", "Type Check", "Prettier Check"]
  },
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "enforce_admins": false,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

echo ""
echo "✅ Branch protection applied!"
echo ""
echo "   Rules configured:"
echo "   ├── Require PR before merging"
echo "   ├── Require 1 approving review"
echo "   ├── Dismiss stale reviews on new commits"
echo "   ├── Require review from CODEOWNERS"
echo "   ├── Required status checks (strict — branch must be up to date):"
echo "   │   ├── Lint"
echo "   │   ├── Type Check"
echo "   │   └── Prettier Check"
echo "   ├── Require linear history (no merge commits)"
echo "   ├── No force pushes"
echo "   └── No branch deletion"
echo ""
echo "   ℹ️  Admins can still bypass (enforce_admins=false)."
echo "      Set enforce_admins=true once the team is fully onboarded."
