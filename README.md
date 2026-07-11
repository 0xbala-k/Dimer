# Dimer

A personal calorie deficit tracker, installable as a PWA on any phone (no App Store or Apple Developer account needed). Dimer reads your daily calorie burn from Whoop and lets you log food via photo, text, restaurant search, or barcode — so you always know exactly how much room you have to eat.

## Features

- **Deficit ring** — animated SVG ring showing calories burned vs consumed
- **Whoop integration** — pulls daily cycle data (strain + calories burned) via OAuth2 PKCE
- **4 food input methods** — photo analysis (Cal AI), free-text, restaurant search (Spoonacular), barcode (Open Food Facts)
- **Serving size scaling** — adjust grams and macros recalculate proportionally
- **Realtime food log** — Supabase Realtime keeps the log in sync across screens
- **Swipe to delete** — gesture-driven log item removal with haptic feedback
- **Dark theme** — full dark UI built with NativeWind v4

## Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 52 + Expo Router v4 |
| UI | React Native 0.76, NativeWind v4 |
| Auth | Whoop OAuth2 PKCE via `expo-auth-session` |
| Backend | Supabase (Postgres + Realtime + Edge Functions) |
| Food APIs | Cal AI, Spoonacular, Open Food Facts |
| Animation | react-native-reanimated v3 + react-native-svg |
| Storage | `expo-secure-store` (native) / `localStorage` (web) via `lib/storage` |
| Web | react-native-web + Metro static export, PWA (manifest + service worker) |

## Prerequisites

- Node 20+
- [Expo Go](https://expo.dev/go) on your iPhone or iOS Simulator
- A [Supabase](https://supabase.com) project with the schema applied
- A [Whoop developer app](https://developer.whoop.com) with OAuth2 credentials

## Local setup

### 1. Clone and install

```bash
git clone <repo-url>
cd Dimer
npm install
```

### 2. Environment variables

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
EXPO_PUBLIC_WHOOP_CLIENT_ID=<your-whoop-client-id>
EXPO_PUBLIC_WHOOP_CLIENT_SECRET=<your-whoop-client-secret>
```

### 3. Supabase schema

Apply the schema via the Supabase dashboard SQL editor or CLI:

```bash
supabase db push
```

Deploy the edge functions:

```bash
supabase functions deploy food-analyze
supabase functions deploy restaurant-search
```

Set secrets on the edge functions:

```bash
supabase secrets set ANTHROPIC_API_KEY=<key>
supabase secrets set SPOONACULAR_API_KEY=<key>
```

### 4. Whoop OAuth redirect URI

In your Whoop developer dashboard, add to **Allowed Redirect URIs**:

- `dimer://auth/callback` — for production / dev builds
- `exp://<your-local-ip>:8082/--/auth/callback` — for Expo Go (exact URI printed in Metro output on first button press)

Enable scopes: `offline`, `read:cycles`, `read:body_measurement`

### 5. Run

```bash
# Start Metro (scan QR code with Expo Go)
npx expo start

# iOS Simulator directly
npx expo start --ios

# Clear Metro cache if you hit stale module errors
npx expo start --clear
```

Press `r` to reload, `j` to open React Native DevTools.

## Web / PWA

The app runs as a Progressive Web App via react-native-web — same codebase, no native build required.

```bash
npm run web        # dev server in the browser
npm run build:web  # production static export to dist/
npm run serve:web  # serve dist/ locally on :3000
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages). The PWA needs HTTPS for
service worker + camera access. Add your deployed origin's callback,
e.g. `https://<your-domain>/auth/callback`, to the Whoop app's **Allowed Redirect URIs**.

Platform notes:

- **Install**: on iOS Safari use Share → "Add to Home Screen"; Chrome/Edge/Android show an install prompt.
- **Tokens** are stored in `localStorage` on web (`lib/storage.web.ts`) instead of SecureStore. Unlike
  the native Keychain, localStorage is readable by any script on the origin — an XSS could exfiltrate
  the Whoop refresh token. Acceptable for a personal deployment; a backend token proxy with httpOnly
  cookies is the upgrade path for anything multi-user.
- **Barcode scanning** uses the browser `BarcodeDetector` API (Chrome/Edge/Android); Safari and
  Firefox fall back to manual barcode entry (`components/BarcodeInput.web.tsx`).
- **Offline**: `public/sw.js` caches the app shell and static assets; API calls always go to the network.

## Tests

```bash
npx jest          # one-shot
npm test          # watch mode
```

Covers `computeDeficit` (4 cases) and `scaleByServing` (2 cases) as pure Node unit tests, bypassing native dependencies.

## Project structure

```
app/
  _layout.tsx           # Root layout — auth guard, font loading, providers
  index.tsx             # Redirect: → /dashboard or /login
  login.tsx             # Whoop OAuth2 PKCE
  (tabs)/
    _layout.tsx         # Tab bar
    dashboard/index.tsx # Deficit ring, macros, food log
    log/index.tsx       # Full food log with swipe-to-delete
    history/index.tsx   # (Coming soon)
components/
  AddFoodSheet.tsx      # Bottom sheet with 4 input tabs
  BarcodeInput.tsx      # expo-camera barcode scanner
  ConfirmFoodCard.tsx   # Review + save food entry
  DeficitRing.tsx       # Animated SVG ring
  FoodLogItem.tsx       # Swipeable log row
  GlassCard.tsx         # Reusable card surface
  MacroBar.tsx          # Animated macro progress bar
  PhotoInput.tsx        # Camera / photo library
  RestaurantSearch.tsx  # Spoonacular restaurant lookup
  TextFoodInput.tsx     # Free-text food description
  WhoopBadge.tsx        # Strain pill badge
hooks/
  useDeficit.ts
  useFoodLog.ts
  useWhoopData.ts
lib/
  api.ts                # Cal AI food analysis
  openfoodfacts.ts      # Open Food Facts barcode lookup
  supabase.ts
  theme.ts
  types.ts
  whoop.ts              # Token management + Whoop API
supabase/
  functions/food-analyze/
  functions/restaurant-search/
__tests__/
  deficit.test.ts
  serving.test.ts
```
