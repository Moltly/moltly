Moltly iOS wrapper

This is a lightweight SwiftUI iOS app that wraps the existing web app in a WKWebView. It loads a configurable BASE_URL and opens external domains in Safari.

What you get
- Native iOS app target (SwiftUI) using WKWebView
- Configurable `BASE_URL` via `Info.plist`
- Pull-to-refresh, file picker support, external link handling
- XcodeGen `project.yml` to generate the Xcode project

Prerequisites
- macOS with Xcode installed
- XcodeGen installed: `brew install xcodegen`

Setup
1) Web URL is set to `https://moltly.xyz` in `ios/App/Info.plist` under key `BASE_URL`. To test locally, change it to `http://<your-mac-ip>:5777`.

2) Generate the Xcode project:
   - `cd ios`
   - `xcodegen generate`

3) Open and run in Xcode:
   - `open Moltly.xcodeproj`
   - Select an iOS Simulator target and press Run

Notes
- ATS is enabled (HTTPS only). For local HTTP dev, temporarily set `NSAppTransportSecurity/NSAllowsArbitraryLoads` to `YES` in `Info.plist`.
- OAuth flows happen inside the web app. Some providers may disallow embedded WebViews; in that case, sign-in will open externally in Safari.
- File uploads from `<input type="file">` use the iOS document picker.

Icons
- App icons are generated from the webapp icon at `app/icon.png` into `ios/App/Assets.xcassets/AppIcon.appiconset`.
- If you update `app/icon.png`, re-generate icons by running on macOS with ImageMagick installed:
  - `cd ios/App/Assets.xcassets/AppIcon.appiconset`
  - `magick ../../../..../../app/icon.png -resize 40x40 Icon-20@2x.png`
  - Repeat for sizes: 60, 58, 87, 80, 120, 120, 180, 1024 (filenames already present in Contents.json)
