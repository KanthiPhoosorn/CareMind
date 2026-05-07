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
  "required_status_checks": null,
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
echo "   Rules configured (solo-dev profile):"
echo "   ├── Require PR before merging"
echo "   ├── 0 approving reviews required (self-merge OK)"
echo "   ├── No code-owner review requirement"
echo "   ├── No required status checks (CI moved to local husky pre-commit/pre-push)"
echo "   ├── Require linear history (no merge commits)"
echo "   ├── No force pushes to main"
echo "   └── No branch deletion"
echo ""
echo "   ℹ️  Tighten reviews to >=1 + code-owner once a second contributor joins."
echo "      Re-add required_status_checks if GitHub Actions CI is reintroduced."
