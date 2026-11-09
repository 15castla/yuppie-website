#!/bin/bash
# Installs the "draft-partner-emails" command on this Mac: a small launcher in ~/.local/bin that runs
# draft_partner_emails.py from this folder with the Mac's python3. Safe to run again (it rewrites the launcher).
# See draft_partner_emails.py (top) and the project's Yuppie_Technical_Reference.md, "Outlook drafter".
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="$HOME/.local/bin"
python="$(command -v python3 || true)"
if [ -z "$python" ]; then
  echo "python3 isn't installed. Install Apple's Command Line Tools (xcode-select --install), then run this again." >&2
  exit 1
fi
"$python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' || { echo "python3 is older than 3.9." >&2; exit 1; }
mkdir -p "$bin"
cat > "$bin/draft-partner-emails" <<LAUNCHER
#!/bin/bash
exec "$python" "$here/draft_partner_emails.py" "\$@"
LAUNCHER
chmod +x "$bin/draft-partner-emails"
case ":$PATH:" in
  *":$bin:"*) ;;
  *)
    if ! grep -qs 'HOME/.local/bin' "$HOME/.zshrc"; then
      printf '\n# draft-partner-emails (Club Yuppie)\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
    fi
    echo "Added ~/.local/bin to your PATH in ~/.zshrc: open a new Terminal window to use the command."
    ;;
esac
echo "Installed: draft-partner-emails (runs $here/draft_partner_emails.py with $python)."
