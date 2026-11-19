# Roost mobile

The Roost dashboard's phone companion: the week's players and events, open issues, and a game picker.
Expo SDK 58, Expo Router, NativeWind, TanStack Query.

## Run it

```bash
cp .env.example .env.local   # optional: point at your dev API instead of production
pnpm install                 # from the repo root
pnpm --filter @roost/mobile ios
```

`pnpm ios` builds a development build (needs Xcode) and starts Metro. After the first build, `pnpm start`
is enough unless you add a library with native code.

Sign in with the same email as the dashboard. The app asks the server for a session token instead of a
cookie (`client: "app"` on `/admin/auth/otp/verify`) and keeps it in the Keychain/Keystore.

## Ship it (EAS)

The project is linked to Expo as `@weflyhq/roost`. `eas.json` has three profiles; all of them point at
`https://roost.playchrona.app` (dev builds load JavaScript from your Metro instead, so `.env.local` still applies).

| Profile | For | Command |
| --- | --- | --- |
| `development` | Your own device, with the dev menu | `eas build --profile development --platform ios` |
| `preview` | Testers, installed directly (ad hoc / APK) | `pnpm build:preview` |
| `production` | TestFlight and the stores; build number bumps itself, then it's submitted automatically | `pnpm build:ios` (or `build:android`) |

The first iOS build asks you to sign in to Apple and creates the certificate and provisioning profile; EAS keeps
them. The first submit asks you to create the app in App Store Connect (bundle ID `app.playchrona.roost`); iOS builds land in TestFlight, never straight in review. `submit:ios` / `submit:android` resend the latest build by hand. Android auto-submit needs a Google Play service account key, and Google requires the very first upload to be done by hand in Play Console.
EAS builds use Node 22 and pnpm 12 (pinned in `eas.json`), since its images ship older pnpm.

The app needs a server with mobile sign-in (`client: "app"` on `/admin/auth/otp/verify`), so deploy the API
before shipping a build that points at it.

## Where things go

See `AGENTS.md`. Routes in `src/app/` stay thin; screens and their data hooks live in `src/features/`.

## If the build fails

- `Unicode Normalization not appropriate for ASCII-8BIT` from CocoaPods: run with a UTF-8 locale,
  `LANG=en_US.UTF-8 pnpm ios`.
- `Unable to resolve module react-native-css-interop/…`: restart Metro with a clean cache, `pnpm start --clear`.
