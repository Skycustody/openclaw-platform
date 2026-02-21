#!/bin/bash
# Sync user data to/from S3
set -euo pipefail

ACTION="${1:?Usage: sync-s3.sh [backup|restore] USER_ID}"
USER_ID="${2:?USER_ID required}"
S3_BUCKET="${3:-openclaw-users-${USER_ID:0:8}}"
LOCAL_DIR="/opt/openclaw/instances/$USER_ID"

case $ACTION in
  backup)
    echo "Backing up $USER_ID to s3://$S3_BUCKET"
    aws s3 sync "$LOCAL_DIR" "s3://$S3_BUCKET/" \
      --exclude "*.log" \
      --exclude "*.tmp" \
      --quiet
    echo "Backup complete"
    ;;
  restore)
    echo "Restoring $USER_ID from s3://$S3_BUCKET"
    mkdir -p "$LOCAL_DIR"
    aws s3 sync "s3://$S3_BUCKET/" "$LOCAL_DIR" --quiet
    echo "Restore complete"
    ;;
  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac
