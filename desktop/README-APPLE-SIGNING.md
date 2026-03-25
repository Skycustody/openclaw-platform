# Apple Code Signing & Notarization

This app is signed with a Developer ID Application certificate and notarized by Apple,
so macOS Gatekeeper trusts it on download.

## Certificate

- **Identity:** `Developer ID Application: Mac-Bride Nana Zemkwe (3K5P6R49A5)`
- **Team ID:** `3K5P6R49A5`

Already installed in Keychain on the build Mac.

## Notarization credentials (one-time setup)

1. Go to [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords.
2. Generate a password named `notarytool`.
3. Store it in Keychain:

```bash
xcrun notarytool store-credentials "notarytool-profile" \
  --apple-id "YOUR_APPLE_ID_EMAIL" \
  --team-id "3K5P6R49A5" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

## Building signed + notarized DMGs

```bash
cd desktop
npm run dist:mac
```

`electron-builder` will:
1. Sign the `.app` with hardened runtime + entitlements
2. Submit to Apple's notary service (requires internet)
3. Staple the notarization ticket to the DMG

The resulting DMGs in `desktop/release/` are Gatekeeper-trusted.

## Environment variables (for CI)

| Variable | Purpose |
|----------|---------|
| `CSC_LINK` | Base64 of the .p12 certificate |
| `CSC_KEY_PASSWORD` | .p12 password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | `3K5P6R49A5` |

## Troubleshooting

- **"skipped macOS notarization"** → Credentials not found. Run `store-credentials` above.
- **"The signature of the binary is invalid"** → Clean build: `rm -rf release/ dist/` then rebuild.
- **Notarization rejected** → Check `xcrun notarytool log <submission-id> --keychain-profile "notarytool-profile"` for details.
