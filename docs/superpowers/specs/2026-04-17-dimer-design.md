# Dimer — Design Spec
_Date: 2026-04-17_

## Overview

Personal calorie deficit tracker iPhone app. Pulls daily calories burned from Whoop via OAuth, lets the user log food via photo, text, restaurant search, or barcode scan, and shows a real-time deficit/surplus dashboard.

Single user. Optimize for speed and simplicity. No multi-tenancy.

---

## Decisions locked in

| Question | Decision |
|----------|----------|
| Project structure | Expo app at repo root (`Dimer/`) |
| App name | **Dimer** everywhere — scheme `dimer`, bundle ID `com.0xmuralik.dimer` |
| API keys | All placeholders + setup instructions in comments; keys never in app bundle |
| History tab | Visible in tab bar, shows "Coming soon" — skipped for MVP |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Expo SDK 52 + Expo Router v4 |
| Language | TypeScript |
| Styling | NativeWind v4 (Tailwind for RN) |
| Database | Supabase JS client |
| Backend | Supabase Edge Functions |
| Auth | expo-auth-session (Whoop OAuth2 PKCE) |
| Distribution | EAS Build → TestFlight |

---

## Design system

### Style
**Ghost Glass** on **OLED black** — ultra-thin glass cards with `backdrop-filter: blur`, 3% white fill, subtle ice-blue borders. No heavy shadows. Everything breathes.

### Color tokens (`lib/theme.ts`)
```ts
export const colors = {
  // Ring
  ring: { from: '#38BDF8', to: '#E0F2FE' },
  ringGlow: 'rgba(56,189,248,0.3)',
  ringSurplus: '#F87171',

  // Macros
  protein: '#38BDF8',   // sky blue
  carbs:   '#818CF8',   // indigo
  fat:     '#F472B6',   // pink
  fiber:   '#34D399',   // emerald

  // Surfaces
  bg:         '#070B14',
  card:        'rgba(56,189,248,0.025)',
  cardBorder:  'rgba(56,189,248,0.08)',
  sheet:       '#09111F',
  sheetBorder: 'rgba(56,189,248,0.08)',

  // Text
  text:        '#E0F2FE',
  textMuted:   '#1E3A5F',
  textDim:     '#0D2D4A',

  // Interactive
  primary:     '#38BDF8',
  primaryEnd:  '#BAE6FD',
  primaryGlow: 'rgba(56,189,248,0.25)',
  danger:      '#F87171',
} as const
```

Changing the entire palette = edit `theme.ts` only. No color values anywhere else.

### Typography
| Role | Font | Weight |
|------|------|--------|
| Display / headings | Syne | 800 |
| Numbers / data | DM Mono | 400–500 |
| Body copy | DM Sans | 400–600 |
| Labels / caps | Inter | 500–600 |

### Spacing & radii
4pt base grid. Cards: `border-radius: 16`. Sheets: `border-radius: 24 24 0 0`. FAB: circle 48pt. Touch targets: minimum 44×44pt throughout.

### Icons
`react-native-svg` stroke icons throughout. No emojis as structural icons. Color-matched per context (macro color for food icon tint, `colors.primary` for primary actions).

---

## Architecture

```
Dimer (Expo app)
  └── Supabase JS client (anon key only)
        └── Supabase Edge Functions   ← API secrets live here
              ├── food-analyze        (Cal AI → Claude fallback)
              └── restaurant-search   (Spoonacular)

Open Food Facts  ← called directly from app (no auth)
Whoop API        ← called directly from app (stored OAuth token)
```

**Seam principle**: every external service is isolated behind a single file or edge function. Swapping Cal AI = edit one edge function. Swapping Supabase = edit `lib/supabase.ts`.

---

## Changeability rules

1. **All design tokens in `lib/theme.ts`** — zero raw hex/size values in components
2. **Each component has one job** — `DeficitRing` knows nothing about Whoop; `MacroBar` knows nothing about Supabase
3. **Three hooks, no global store** — `useWhoopData`, `useFoodLog`, `useDeficit`; all derived state computed at render time
4. **Edge functions as seams** — food AI, restaurant search swappable without touching the app
5. **Types in `lib/types.ts`** — single source of truth for `FoodResult`, `FoodLog`, `DailySummary`

---

## Data model

### `FoodResult` (normalized — returned by all food-analysis paths)
```ts
interface FoodResult {
  name: string
  calories: number
  protein: number     // grams
  carbs: number       // grams
  fats: number        // grams
  fiber: number       // grams, defaults to 0
  ingredients: {
    name: string
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber: number
  }[]
  source: 'calai' | 'claude' | 'openfoodfacts' | 'spoonacular'  // which API analyzed it — different from food_logs.source (which tracks input method: photo/text/restaurant/barcode)
  confidence?: 'high' | 'medium' | 'low'
  notes?: string
}
```

### Supabase schema
```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  whoop_user_id text unique not null,
  whoop_access_token text,
  whoop_refresh_token text,
  whoop_token_expires_at timestamptz,
  created_at timestamptz default now()
);

create table daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  date date not null,
  calories_burned numeric default 0,
  calories_consumed numeric default 0,
  whoop_strain numeric,
  whoop_recovery numeric,
  updated_at timestamptz default now(),
  unique(user_id, date)
);

create table food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  logged_at timestamptz default now(),
  date date not null,
  source text check (source in ('photo','text','restaurant','barcode')),
  name text not null,
  calories numeric not null,
  protein numeric default 0,
  carbs numeric default 0,
  fats numeric default 0,
  fiber numeric default 0,    -- added
  raw_response jsonb,
  notes text
);
```

RLS enabled on all tables. Users read/write own rows only.

---

## File structure

```
app/
  _layout.tsx               — root layout, auth guard, gesture handler, url polyfill
  index.tsx                 — redirect to dashboard or login
  login.tsx                 — "Connect Whoop" screen
  auth/callback.tsx         — deep link handler, token exchange
  (tabs)/
    _layout.tsx             — bottom tab navigator (Today | Log | History)
    dashboard/index.tsx     — main deficit screen
    log/index.tsx           — full food log list for today
    history/index.tsx       — "Coming soon" placeholder (MVP)

components/
  DeficitRing.tsx           — animated SVG gradient ring (react-native-svg)
  MacroBar.tsx              — protein/carbs/fat/fiber bars, colors from theme
  FoodLogItem.tsx           — swipeable food log row, swipe-left to delete
  AddFoodSheet.tsx          — @gorhom/bottom-sheet, 4 tabs
  PhotoInput.tsx            — camera + library picker
  TextFoodInput.tsx         — free text + weight
  RestaurantSearch.tsx      — search input + results list
  BarcodeInput.tsx          — expo-barcode-scanner view
  ConfirmFoodCard.tsx       — editable result card, serving size stepper
  WhoopBadge.tsx            — strain + recovery pill chips

lib/
  theme.ts                  — ALL design tokens (colors, spacing, radii, fonts)
  types.ts                  — FoodResult, DailySummary, FoodLog
  supabase.ts               — Supabase client with SecureStore session adapter
  whoop.ts                  — OAuth helpers, token refresh, Whoop API fetch
  api.ts                    — wrappers to call Supabase Edge Functions
  openfoodfacts.ts          — direct Open Food Facts fetch + parse

hooks/
  useWhoopData.ts           — fetches + caches today's Whoop burn + strain + recovery
  useFoodLog.ts             — Supabase realtime subscription on today's logs
  useDeficit.ts             — derived: burned - consumed, macro totals incl. fiber

supabase/
  functions/
    food-analyze/index.ts   — Cal AI → Claude fallback
    restaurant-search/index.ts — Spoonacular search + detail
```

---

## Screens

### Login (`/login`)
- Dimer wordmark (Syne 800, Ice gradient)
- Animated deficit ring (decorative, partial fill)
- "Connect with Whoop →" CTA button
- Shown when no `whoop_access_token` in SecureStore

### OAuth callback (`/auth/callback`)
- Deep link: `dimer://auth/callback`
- Exchanges code → tokens, stores in SecureStore, redirects to dashboard

### Dashboard (`/(tabs)/dashboard`)
```
[Date]                    [⚡ Strain] [↑ Recovery]

         [Deficit Ring — sky→white gradient]
              487 kcal deficit

    Burned: 2,340        Eaten: 1,853

    ▓▓▓▓▓▓░░  Protein  142g   (sky)
    ▓▓▓▓░░░░  Carbs    198g   (indigo)
    ▓▓░░░░░░  Fat       61g   (pink)
    ▓▓▓░░░░░  Fiber     18g   (emerald)

    TODAY'S LOG                  1,853 kcal
    ─────────────────────────────────────
    [icon] Grilled Chicken Breast         265
    [icon] Oatmeal + Banana               310
    [icon] Chipotle Burrito Bowl          740

                    [ + ]   ← FAB, opens AddFoodSheet
```

Ring color:
- Deficit (consumed < burned): Ice gradient `#38BDF8 → #E0F2FE`
- Near limit (consumed 90–100% of burned): amber `#FBBF24`
- Surplus (consumed > burned): red `#F87171`

### AddFoodSheet (bottom sheet, 4 tabs)
**Photo** → compress with expo-image-manipulator (800px wide, 0.7 quality) → `food-analyze` edge fn → ConfirmFoodCard

**Text** → free text input + optional weight → `food-analyze` edge fn → ConfirmFoodCard

**Restaurant** → search input → `restaurant-search` edge fn (Spoonacular) → results list → ConfirmFoodCard

**Barcode** → `expo-barcode-scanner` → Open Food Facts direct → ConfirmFoodCard

### ConfirmFoodCard
- Displays name, calories, protein, carbs, fat, fiber
- All values are tappable inline-editable
- Serving size stepper: adjusting grams rescales all macros proportionally
- AI source + confidence badge shown
- "Retake" → back to input tab
- "Save to Log →" → **inserts** into `food_logs` (not upsert — same meal can be logged twice), then upserts `daily_summaries` totals, triggers realtime update on dashboard

### Log (`/(tabs)/log`)
- Full food list for today
- Swipe left on any item → delete with confirmation
- Pull to refresh

### History (`/(tabs)/history`)
- "Coming soon" placeholder for MVP

---

## Food-logging flows

```
Photo  → compress → food-analyze (Cal AI) → Claude fallback → ConfirmFoodCard → Supabase
Text   → food-analyze (Cal AI describeMeal) → Claude fallback → ConfirmFoodCard → Supabase
Restaurant → restaurant-search (Spoonacular) → list → ConfirmFoodCard → Supabase
Barcode → Open Food Facts (direct) → ConfirmFoodCard → Supabase
```

On any save → `daily_summaries` upserted → `useFoodLog` realtime fires → dashboard updates live.

---

## Hooks

### `useWhoopData`
- Reads `whoop_access_token` from SecureStore
- Checks `whoop_token_expires_at`; if within 5 min, refreshes first
- Fetches `/developer/v1/cycle` for today's burn (sum kilojoules → ÷ 4.184 = kcal)
- Fetches strain + recovery from cycle data
- Caches in component state; refetches on app foreground

### `useFoodLog`
- Supabase realtime channel on `food_logs` for today's date + current user
- Returns `logs[]` and `totalCalories`

### `useDeficit`
- Pure derivation from `useWhoopData` + `useFoodLog`
- Returns `deficit`, `surplus`, `macroTotals` (protein/carbs/fat/fiber)
- No side effects

---

## Environment variables

```bash
# .env (Expo project — safe to include anon key)
EXPO_PUBLIC_SUPABASE_URL=          # your Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key (public, safe)
EXPO_PUBLIC_WHOOP_CLIENT_ID=       # from developer.whoop.com

# Supabase Dashboard → Edge Functions → Secrets (never in app)
# CALAI_API_KEY=
# ANTHROPIC_API_KEY=
# SPOONACULAR_API_KEY=
```

---

## MVP build order

1. Supabase schema + RLS + Edge Function scaffolding (`food-analyze`, `restaurant-search`)
2. Expo project init, `lib/theme.ts`, `lib/types.ts`, navigation shell, tab layout
3. Whoop OAuth flow + SecureStore token storage + login screen
4. Whoop data fetch + daily summary upsert
5. Dashboard layout + `DeficitRing` + `MacroBar` (hardcoded data first)
6. `food-analyze` Edge Function (Cal AI + Claude fallback, fiber in response)
7. Photo input tab (compress → edge fn → `ConfirmFoodCard`)
8. Text input tab
9. `restaurant-search` Edge Function + `RestaurantSearch` component
10. Open Food Facts barcode scan + `BarcodeInput`
11. Food log save → realtime subscription → live dashboard updates
12. Swipe-to-delete on log items
13. Haptic feedback on key interactions
14. EAS development build → test on device → EAS preview build → TestFlight

---

## Out of scope for MVP

- Android support
- Apple Health integration
- Push / local notifications
- Historical trend charts
- Meal planning or AI suggestions
- Apple Watch / Live Activity
- Social features
