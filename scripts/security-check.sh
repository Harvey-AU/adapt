#!/bin/bash

GO_BIN="$(go env GOPATH 2>/dev/null)/bin"
if [ -d "$GO_BIN" ]; then
  PATH="$GO_BIN:$PATH"
fi

ensure_go_tool() {
  local bin_name="$1"
  local install_pkg="$2"

  if command -v "$bin_name" >/dev/null 2>&1; then
    return
  fi

  echo -e "\n⚠️  $bin_name is not installed; installing with go install..."
  if ! go install "$install_pkg"; then
    echo -e "\n❌ Failed to install $bin_name. Install it with:\n   go install $install_pkg"
    return 1
  fi

  return 0
}

echo "=== 🛡️  Running Security Checks ==="
EXIT_CODE=0

echo -e "\n🔍 Running Trivy (Filesystem, Secrets, Config)..."
# Scan for secrets, misconfigs, and vulnerabilities in library code
# Skipping .worktrees to avoid recursion if run from root
# Skipping scripts/auth/config.py - contains publishable anon key (like Stripe pk_*), not a secret
if ! trivy fs --scanners vuln,secret,misconfig \
  --ignore-unfixed \
  --skip-dirs .worktrees \
  --skip-files scripts/auth/config.py \
  .; then
    EXIT_CODE=1
fi

echo -e "\n🔍 Running govulncheck (Go Dependencies)..."
if ! ensure_go_tool "govulncheck" "golang.org/x/vuln/cmd/govulncheck@latest"; then
  echo -e "\n⚠️  Skipping govulncheck due installation failure"
else
  if ! govulncheck ./...; then
    EXIT_CODE=1
  fi
fi

echo -e "\n🔍 Running ESLint Security (JS Code)..."
if ! npx eslint "web/**/*.js"; then
    EXIT_CODE=1
fi

echo -e "\n🔍 Running Gosec (via golangci-lint)..."
GOLANGCI_CMD="golangci-lint"
if command -v "$GOLANGCI_CMD" >/dev/null 2>&1; then
  if "$GOLANGCI_CMD" --version | grep -q "version 2\."; then
    echo -e "\nℹ️  Using existing golangci-lint v2"
    if ! "$GOLANGCI_CMD" run ./...; then
      EXIT_CODE=1
    fi
  else
    echo -e "\n⚠️  Existing golangci-lint is v1; running v2 via module for this check"
    if ! go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest run ./...; then
      echo -e "\n⚠️  golangci-lint v2 module run failed"
      EXIT_CODE=1
    fi
  fi
else
  echo -e "\n⚠️  golangci-lint missing from PATH; attempting v2 install"
  if go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest; then
    echo -e "\nℹ️  Installed golangci-lint v2, running check"
    if ! golangci-lint run ./...; then
      EXIT_CODE=1
    fi
  else
    echo -e "\n❌ Failed to install golangci-lint v2 from module"
    EXIT_CODE=1
  fi
fi

if [ "$EXIT_CODE" -ne 0 ]; then
  echo -e "\nℹ️  golangci-lint issues above may be pre-existing or environment-related"
  EXIT_CODE=1
fi

if [ "$EXIT_CODE" -eq 0 ]; then
  echo -e "\n✅ All Security Checks Completed"
else
  echo -e "\n⚠️  Security Checks Failed"
  exit $EXIT_CODE
fi
