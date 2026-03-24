# Apple Gatekeeper: signed & notarized macOS builds

macOS shows **“Valnaa can’t be opened because Apple cannot verify it”** when the app is **not** signed with a **Developer ID** certificate and **notarized** by Apple. There is no free way to remove that warning for arbitrary downloads; Apple requires a paid developer account and their notary service.

## What you need

1. **Apple Developer Program** — [developer.apple.com/programs](https://developer.apple.com/programs/) (~$99 USD/year, per organization or individual).
2. **Developer ID Application** certificate (not “Mac App Distribution”) — create in Certificates, Identifiers & Profiles, then install in Keychain.
3. **Export a `.p12`** (or use the certificate in Keychain on the Mac that runs the build).
4. **App-specific password** — for your Apple ID: [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords (used by `notarytool`, not your normal password).
5. **Team ID** — 10-character ID in the [Membership](https://developer.apple.com/account/#/membership/) page.

## Build-time environment (CI or local)

Set these when running `electron-builder` (e.g. GitHub Actions secrets):

| Variable | Purpose |
|----------|---------|
| `CSC_LINK` | Path or base64 of the **.p12** (Developer ID Application) |
| `CSC_KEY_PASSWORD` | Password for the .p12 |
| `APPLE_ID` | Apple ID email used for the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Team ID |

With signing configured, `electron-builder` signs the app. Add **notarization** by uncommenting and filling in `mac.notarize` in `electron-builder.yml` (see comment in that file), or follow [electron-builder mac notarize](https://www.electron.build/configuration/mac) for your exact version.

## After notarization

- Users who download the **DMG from your site/GitHub** should see a normal open prompt (first open may still say the app was downloaded from the internet — that is expected).
- **Stapling**: `electron-builder` usually staples the notarization ticket to the app/DMG so offline Gatekeeper checks work.

## Without signing (current default)

Users can still run the app: **Right-click → Open** once, or **System Settings → Privacy & Security → Open Anyway** after a blocked launch. This is normal for unsigned apps.

## Related

- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Hardened Runtime](https://developer.apple.com/documentation/security/hardened_runtime) (enabled in this repo via `electron-builder.yml` + `build/entitlements.mac.plist`)
