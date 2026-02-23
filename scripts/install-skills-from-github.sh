#!/bin/bash
# Install OpenClaw skills from GitHub (openclaw/skills) — no ClawHub rate limits.
# Run on the server: bash scripts/install-skills-from-github.sh
#
# Skills are copied to SKILLS_DIR. To make them available to containers:
# - On worker: copy into each instance: cp -r SKILLS_DIR/* /opt/openclaw/instances/USER_ID/skills/
# - Or mount SKILLS_DIR when provisioning (requires provisioning changes)
set -euo pipefail

SKILLS_DIR="${SKILLS_DIR:-/opt/openclaw-platform/skills}"
REPO_URL="https://github.com/openclaw/skills.git"
TMP_DIR="/tmp/openclaw-skills-clone-$$"

# Skills to install: "owner/skill-name" (path in repo: skills/owner/skill-name/)
# Keep in sync with api/src/data/platformSkills.ts
SKILLS=(
  # Browser & Automation
  "shawnpana/browser-use"
  "pkiv/browse"
  "murphykobe/agent-browser-2"
  "leohan123123/autofillin"
  "veeky-kumar/job-auto-apply"
  "opsun/deep-scraper"
  "matagul/desktop-control"
  "leonardogrig/firecrawl-skills"

  # YouTube & Video
  "therohitdas/youtube-full"
  "abe238/youtube-summarizer"
  "michaelgathara/youtube-watcher"
  "apollo1234/yt-dlp-downloader-skill"
  "dillera/tube-summary"
  "therohitdas/transcript"

  # Communication
  "zizi-cat/chirp"
  "red777777/inkedin-automation-that-really-works"
  "xiwan/smtp-send"
  "steipete/slack"
  "jordanprater/multiposting"

  # Productivity
  "cluka-399/clawflows"
  "jk-0001/automation-workflows"
  "promadgenius/ez-cronjob"
  "jamesalmeida/grab"

  # Memory & Self-Improvement
  "icemilo414/cognitive-memory"
  "badaramoni/agentmemory"
  "bowen31337/create-agent-skills"
  "hsssgdtc/ralph-evolver"

  # Search & Research
  "arun-8687/deepwiki"
  "am-will/read-github"
)

echo "=== Installing OpenClaw skills from GitHub ==="
echo "Target: $SKILLS_DIR"
mkdir -p "$SKILLS_DIR"

echo "Cloning openclaw/skills (shallow)..."
git clone --depth 1 "$REPO_URL" "$TMP_DIR"

echo "Copying skills..."
for skill in "${SKILLS[@]}"; do
  src="$TMP_DIR/skills/$skill"
  dest_name=$(basename "$skill")
  if [[ -d "$src" ]]; then
    cp -r "$src" "$SKILLS_DIR/$dest_name"
    echo "  ✓ $dest_name"
  else
    echo "  ✗ $dest_name (not found in repo)"
  fi
done

echo "Cleaning up..."
rm -rf "$TMP_DIR"

echo ""
echo "Done. Skills installed to: $SKILLS_DIR"
echo ""

# Optional: sync to all instance dirs on this machine (run on worker server)
INSTANCES_DIR="${INSTANCES_DIR:-/opt/openclaw/instances}"
if [[ -d "$INSTANCES_DIR" ]]; then
  echo "Syncing skills to instance directories..."
  for inst in "$INSTANCES_DIR"/*/; do
    if [[ -d "$inst" ]]; then
      mkdir -p "${inst}skills"
      cp -r "$SKILLS_DIR"/* "${inst}skills/" 2>/dev/null || true
      echo "  ✓ $(basename "$inst")"
    fi
  done
  echo ""
  echo "Restart containers to pick up new skills: docker restart openclaw-*"
else
  echo "To sync to containers, run on worker server with INSTANCES_DIR set:"
  echo "  INSTANCES_DIR=/opt/openclaw/instances $0"
  echo ""
  echo "Or copy into a single container:"
  echo "  docker cp $SKILLS_DIR/* openclaw-USER_ID:/root/.openclaw/skills/"
fi
