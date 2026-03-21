#!/usr/bin/env bash
#
# Automate as much as possible from the command line for the OpenClaw Browser Relay:
# - Install / sync the unpacked extension to ~/.openclaw/browser/chrome-extension
# - Print or copy the gateway token (paste once in chrome://extensions → extension Details/Options)
# - Launch Chrome with --load-extension (no "Load unpacked" UI if Chrome starts with this flag)
#
# Limits: Chrome has no CLI to write extension Options (gateway token). You still paste once,
#         or set token in the extension UI. Intel Mac + OpenShell Docker sidecar: if plain
#         `openshell ssh-proxy` fails, use Valnaa’s “Connect Chrome” once to sync, or adapt docker exec
#         like desktop/src/lib/runtime.ts.
#
set -euo pipefail

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
EXT_DIR="${OPENCLAW_DIR}/browser/chrome-extension"
NEMO_REGISTRY="${HOME}/.nemoclaw/sandboxes.json"
GATEWAY_NAME="${GATEWAY_NAME:-nemoclaw}"
# OpenShell: `ssh` was renamed to `ssh-proxy` (set OPENSHELL_SANDBOX_EXEC=ssh for old CLIs).
OPENSHELL_SANDBOX_EXEC="${OPENSHELL_SANDBOX_EXEC:-ssh-proxy}"

die() { echo "error: $*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

openshell_bin() {
  if [[ -x "${HOME}/.local/bin/openshell" ]]; then echo "${HOME}/.local/bin/openshell"; return; fi
  if have openshell; then command -v openshell; return; fi
  die "openshell not found (needed for NemoClaw sandbox). Install NemoClaw/OpenShell or use host openclaw only."
}

sandbox_name() {
  python3 -c "
import json, os
p = os.path.join(os.path.expanduser('~'), '.nemoclaw', 'sandboxes.json')
try:
    d = json.load(open(p))
    s = d.get('defaultSandbox')
    if s and (d.get('sandboxes') or {}).get(s):
        print(s)
    else:
        k = list((d.get('sandboxes') or {}).keys())
        print(k[0] if k else 'valnaa')
except Exception:
    print('valnaa')
"
}

# JSON helpers (no jq required)
token_from_openclaw_json() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  python3 -c "
import json, sys
def norm(s):
    s = (s or '').strip()
    if len(s) >= 2 and ((s[0]==s[-1]=='\"') or (s[0]==s[-1]==\"'\")):
        s = s[1:-1].strip()
    return s
try:
    d = json.load(open(sys.argv[1]))
    t = (d.get('gateway') or {}).get('auth') or {}
    v = norm(t.get('token'))
    if v: print(v)
except Exception:
    pass
" "$f"
}

token_host() {
  local t
  t="$(token_from_openclaw_json "${OPENCLAW_DIR}/openclaw.json" || true)"
  if [[ -n "${t:-}" ]]; then echo "$t"; return 0; fi
  if have openclaw; then
    t="$(openclaw config get gateway.auth.token 2>/dev/null | tr -d '\r')"
    t="$(echo "$t" | awk 'END{gsub(/^[ \t]+|[ \t]+$/,"",$0); print $0}')"
    [[ -n "$t" ]] && echo "$t" && return 0
  fi
  return 1
}

token_sandbox() {
  local osh sn raw
  [[ -f "$NEMO_REGISTRY" ]] || return 1
  osh="$(openshell_bin)"
  sn="$(sandbox_name)"
  raw="$("$osh" "$OPENSHELL_SANDBOX_EXEC" "$sn" --gateway "$GATEWAY_NAME" -- cat /sandbox/.openclaw/openclaw.json 2>/dev/null)" || return 1
  python3 -c "
import json, sys
def norm(s):
    s = (s or '').strip()
    if len(s) >= 2 and ((s[0]==s[-1]=='\"') or (s[0]==s[-1]==\"'\")):
        s = s[1:-1].strip()
    return s
d = json.loads(sys.stdin.read())
t = (d.get('gateway') or {}).get('auth') or {}
v = norm(t.get('token'))
if v: print(v)
" <<<"$raw"
}

get_token() {
  if token="$(token_host 2>/dev/null)"; then echo "$token"; return 0; fi
  if token="$(token_sandbox 2>/dev/null)"; then echo "$token"; return 0; fi
  return 1
}

cmd_token() {
  get_token || die "Could not read gateway token (host ~/.openclaw/openclaw.json, openclaw CLI, or NemoClaw sandbox)."
}

cmd_copy_token() {
  local t
  t="$(cmd_token)"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    printf '%s' "$t" | pbcopy
    echo "Gateway token copied to clipboard (macOS)."
  elif have xclip; then
    printf '%s' "$t" | xclip -selection clipboard
    echo "Gateway token copied to clipboard (xclip)."
  else
    echo "$t"
    die "Install xclip or run on macOS for clipboard copy."
  fi
}

cmd_install_host() {
  if ! have openclaw; then
    echo "skip: openclaw CLI not on PATH"
    return 1
  fi
  openclaw browser extension install
}

cmd_sync_from_sandbox() {
  local osh sn tmp
  [[ -f "$NEMO_REGISTRY" ]] || die "No ${NEMO_REGISTRY} — not using NemoClaw sandboxes?"
  osh="$(openshell_bin)"
  sn="$(sandbox_name)"
  echo "Installing extension inside sandbox ${sn} (if needed)..."
  "$osh" "$OPENSHELL_SANDBOX_EXEC" "$sn" --gateway "$GATEWAY_NAME" -- openclaw browser extension install 2>/dev/null || true
  mkdir -p "${OPENCLAW_DIR}/browser"
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  echo "Copying chrome-extension from sandbox..."
  "$osh" "$OPENSHELL_SANDBOX_EXEC" "$sn" --gateway "$GATEWAY_NAME" -- sh -c 'tar cz - -C /sandbox/.openclaw/browser chrome-extension' >"$tmp"
  local sz
  sz="$(wc -c <"$tmp" | tr -d ' ')"
  [[ "$sz" -gt 100 ]] || die "tar from sandbox empty — is the agent running? ($osh $OPENSHELL_SANDBOX_EXEC $sn --gateway $GATEWAY_NAME)"
  rm -rf "$EXT_DIR"
  tar xzf "$tmp" -C "${OPENCLAW_DIR}/browser"
  [[ -f "$EXT_DIR/manifest.json" ]] || die "extracted extension missing manifest.json"
  echo "Extension synced to $EXT_DIR"
}

cmd_install() {
  if cmd_install_host; then
    [[ -f "$EXT_DIR/manifest.json" ]] && echo "Host extension: $EXT_DIR" && return 0
  fi
  if [[ -f "$NEMO_REGISTRY" ]]; then
    cmd_sync_from_sandbox
    return 0
  fi
  die "Could not install extension: no openclaw on host and no NemoClaw registry."
}

cmd_launch_chrome() {
  [[ -f "$EXT_DIR/manifest.json" ]] || die "Extension missing. Run: $0 install"
  local ext_abs
  ext_abs="$(cd "$(dirname "$EXT_DIR")" && pwd)/$(basename "$EXT_DIR")"
  case "$(uname -s)" in
    Darwin)
      # New Chrome instance with unpacked extension. If Chrome is already running, quit it first
      # or this may only open a window without applying --load-extension.
      echo "Launching Google Chrome with --load-extension (quit Chrome first if the extension does not appear)..."
      open -na "Google Chrome" --args --load-extension="$ext_abs"
      ;;
    Linux)
      if have google-chrome; then
        google-chrome --load-extension="$ext_abs" "$@" &
      elif have chromium; then
        chromium --load-extension="$ext_abs" "$@" &
      else
        die "Install google-chrome or chromium"
      fi
      ;;
    *)
      die "Add Chrome launch for your OS, or run manually with --load-extension=$ext_abs"
      ;;
  esac
}

cmd_all() {
  cmd_install
  cmd_copy_token || true
  echo ""
  echo "Next: paste the token in the extension Options (already copied if clipboard worked), then Save."
  cmd_launch_chrome
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

  install         openclaw browser extension install (host) OR sync from NemoClaw sandbox
  token           print gateway token to stdout
  copy-token      copy gateway token to clipboard (macOS pbcopy or Linux xclip)
  launch-chrome   start Chrome with --load-extension (see script note about quitting Chrome first)
  all             install + copy-token + launch-chrome

Env: OPENCLAW_DIR (default ~/.openclaw), GATEWAY_NAME (default nemoclaw)
EOF
}

main() {
  local c="${1:-}"
  case "$c" in
    install) cmd_install ;;
    token) cmd_token ;;
    copy-token) cmd_copy_token ;;
    launch-chrome) cmd_launch_chrome ;;
    all) cmd_all ;;
    ""|help|-h|--help) usage ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
