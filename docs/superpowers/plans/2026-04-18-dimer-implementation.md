# Dimer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Dimer — a personal calorie-deficit tracker iPhone app that pulls Whoop burn data and lets the user log food via photo, text, restaurant search, or barcode scan.

**Architecture:** Expo SDK 52 + Expo Router v4 at the repo root. Supabase handles auth session storage and hosts two Edge Functions that keep all third-party API keys server-side. The app calls Whoop and Open Food Facts directly using stored OAuth tokens and the public OFf API respectively.

**Tech Stack:** TypeScript, Expo SDK 52, Expo Router v4, NativeWind v4, Supabase JS, react-native-svg, @gorhom/bottom-sheet v5, react-native-reanimated v3, expo-auth-session, expo-secure-store, expo-image-manipulator, expo-barcode-scanner, @expo-google-fonts/{syne,dm-mono,dm-sans,inter}

---

## Task 1: Supabase schema + RLS

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/001_initial_schema.sql

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
  user_id uuid references users(id) on delete cascade,
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
  user_id uuid references users(id) on delete cascade,
  logged_at timestamptz default now(),
  date date not null,
  source text check (source in ('photo','text','restaurant','barcode')),
  name text not null,
  calories numeric not null,
  protein numeric default 0,
  carbs numeric default 0,
  fats numeric default 0,
  fiber numeric default 0,
  raw_response jsonb,
  notes text
);

-- RLS
alter table users enable row level security;
alter table daily_summaries enable row level security;
alter table food_logs enable row level security;

-- Users can only see/edit their own row
create policy "users_self" on users
  for all using (auth.uid()::text = id::text);

-- daily_summaries scoped to owner
create policy "daily_summaries_owner" on daily_summaries
  for all using (
    user_id in (select id from users where id::text = auth.uid()::text)
  );

-- food_logs scoped to owner
create policy "food_logs_owner" on food_logs
  for all using (
    user_id in (select id from users where id::text = auth.uid()::text)
  );

-- Allow realtime on food_logs
alter publication supabase_realtime add table food_logs;
```

- [ ] **Step 2: Apply migration**

In Supabase dashboard → SQL Editor, paste and run the migration. Or via CLI:
```bash
supabase db push
```

- [ ] **Step 3: Commit**
```bash
git add supabase/
git commit -m "feat: add supabase schema and RLS policies"
```

---

## Task 2: Edge Function — food-analyze

**Files:**
- Create: `supabase/functions/food-analyze/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/food-analyze/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CLAUDE_SYSTEM = `You are a nutrition analysis assistant. Return ONLY valid JSON, no markdown.

Schema:
{
  "name": "short dish name",
  "calories": <kcal number>,
  "protein": <grams number>,
  "carbs": <grams number>,
  "fats": <grams number>,
  "fiber": <grams number>,
  "ingredients": [{ "name": "string", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0 }],
  "confidence": "high" | "medium" | "low",
  "notes": "any caveats"
}

Rules:
- All macros in grams. Calories in kcal. Fiber in grams (0 if unknown).
- If weight stated (e.g. "150g chicken"), use that weight.
- If no weight, use a typical single serving.
- If unrecognizable, return { "error": "unrecognized" }.
- Never refuse. Always estimate. Mark confidence low if uncertain.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { mode, data } = await req.json() as { mode: 'photo' | 'text' | 'barcode', data: string }
    const calaiKey = Deno.env.get('CALAI_API_KEY') ?? ''
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    // 1. Try Cal AI
    const endpoint = mode === 'photo'
      ? 'https://api.calai.app/v4/scanImage'
      : mode === 'text'
      ? 'https://api.calai.app/v4/describeMeal'
      : 'https://api.calai.app/v4/scanBarcode'

    const body = mode === 'photo' ? { data: { imageData: data } }
      : mode === 'text' ? { data: { text: data } }
      : { data: { barcodeData: data } }

    const calRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${calaiKey}` },
      body: JSON.stringify(body),
    })
    const calJson = await calRes.json()

    if (calJson.success && calJson.data) {
      const d = calJson.data
      return new Response(JSON.stringify({
        name: d.name ?? 'Unknown',
        calories: d.calories ?? 0,
        protein: d.protein ?? 0,
        carbs: d.carbs ?? 0,
        fats: d.fats ?? d.fat ?? 0,
        fiber: d.fiber ?? 0,
        ingredients: d.ingredients ?? [],
        source: 'calai',
        confidence: 'high',
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // 2. Barcode: no Claude fallback
    if (mode === 'barcode') {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 3. Claude fallback (photo + text)
    const messages = mode === 'photo'
      ? [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: 'Analyze this food photo and return the JSON.' },
        ]}]
      : [{ role: 'user', content: `Analyze this food and return JSON: ${data}` }]

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: CLAUDE_SYSTEM,
        messages,
      }),
    })
    const claudeJson = await claudeRes.json()
    const text = claudeJson.content?.[0]?.text ?? ''

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      // retry with stricter prompt
      const retry = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: CLAUDE_SYSTEM,
          messages: [...messages, { role: 'assistant', content: 'Here is the JSON:' }],
        }),
      })
      const retryJson = await retry.json()
      parsed = JSON.parse(retryJson.content?.[0]?.text ?? '{}')
    }

    if (parsed.error) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 422,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      name: parsed.name ?? 'Unknown',
      calories: Number(parsed.calories ?? 0),
      protein: Number(parsed.protein ?? 0),
      carbs: Number(parsed.carbs ?? 0),
      fats: Number(parsed.fats ?? 0),
      fiber: Number(parsed.fiber ?? 0),
      ingredients: (parsed.ingredients as unknown[]) ?? [],
      source: 'claude',
      confidence: parsed.confidence ?? 'low',
      notes: parsed.notes,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Deploy (once Supabase CLI is linked)**
```bash
supabase functions deploy food-analyze
```

- [ ] **Step 3: Commit**
```bash
git add supabase/functions/food-analyze/
git commit -m "feat: add food-analyze edge function (Cal AI + Claude fallback)"
```

---

## Task 3: Edge Function — restaurant-search

**Files:**
- Create: `supabase/functions/restaurant-search/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/restaurant-search/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { query, id } = await req.json() as { query?: string; id?: number }
    const key = Deno.env.get('SPOONACULAR_API_KEY') ?? ''

    // Fetch detail for a single item
    if (id !== undefined) {
      const res = await fetch(
        `https://api.spoonacular.com/food/menuItems/${id}?apiKey=${key}`
      )
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: 'quota_exceeded' }), {
          status: 402,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      const item = await res.json()
      return new Response(JSON.stringify({
        id: item.id,
        name: item.title,
        calories: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Calories')?.amount ?? 0,
        protein: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Protein')?.amount ?? 0,
        carbs: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Carbohydrates')?.amount ?? 0,
        fats: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Fat')?.amount ?? 0,
        fiber: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Fiber')?.amount ?? 0,
        source: 'spoonacular',
        confidence: 'high' as const,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Search
    const res = await fetch(
      `https://api.spoonacular.com/food/menuItems/search?query=${encodeURIComponent(query ?? '')}&number=10&apiKey=${key}`
    )
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: 'quota_exceeded' }), {
        status: 402,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const data = await res.json()
    const results = (data.menuItems ?? []).map((item: { id: number; title: string; restaurantChain?: string; nutrition?: { nutrients?: { name: string; amount: number }[] } }) => ({
      id: item.id,
      name: item.title,
      restaurant: item.restaurantChain ?? '',
      calories: item.nutrition?.nutrients?.find((n) => n.name === 'Calories')?.amount ?? 0,
      protein: item.nutrition?.nutrients?.find((n) => n.name === 'Protein')?.amount ?? 0,
      carbs: item.nutrition?.nutrients?.find((n) => n.name === 'Carbohydrates')?.amount ?? 0,
      fats: item.nutrition?.nutrients?.find((n) => n.name === 'Fat')?.amount ?? 0,
      fiber: item.nutrition?.nutrients?.find((n) => n.name === 'Fiber')?.amount ?? 0,
    }))

    return new Response(JSON.stringify({ results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Deploy**
```bash
supabase functions deploy restaurant-search
```

- [ ] **Step 3: Commit**
```bash
git add supabase/functions/restaurant-search/
git commit -m "feat: add restaurant-search edge function (Spoonacular)"
```

---

## Task 4: Expo project init + all dependencies

**Files:**
- Create: `app.json`, `package.json`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`, `.env`, `tsconfig.json`

- [ ] **Step 1: Scaffold Expo app at repo root**

```bash
# From inside Dimer/ repo root
npx create-expo-app@latest . --template blank-typescript
```
Answer "yes" when asked to overwrite (it will add Expo files; existing LICENSE/README are preserved).

- [ ] **Step 2: Install all dependencies**

```bash
npx expo install expo-router expo-camera expo-image-picker expo-image-manipulator
npx expo install expo-barcode-scanner expo-auth-session expo-web-browser
npx expo install expo-secure-store expo-file-system expo-haptics
npx expo install @supabase/supabase-js react-native-url-polyfill
npx expo install react-native-svg react-native-screens react-native-safe-area-context
npx expo install react-native-reanimated react-native-gesture-handler
npx expo install @expo-google-fonts/syne @expo-google-fonts/dm-mono @expo-google-fonts/dm-sans @expo-google-fonts/inter expo-font
npm install nativewind tailwindcss
npm install @gorhom/bottom-sheet
```

- [ ] **Step 3: Configure app.json**

```json
{
  "expo": {
    "name": "Dimer",
    "slug": "dimer",
    "scheme": "dimer",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": { "image": "./assets/splash.png", "resizeMode": "contain", "backgroundColor": "#070B14" },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.0xmuralik.dimer",
      "infoPlist": {
        "NSCameraUsageDescription": "Used to scan food photos for calorie tracking",
        "NSPhotoLibraryUsageDescription": "Used to select food photos from your library"
      }
    },
    "plugins": [
      "expo-router",
      ["expo-camera", { "cameraPermission": "Allow Dimer to access your camera." }],
      ["expo-barcode-scanner", { "cameraPermission": "Allow Dimer to access your camera for barcode scanning." }],
      "react-native-reanimated/plugin"
    ],
    "experiments": { "typedRoutes": true }
  }
}
```

- [ ] **Step 4: Configure babel.config.js**

```js
// babel.config.js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  }
}
```

- [ ] **Step 5: Configure metro.config.js**

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const config = getDefaultConfig(__dirname)
module.exports = withNativeWind(config, { input: './global.css' })
```

- [ ] **Step 6: Configure tailwind.config.js**

```js
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 7: Create global.css**

```css
/* global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create .env**

```bash
# .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_WHOOP_CLIENT_ID=your_whoop_client_id
# Get Whoop client ID from: https://developer.whoop.com
# Get Supabase values from: supabase.com -> project -> Settings -> API
```

- [ ] **Step 9: Add nativewind types to tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.d.ts", "nativewind-env.d.ts"]
}
```

- [ ] **Step 10: Create nativewind-env.d.ts**

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 11: Verify install**
```bash
npx expo start
```
Expected: Metro bundler starts, QR code shown. Press `i` to open in simulator (no camera features yet).

- [ ] **Step 12: Commit**
```bash
git add -A
git commit -m "feat: scaffold Expo project with all dependencies"
```

---

## Task 5: Foundation — lib/theme.ts + lib/types.ts + test setup

**Files:**
- Create: `lib/theme.ts`, `lib/types.ts`, `jest.config.js`, `__tests__/deficit.test.ts`

- [ ] **Step 1: Create lib/theme.ts**

```ts
// lib/theme.ts
export const colors = {
  ring: { from: '#38BDF8', to: '#E0F2FE' },
  ringGlow: 'rgba(56,189,248,0.3)',
  ringAmber: '#FBBF24',
  ringSurplus: '#F87171',

  protein: '#38BDF8',
  carbs: '#818CF8',
  fat: '#F472B6',
  fiber: '#34D399',

  bg: '#070B14',
  card: 'rgba(56,189,248,0.025)',
  cardBorder: 'rgba(56,189,248,0.08)',
  sheet: '#09111F',
  sheetBorder: 'rgba(56,189,248,0.08)',

  text: '#E0F2FE',
  textMuted: '#1E3A5F',
  textDim: '#0D2D4A',

  primary: '#38BDF8',
  primaryEnd: '#BAE6FD',
  primaryGlow: 'rgba(56,189,248,0.25)',
  danger: '#F87171',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  sheet: 24,
  full: 9999,
} as const

export const fonts = {
  display: 'Syne_800ExtraBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  label: 'Inter_500Medium',
  labelSemiBold: 'Inter_600SemiBold',
} as const

export const macroColors = {
  protein: colors.protein,
  carbs: colors.carbs,
  fats: colors.fat,
  fiber: colors.fiber,
} as const

// Ring color based on consumption ratio
export function ringColor(pct: number): string {
  if (pct >= 1.0) return colors.ringSurplus
  if (pct >= 0.9) return colors.ringAmber
  return colors.ring.from  // gradient handled in SVG
}
```

- [ ] **Step 2: Create lib/types.ts**

```ts
// lib/types.ts
export interface Ingredient {
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
}

export interface FoodResult {
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
  ingredients: Ingredient[]
  source: 'calai' | 'claude' | 'openfoodfacts' | 'spoonacular'
  confidence?: 'high' | 'medium' | 'low'
  notes?: string
}

export interface FoodLog {
  id: string
  user_id: string
  logged_at: string
  date: string
  source: 'photo' | 'text' | 'restaurant' | 'barcode'
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
  raw_response?: Record<string, unknown>
  notes?: string
}

export interface DailySummary {
  id: string
  user_id: string
  date: string
  calories_burned: number
  calories_consumed: number
  whoop_strain: number | null
  whoop_recovery: number | null
  updated_at: string
}

export interface MacroTotals {
  protein: number
  carbs: number
  fats: number
  fiber: number
}

export interface DeficitState {
  deficit: number    // burned - consumed (positive = deficit, negative = surplus)
  pct: number        // consumed / burned, 0 to 1+
  isDeficit: boolean
  macroTotals: MacroTotals
}

export interface WhoopData {
  burned: number
  strain: number | null
  recovery: number | null
}

export interface RestaurantResult {
  id: number
  name: string
  restaurant: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
}
```

- [ ] **Step 3: Install Jest**

```bash
npx expo install jest-expo @types/jest
```

- [ ] **Step 4: Create jest.config.js**

```js
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|nativewind|react-native-svg)',
  ],
}
```

- [ ] **Step 5: Write failing test for computeDeficit**

```ts
// __tests__/deficit.test.ts
import { computeDeficit } from '../hooks/useDeficit'
import type { FoodLog } from '../lib/types'

const makeLogs = (overrides: Partial<FoodLog>[]): FoodLog[] =>
  overrides.map((o, i) => ({
    id: String(i),
    user_id: 'u1',
    logged_at: new Date().toISOString(),
    date: '2026-04-18',
    source: 'text' as const,
    name: 'food',
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    ...o,
  }))

describe('computeDeficit', () => {
  it('returns deficit when consumed < burned', () => {
    const logs = makeLogs([{ calories: 500, protein: 30, carbs: 50, fats: 10, fiber: 5 }])
    const result = computeDeficit(1000, logs)
    expect(result.deficit).toBe(500)
    expect(result.isDeficit).toBe(true)
    expect(result.pct).toBeCloseTo(0.5)
    expect(result.macroTotals.protein).toBe(30)
    expect(result.macroTotals.fiber).toBe(5)
  })

  it('returns surplus when consumed > burned', () => {
    const logs = makeLogs([{ calories: 1500 }])
    const result = computeDeficit(1000, logs)
    expect(result.deficit).toBe(-500)
    expect(result.isDeficit).toBe(false)
    expect(result.pct).toBeCloseTo(1.5)
  })

  it('handles zero burned gracefully', () => {
    const result = computeDeficit(0, [])
    expect(result.pct).toBe(0)
    expect(result.deficit).toBe(0)
  })

  it('sums macros across multiple logs', () => {
    const logs = makeLogs([
      { protein: 20, carbs: 30, fats: 5, fiber: 2, calories: 200 },
      { protein: 10, carbs: 15, fats: 3, fiber: 1, calories: 100 },
    ])
    const result = computeDeficit(2000, logs)
    expect(result.macroTotals.protein).toBe(30)
    expect(result.macroTotals.carbs).toBe(45)
    expect(result.macroTotals.fats).toBe(8)
    expect(result.macroTotals.fiber).toBe(3)
  })
})
```

- [ ] **Step 6: Run test — expect FAIL**
```bash
npx jest __tests__/deficit.test.ts
```
Expected: FAIL — `computeDeficit` not yet defined.

- [ ] **Step 7: Verify TypeScript compiles**
```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**
```bash
git add lib/ __tests__/ jest.config.js
git commit -m "feat: add theme tokens, shared types, and deficit test"
```

---

## Task 6: Lib files — supabase.ts, whoop.ts, api.ts, openfoodfacts.ts

**Files:**
- Create: `lib/supabase.ts`, `lib/whoop.ts`, `lib/api.ts`, `lib/openfoodfacts.ts`

- [ ] **Step 1: Create lib/supabase.ts**

```ts
// lib/supabase.ts
import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// SecureStore has a 2KB limit per key — fine for tokens
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 2: Create lib/whoop.ts**

```ts
// lib/whoop.ts
import * as SecureStore from 'expo-secure-store'
import * as AuthSession from 'expo-auth-session'
import type { WhoopData } from './types'

const WHOOP_CLIENT_ID = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID!
const DISCOVERY = {
  authorizationEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  tokenEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/token',
}

export const WHOOP_SCOPES = ['offline', 'read:recovery', 'read:cycles', 'read:workout', 'read:sleep', 'read:profile']

export function makeWhoopRedirectUri() {
  return AuthSession.makeRedirectUri({ scheme: 'dimer', path: 'auth/callback' })
}

export function getWhoopDiscovery() {
  return DISCOVERY
}

// --- Token storage ---
const KEYS = {
  accessToken: 'whoop_access_token',
  refreshToken: 'whoop_refresh_token',
  expiresAt: 'whoop_expires_at',
}

export async function saveWhoopTokens(params: {
  access_token: string
  refresh_token: string
  expires_in: number
}) {
  const expiresAt = Date.now() + params.expires_in * 1000
  await Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, params.access_token),
    SecureStore.setItemAsync(KEYS.refreshToken, params.refresh_token),
    SecureStore.setItemAsync(KEYS.expiresAt, String(expiresAt)),
  ])
}

export async function clearWhoopTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.accessToken),
    SecureStore.deleteItemAsync(KEYS.refreshToken),
    SecureStore.deleteItemAsync(KEYS.expiresAt),
  ])
}

export async function getValidAccessToken(): Promise<string | null> {
  const [token, refreshToken, expiresAtStr] = await Promise.all([
    SecureStore.getItemAsync(KEYS.accessToken),
    SecureStore.getItemAsync(KEYS.refreshToken),
    SecureStore.getItemAsync(KEYS.expiresAt),
  ])

  if (!token) return null

  const expiresAt = Number(expiresAtStr ?? '0')
  const fiveMinutes = 5 * 60 * 1000
  if (Date.now() < expiresAt - fiveMinutes) return token

  // Refresh
  if (!refreshToken) return null
  try {
    const res = await fetch(DISCOVERY.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: WHOOP_CLIENT_ID,
        refresh_token: refreshToken,
      }).toString(),
    })
    if (!res.ok) return null
    const data = await res.json()
    await saveWhoopTokens(data)
    return data.access_token
  } catch {
    return null
  }
}

// --- API calls ---
async function whoopFetch(path: string): Promise<Response> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('no_token')
  return fetch(`https://api.prod.whoop.com/developer/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function fetchTodayWhoopData(): Promise<WhoopData> {
  const today = new Date().toISOString().split('T')[0]
  const start = `${today}T00:00:00.000Z`
  const end = `${today}T23:59:59.999Z`

  const res = await whoopFetch(`/cycle?start=${start}&end=${end}`)
  if (!res.ok) throw new Error(`Whoop API error: ${res.status}`)
  const data = await res.json()

  const cycles: { score?: { kilojoule?: number; strain?: number; recovery_score?: number } }[] = data.records ?? []

  const totalKj = cycles.reduce((sum, c) => sum + (c.score?.kilojoule ?? 0), 0)
  const burned = Math.round(totalKj / 4.184)

  const latest = cycles[cycles.length - 1]
  const strain = latest?.score?.strain ?? null
  const recovery = latest?.score?.recovery_score ?? null

  return { burned, strain, recovery }
}
```

- [ ] **Step 3: Create lib/api.ts**

```ts
// lib/api.ts
import { supabase } from './supabase'
import type { FoodResult, RestaurantResult } from './types'

export async function analyzeFood(params: {
  mode: 'photo' | 'text' | 'barcode'
  data: string
}): Promise<FoodResult> {
  const { data, error } = await supabase.functions.invoke('food-analyze', {
    body: { mode: params.mode, data: params.data },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as FoodResult
}

export async function searchRestaurant(query: string): Promise<RestaurantResult[]> {
  const { data, error } = await supabase.functions.invoke('restaurant-search', {
    body: { query },
  })
  if (error) throw error
  if (data?.error === 'quota_exceeded') throw new Error('quota_exceeded')
  return (data?.results ?? []) as RestaurantResult[]
}

export async function getRestaurantItem(id: number): Promise<FoodResult> {
  const { data, error } = await supabase.functions.invoke('restaurant-search', {
    body: { id },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return {
    ...data,
    ingredients: [],
    source: 'spoonacular' as const,
  } as FoodResult
}
```

- [ ] **Step 4: Create lib/openfoodfacts.ts**

```ts
// lib/openfoodfacts.ts
import type { FoodResult } from './types'

interface OFFProduct {
  product_name?: string
  serving_size?: string
  nutriments?: {
    'energy-kcal_100g'?: number
    'energy-kcal_serving'?: number
    proteins_100g?: number
    carbohydrates_100g?: number
    fat_100g?: number
    fiber_100g?: number
  }
}

function parseServingGrams(servingSize: string | undefined): number | null {
  if (!servingSize) return null
  const match = servingSize.match(/([\d.]+)\s*g/i)
  return match ? parseFloat(match[1]) : null
}

export async function fetchByBarcode(barcode: string): Promise<FoodResult | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
  if (!res.ok) return null
  const json = await res.json()
  if (json.status !== 1 || !json.product) return null

  const product: OFFProduct = json.product
  const n = product.nutriments ?? {}
  const servingG = parseServingGrams(product.serving_size)

  let calories: number
  let protein: number
  let carbs: number
  let fats: number
  let fiber: number

  if (servingG && n['energy-kcal_100g'] !== undefined) {
    const ratio = servingG / 100
    calories = Math.round((n['energy-kcal_100g'] ?? 0) * ratio)
    protein = Math.round((n.proteins_100g ?? 0) * ratio * 10) / 10
    carbs = Math.round((n.carbohydrates_100g ?? 0) * ratio * 10) / 10
    fats = Math.round((n.fat_100g ?? 0) * ratio * 10) / 10
    fiber = Math.round((n.fiber_100g ?? 0) * ratio * 10) / 10
  } else if (n['energy-kcal_serving'] !== undefined) {
    calories = Math.round(n['energy-kcal_serving'])
    protein = Math.round((n.proteins_100g ?? 0) * 10) / 10
    carbs = Math.round((n.carbohydrates_100g ?? 0) * 10) / 10
    fats = Math.round((n.fat_100g ?? 0) * 10) / 10
    fiber = Math.round((n.fiber_100g ?? 0) * 10) / 10
  } else {
    // Data incomplete — return what we have, caller shows edit prompt
    calories = Math.round(n['energy-kcal_100g'] ?? 0)
    protein = n.proteins_100g ?? 0
    carbs = n.carbohydrates_100g ?? 0
    fats = n.fat_100g ?? 0
    fiber = n.fiber_100g ?? 0
  }

  return {
    name: product.product_name ?? 'Unknown Product',
    calories,
    protein,
    carbs,
    fats,
    fiber,
    ingredients: [],
    source: 'openfoodfacts',
    confidence: 'high',
    notes: servingG ? undefined : 'Nutrition data per 100g — serving size unknown',
  }
}
```

- [ ] **Step 5: Verify TypeScript**
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**
```bash
git add lib/
git commit -m "feat: add supabase client, whoop auth, api wrappers, and openfoodfacts"
```

---

## Task 7: Navigation shell + auth guard

**Files:**
- Create: `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/history/index.tsx`

- [ ] **Step 1: Create app/_layout.tsx**

```tsx
// app/_layout.tsx
import 'react-native-url-polyfill/auto'
import 'react-native-gesture-handler'
import '../global.css'
import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import * as WebBrowser from 'expo-web-browser'
import { useFonts, Syne_800ExtraBold } from '@expo-google-fonts/syne'
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono'
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans'
import { Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter'
import { getValidAccessToken } from '../lib/whoop'
import { colors } from '../lib/theme'
import { View } from 'react-native'

WebBrowser.maybeCompleteAuthSession()
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [authChecked, setAuthChecked] = useState(false)
  const [hasToken, setHasToken] = useState(false)

  const [fontsLoaded] = useFonts({
    Syne_800ExtraBold,
    DMMono_400Regular,
    DMMono_500Medium,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    Inter_500Medium,
    Inter_600SemiBold,
  })

  useEffect(() => {
    getValidAccessToken().then((token) => {
      setHasToken(!!token)
      setAuthChecked(true)
    })
  }, [])

  useEffect(() => {
    if (fontsLoaded && authChecked) SplashScreen.hideAsync()
  }, [fontsLoaded, authChecked])

  if (!fontsLoaded || !authChecked) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
```

- [ ] **Step 2: Create app/index.tsx**

```tsx
// app/index.tsx
import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { getValidAccessToken } from '../lib/whoop'
import { colors } from '../lib/theme'

export default function Index() {
  const [dest, setDest] = useState<'/(tabs)/dashboard' | '/login' | null>(null)

  useEffect(() => {
    getValidAccessToken().then((token) => {
      setDest(token ? '/(tabs)/dashboard' : '/login')
    })
  }, [])

  if (!dest) return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  return <Redirect href={dest} />
}
```

- [ ] **Step 3: Create app/(tabs)/_layout.tsx**

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router'
import { colors, fonts } from '../../lib/theme'
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg'

function TodayIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M12 6v6l4 2" strokeLinecap="round" />
    </Svg>
  )
}

function LogIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Line x1={8} y1={6} x2={21} y2={6} strokeLinecap="round" />
      <Line x1={8} y1={12} x2={21} y2={12} strokeLinecap="round" />
      <Line x1={8} y1={18} x2={21} y2={18} strokeLinecap="round" />
      <Line x1={3} y1={6} x2={3.01} y2={6} strokeLinecap="round" />
      <Line x1={3} y1={12} x2={3.01} y2={12} strokeLinecap="round" />
      <Line x1={3} y1={18} x2={3.01} y2={18} strokeLinecap="round" />
    </Svg>
  )
}

function HistoryIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(9,17,31,0.95)',
          borderTopColor: colors.cardBorder,
          borderTopWidth: 1,
          paddingBottom: 6,
          height: 60,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{ title: 'Today', tabBarIcon: ({ color }) => <TodayIcon color={color} /> }}
      />
      <Tabs.Screen
        name="log/index"
        options={{ title: 'Log', tabBarIcon: ({ color }) => <LogIcon color={color} /> }}
      />
      <Tabs.Screen
        name="history/index"
        options={{ title: 'History', tabBarIcon: ({ color }) => <HistoryIcon color={color} /> }}
      />
    </Tabs>
  )
}
```

- [ ] **Step 4: Create app/(tabs)/history/index.tsx**

```tsx
// app/(tabs)/history/index.tsx
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '../../../lib/theme'

export default function HistoryScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.textMuted }}>
          Coming Soon
        </Text>
        <Text style={{ fontFamily: fonts.label, fontSize: 13, color: colors.textDim }}>
          Historical trends in a future update
        </Text>
      </View>
    </SafeAreaView>
  )
}
```

- [ ] **Step 5: Verify TypeScript + start**
```bash
npx tsc --noEmit
npx expo start
```
Expected: App launches, navigates to login (no token yet), tabs visible at bottom.

- [ ] **Step 6: Commit**
```bash
git add app/
git commit -m "feat: add navigation shell, auth guard, tab layout, history placeholder"
```

---

## Task 8: Login screen + Whoop OAuth callback

**Files:**
- Create: `app/login.tsx`, `app/auth/callback.tsx`

- [ ] **Step 1: Create app/login.tsx**

```tsx
// app/login.tsx
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { colors, fonts } from '../lib/theme'
import { WHOOP_SCOPES, makeWhoopRedirectUri, getWhoopDiscovery, saveWhoopTokens } from '../lib/whoop'

const CLIENT_ID = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID!

export default function LoginScreen() {
  const redirectUri = makeWhoopRedirectUri()
  const discovery = getWhoopDiscovery()

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: WHOOP_SCOPES,
      redirectUri,
      usePKCE: true,
    },
    discovery
  )

  async function handleConnect() {
    const result = await promptAsync()
    if (result.type !== 'success') return
    // Exchange code for tokens
    const tokenRes = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: result.params.code,
        redirect_uri: redirectUri,
        code_verifier: request!.codeVerifier!,
      }).toString(),
    })
    if (!tokenRes.ok) return
    const tokens = await tokenRes.json()
    await saveWhoopTokens(tokens)
    router.replace('/(tabs)/dashboard')
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {/* Logo */}
        <View style={s.logoWrap}>
          <Text style={s.logo}>DIMER</Text>
          <Text style={s.tagline}>KNOW YOUR DEFICIT. OWN YOUR DAY.</Text>
        </View>

        {/* Decorative ring */}
        <View style={s.ringWrap}>
          <Svg width={130} height={130} viewBox="0 0 130 130" style={{ transform: [{ rotate: '-90deg' }] }}>
            <Defs>
              <LinearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={colors.ring.from} />
                <Stop offset="100%" stopColor={colors.ring.to} />
              </LinearGradient>
            </Defs>
            <Circle cx={65} cy={65} r={52} stroke={colors.cardBorder} strokeWidth={11} fill="none" />
            <Circle cx={65} cy={65} r={52} stroke="url(#lg)" strokeWidth={11} fill="none"
              strokeDasharray={327} strokeDashoffset={82} strokeLinecap="round" />
          </Svg>
          <View style={s.ringIcon}>
            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={1.5}>
              <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        </View>

        {/* Copy */}
        <View style={s.copy}>
          <Text style={s.heading}>Connect Your Whoop</Text>
          <Text style={s.body}>
            Dimer reads your daily burn from Whoop so you always know exactly how much room you have to eat.
          </Text>
        </View>

        {/* CTA */}
        <View style={s.ctaWrap}>
          <Pressable
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
            onPress={handleConnect}
            accessibilityLabel="Connect with Whoop"
          >
            <Text style={s.ctaText}>Connect with Whoop →</Text>
          </Pressable>
          <Text style={s.ctaSub}>Requires Whoop 4.0+ · OAuth 2.0 PKCE</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between', paddingBottom: 16 },
  logoWrap: { alignItems: 'center', paddingTop: 32 },
  logo: { fontFamily: fonts.display, fontSize: 44, color: colors.primary, letterSpacing: 4 },
  tagline: { fontFamily: fonts.label, fontSize: 11, color: colors.textDim, letterSpacing: 2, marginTop: 6 },
  ringWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative', height: 140 },
  ringIcon: { position: 'absolute' },
  copy: { gap: 10 },
  heading: { fontFamily: fonts.display, fontSize: 24, color: colors.text, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  ctaWrap: { gap: 10 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  ctaText: { fontFamily: fonts.labelSemiBold, fontSize: 14, color: colors.bg, letterSpacing: 1, textTransform: 'uppercase' },
  ctaSub: { fontFamily: fonts.label, fontSize: 11, color: colors.textDim, textAlign: 'center' },
})
```

- [ ] **Step 2: Create app/auth/callback.tsx**

```tsx
// app/auth/callback.tsx
// Deep link handler: dimer://auth/callback
// This screen is reached when Whoop redirects back after OAuth.
// expo-auth-session handles the code exchange in login.tsx via promptAsync(),
// so this screen just needs to complete the session and close the browser.
import { useEffect } from 'react'
import { View, Text } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { colors, fonts } from '../../lib/theme'

export default function AuthCallback() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession()
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.label, color: colors.textMuted }}>Completing sign-in…</Text>
    </View>
  )
}
```

- [ ] **Step 3: Test OAuth deep link on simulator**
```bash
npx uri-scheme open "dimer://auth/callback" --ios
```
Expected: App opens to callback screen briefly.

- [ ] **Step 4: TypeScript check**
```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**
```bash
git add app/login.tsx app/auth/
git commit -m "feat: add login screen and Whoop OAuth2 PKCE flow"
```

---

## Task 9: Hooks — useWhoopData, useFoodLog, useDeficit

**Files:**
- Create: `hooks/useWhoopData.ts`, `hooks/useFoodLog.ts`, `hooks/useDeficit.ts`

- [ ] **Step 1: Create hooks/useWhoopData.ts**

```ts
// hooks/useWhoopData.ts
import { useState, useEffect, useCallback } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { fetchTodayWhoopData } from '../lib/whoop'
import type { WhoopData } from '../lib/types'

interface State {
  data: WhoopData | null
  loading: boolean
  error: string | null
}

export function useWhoopData() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })

  const fetch = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetchTodayWhoopData()
      setState({ data, loading: false, error: null })
    } catch (e) {
      setState({ data: null, loading: false, error: String(e) })
    }
  }, [])

  // Fetch on mount and when app comes to foreground
  useEffect(() => {
    fetch()
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') fetch()
    })
    return () => sub.remove()
  }, [fetch])

  return { ...state, refetch: fetch }
}
```

- [ ] **Step 2: Create hooks/useFoodLog.ts**

```ts
// hooks/useFoodLog.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { FoodLog } from '../lib/types'

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

export function useFoodLog() {
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .eq('date', todayDate())
      .order('logged_at', { ascending: false })
    if (!error && data) setLogs(data as FoodLog[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLogs()

    const channel = supabase
      .channel('food_logs_today')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'food_logs',
        filter: `date=eq.${todayDate()}`,
      }, () => {
        fetchLogs()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchLogs])

  const totalCalories = logs.reduce((sum, l) => sum + l.calories, 0)

  async function deleteLog(id: string) {
    await supabase.from('food_logs').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  return { logs, loading, totalCalories, refetch: fetchLogs, deleteLog }
}
```

- [ ] **Step 3: Create hooks/useDeficit.ts — export computeDeficit for tests**

```ts
// hooks/useDeficit.ts
import type { FoodLog, DeficitState, MacroTotals } from '../lib/types'

// Pure function — exported for unit testing
export function computeDeficit(burned: number, logs: FoodLog[]): DeficitState {
  const consumed = logs.reduce((sum, l) => sum + l.calories, 0)
  const deficit = burned - consumed
  const pct = burned === 0 ? 0 : consumed / burned

  const macroTotals: MacroTotals = logs.reduce(
    (acc, l) => ({
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fats: acc.fats + l.fats,
      fiber: acc.fiber + l.fiber,
    }),
    { protein: 0, carbs: 0, fats: 0, fiber: 0 }
  )

  return { deficit, pct, isDeficit: deficit >= 0, macroTotals }
}

export function useDeficit(burned: number, logs: FoodLog[]): DeficitState {
  return computeDeficit(burned, logs)
}
```

- [ ] **Step 4: Run deficit tests — expect PASS now**
```bash
npx jest __tests__/deficit.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5: TypeScript check**
```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**
```bash
git add hooks/
git commit -m "feat: add useWhoopData, useFoodLog, useDeficit hooks"
```

---

## Task 10: Core UI components — DeficitRing, MacroBar, WhoopBadge

**Files:**
- Create: `components/DeficitRing.tsx`, `components/MacroBar.tsx`, `components/WhoopBadge.tsx`

- [ ] **Step 1: Create components/DeficitRing.tsx**

```tsx
// components/DeficitRing.tsx
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg'
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated'
import { useEffect } from 'react'
import { colors, fonts } from '../lib/theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const SIZE = 180
const STROKE = 14
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface Props {
  burned: number
  consumed: number
}

export function DeficitRing({ burned, consumed }: Props) {
  const pct = burned === 0 ? 0 : Math.min(consumed / burned, 1.5)
  const dashOffset = useSharedValue(CIRCUMFERENCE)

  useEffect(() => {
    const targetOffset = CIRCUMFERENCE * (1 - Math.min(pct, 1))
    dashOffset.value = withTiming(targetOffset, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    })
  }, [pct])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }))

  const deficit = burned - consumed
  const isDeficit = deficit >= 0
  const isNearLimit = pct >= 0.9 && pct < 1.0
  const isSurplus = pct >= 1.0

  const ringStroke = isSurplus
    ? colors.ringSurplus
    : isNearLimit
    ? colors.ringAmber
    : 'url(#ice-grad)'

  const valueColor = isSurplus ? colors.ringSurplus : isNearLimit ? colors.ringAmber : colors.primary

  return (
    <View style={s.container}>
      <Svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Defs>
          <LinearGradient id="ice-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={colors.ring.from} />
            <Stop offset="100%" stopColor={colors.ring.to} />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          stroke={colors.cardBorder} strokeWidth={STROKE} fill="none"
        />
        {/* Fill */}
        <AnimatedCircle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          stroke={ringStroke} strokeWidth={STROKE} fill="none"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={animatedProps}
          strokeLinecap="round"
        />
      </Svg>
      <View style={s.label}>
        <Text style={[s.labelText, { color: colors.textDim }]}>
          {isDeficit ? 'DEFICIT' : 'SURPLUS'}
        </Text>
        <Text style={[s.value, { color: valueColor }]}>
          {Math.abs(deficit).toLocaleString()}
        </Text>
        <Text style={[s.unit, { color: colors.textDim }]}>kcal</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', alignItems: 'center', gap: 2 },
  labelText: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  value: { fontFamily: fonts.mono, fontSize: 32, lineHeight: 36 },
  unit: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },
})
```

- [ ] **Step 2: Create components/MacroBar.tsx**

```tsx
// components/MacroBar.tsx
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useEffect } from 'react'
import { colors, fonts } from '../lib/theme'

interface Props {
  label: string
  grams: number
  maxGrams: number
  color: string
}

export function MacroBar({ label, grams, maxGrams, color }: Props) {
  const width = useSharedValue(0)

  useEffect(() => {
    const pct = maxGrams === 0 ? 0 : Math.min(grams / maxGrams, 1)
    width.value = withTiming(pct, { duration: 600 })
  }, [grams, maxGrams])

  const animStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }))

  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.track}>
        <Animated.View style={[s.fill, { backgroundColor: color }, animStyle]} />
      </View>
      <Text style={s.value}>{Math.round(grams)}g</Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: fonts.label, fontSize: 10, color: colors.textMuted, width: 50 },
  track: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  value: { fontFamily: fonts.mono, fontSize: 11, color: colors.text, width: 34, textAlign: 'right' },
})
```

- [ ] **Step 3: Create components/WhoopBadge.tsx**

```tsx
// components/WhoopBadge.tsx
import { View, Text, StyleSheet } from 'react-native'
import { colors, fonts } from '../lib/theme'

interface Props {
  strain: number | null
  recovery: number | null
}

export function WhoopBadge({ strain, recovery }: Props) {
  if (strain === null && recovery === null) return null
  return (
    <View style={s.row}>
      {strain !== null && (
        <View style={s.badge}>
          <View style={[s.dot, { backgroundColor: colors.primary }]} />
          <Text style={[s.text, { color: colors.primary }]}>{strain.toFixed(1)}</Text>
        </View>
      )}
      {recovery !== null && (
        <View style={s.badge}>
          <View style={[s.dot, { backgroundColor: colors.fiber }]} />
          <Text style={[s.text, { color: colors.fiber }]}>{Math.round(recovery)}%</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: fonts.mono, fontSize: 11 },
})
```

- [ ] **Step 4: TypeScript check**
```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**
```bash
git add components/DeficitRing.tsx components/MacroBar.tsx components/WhoopBadge.tsx
git commit -m "feat: add DeficitRing, MacroBar, WhoopBadge components"
```

---

---

## Task 11: Dashboard screen (hardcoded data)

**Files:**
- Create: `app/(tabs)/dashboard/index.tsx`, `components/GlassCard.tsx`

- [ ] **Step 1: Create components/GlassCard.tsx**

```tsx
// components/GlassCard.tsx
import { View, ViewStyle, StyleSheet } from 'react-native'
import { colors, radii } from '../lib/theme'

interface Props {
  children: React.ReactNode
  style?: ViewStyle
}

export function GlassCard({ children, style }: Props) {
  return <View style={[s.card, style]}>{children}</View>
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: 12,
  },
})
```

- [ ] **Step 2: Create app/(tabs)/dashboard/index.tsx with hardcoded data**

```tsx
// app/(tabs)/dashboard/index.tsx
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { DeficitRing } from '../../../components/DeficitRing'
import { MacroBar } from '../../../components/MacroBar'
import { WhoopBadge } from '../../../components/WhoopBadge'
import { GlassCard } from '../../../components/GlassCard'
import { colors, fonts, spacing } from '../../../lib/theme'

const HARDCODED = {
  burned: 2340,
  consumed: 1853,
  strain: 14.2,
  recovery: 82,
  macros: { protein: 142, carbs: 198, fats: 61, fiber: 18 },
  logs: [
    { id: '1', name: 'Grilled Chicken Breast', calories: 265, protein: 42, carbs: 0, fats: 7, fiber: 0 },
    { id: '2', name: 'Oatmeal + Banana', calories: 310, protein: 8, carbs: 64, fats: 4, fiber: 6 },
    { id: '3', name: 'Chipotle Burrito Bowl', calories: 740, protein: 52, carbs: 82, fats: 24, fiber: 12 },
  ],
}

const MACRO_TARGETS = { protein: 200, carbs: 250, fats: 80, fiber: 30 }

export default function DashboardScreen() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.day}>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</Text>
            <Text style={s.date}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</Text>
          </View>
          <WhoopBadge strain={HARDCODED.strain} recovery={HARDCODED.recovery} />
        </View>

        {/* Ring */}
        <View style={s.ringWrap}>
          <DeficitRing burned={HARDCODED.burned} consumed={HARDCODED.consumed} />
          <View style={s.burnConsumed}>
            <View style={s.bcItem}>
              <Text style={s.bcLabel}>BURNED</Text>
              <Text style={s.bcValue}>{HARDCODED.burned.toLocaleString()}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.bcItem}>
              <Text style={s.bcLabel}>EATEN</Text>
              <Text style={s.bcValue}>{HARDCODED.consumed.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Macros */}
        <GlassCard style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: 8 }}>
          <Text style={s.sectionTitle}>MACROS</Text>
          <MacroBar label="Protein" grams={HARDCODED.macros.protein} maxGrams={MACRO_TARGETS.protein} color={colors.protein} />
          <MacroBar label="Carbs" grams={HARDCODED.macros.carbs} maxGrams={MACRO_TARGETS.carbs} color={colors.carbs} />
          <MacroBar label="Fat" grams={HARDCODED.macros.fats} maxGrams={MACRO_TARGETS.fats} color={colors.fat} />
          <MacroBar label="Fiber" grams={HARDCODED.macros.fiber} maxGrams={MACRO_TARGETS.fiber} color={colors.fiber} />
        </GlassCard>

        {/* Food log */}
        <View style={s.logHeader}>
          <Text style={s.sectionTitle}>TODAY'S LOG</Text>
          <Text style={s.logTotal}>{HARDCODED.consumed.toLocaleString()} kcal</Text>
        </View>

        {HARDCODED.logs.map((log) => (
          <GlassCard key={log.id} style={s.logItem}>
            <View style={s.logItemInner}>
              <View style={[s.logIcon, { backgroundColor: `${colors.primary}15` }]}>
                <View style={[s.logDot, { backgroundColor: colors.primary }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.logName}>{log.name}</Text>
                <Text style={s.logMeta}>P {log.protein}g · C {log.carbs}g · F {log.fats}g · Fi {log.fiber}g</Text>
              </View>
              <Text style={s.logKcal}>{log.calories}</Text>
            </View>
          </GlassCard>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [s.fab, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        onPress={() => {}}
        accessibilityLabel="Add food"
      >
        <Text style={s.fabIcon}>+</Text>
      </Pressable>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  day: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  date: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim, letterSpacing: 1.5, marginTop: 2 },
  ringWrap: { alignItems: 'center', paddingBottom: spacing.lg },
  burnConsumed: { flexDirection: 'row', gap: 24, marginTop: spacing.sm },
  bcItem: { alignItems: 'center' },
  bcLabel: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1.5, textTransform: 'uppercase' },
  bcValue: { fontFamily: fonts.mono, fontSize: 20, color: colors.text, marginTop: 2 },
  divider: { width: 1, backgroundColor: colors.cardBorder, marginVertical: 4 },
  sectionTitle: { fontFamily: fonts.labelSemiBold, fontSize: 9, color: colors.textDim, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  logTotal: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  logItem: { marginHorizontal: spacing.md, marginBottom: 5, padding: 10 },
  logItemInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  logMeta: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, marginTop: 1 },
  logKcal: { fontFamily: fonts.mono, fontSize: 13, color: colors.primary },
  fab: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
  fabIcon: { fontFamily: fonts.body, fontSize: 26, color: colors.bg, lineHeight: 30 },
})
```

- [ ] **Step 3: Start dev server and verify dashboard renders**
```bash
npx expo start
```
Expected: Dashboard shows ring, macro bars, hardcoded food log, FAB. Ring animates on mount.

- [ ] **Step 4: Commit**
```bash
git add app/(tabs)/dashboard/ components/GlassCard.tsx
git commit -m "feat: add dashboard screen with hardcoded data"
```

---

## Task 12: Wire live Whoop + food log data to dashboard

**Files:**
- Modify: `app/(tabs)/dashboard/index.tsx`

- [ ] **Step 1: Replace hardcoded data with live hooks**

Replace the entire `DashboardScreen` component body (keep imports and styles):

```tsx
// app/(tabs)/dashboard/index.tsx — updated imports section
import { useRef, useCallback } from 'react'
import { useWhoopData } from '../../../hooks/useWhoopData'
import { useFoodLog } from '../../../hooks/useFoodLog'
import { useDeficit } from '../../../hooks/useDeficit'
import type { FoodLog } from '../../../lib/types'
import { AddFoodSheet } from '../../../components/AddFoodSheet'
import type BottomSheet from '@gorhom/bottom-sheet'
```

Replace the hardcoded constants with:
```tsx
export default function DashboardScreen() {
  const sheetRef = useRef<BottomSheet>(null)
  const { data: whoopData, loading: whoopLoading } = useWhoopData()
  const { logs, totalCalories } = useFoodLog()
  const deficit = useDeficit(whoopData?.burned ?? 0, logs)

  const burned = whoopData?.burned ?? 0
  const consumed = totalCalories

  const openSheet = useCallback(() => sheetRef.current?.expand(), [])

  // ... rest of JSX unchanged except:
  // - Replace HARDCODED.burned → burned
  // - Replace HARDCODED.consumed → consumed
  // - Replace HARDCODED.strain → whoopData?.strain ?? null
  // - Replace HARDCODED.recovery → whoopData?.recovery ?? null
  // - Replace HARDCODED.macros.protein → deficit.macroTotals.protein  (etc)
  // - Replace HARDCODED.logs → logs  (FoodLog[])
  // - Replace onPress={() => {}} on FAB → onPress={openSheet}
  // - Add <AddFoodSheet ref={sheetRef} /> at bottom of SafeAreaView
```

Full updated return (replace previous return statement):
```tsx
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View>
            <Text style={s.day}>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</Text>
            <Text style={s.date}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</Text>
          </View>
          <WhoopBadge strain={whoopData?.strain ?? null} recovery={whoopData?.recovery ?? null} />
        </View>

        <View style={s.ringWrap}>
          <DeficitRing burned={burned} consumed={consumed} />
          <View style={s.burnConsumed}>
            <View style={s.bcItem}>
              <Text style={s.bcLabel}>BURNED</Text>
              <Text style={s.bcValue}>{burned.toLocaleString()}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.bcItem}>
              <Text style={s.bcLabel}>EATEN</Text>
              <Text style={s.bcValue}>{consumed.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        <GlassCard style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: 8 }}>
          <Text style={s.sectionTitle}>MACROS</Text>
          <MacroBar label="Protein" grams={deficit.macroTotals.protein} maxGrams={200} color={colors.protein} />
          <MacroBar label="Carbs"   grams={deficit.macroTotals.carbs}   maxGrams={250} color={colors.carbs} />
          <MacroBar label="Fat"     grams={deficit.macroTotals.fats}    maxGrams={80}  color={colors.fat} />
          <MacroBar label="Fiber"   grams={deficit.macroTotals.fiber}   maxGrams={30}  color={colors.fiber} />
        </GlassCard>

        <View style={s.logHeader}>
          <Text style={s.sectionTitle}>TODAY'S LOG</Text>
          <Text style={s.logTotal}>{consumed.toLocaleString()} kcal</Text>
        </View>

        {logs.map((log: FoodLog) => (
          <GlassCard key={log.id} style={s.logItem}>
            <View style={s.logItemInner}>
              <View style={[s.logIcon, { backgroundColor: `${colors.primary}15` }]}>
                <View style={[s.logDot, { backgroundColor: colors.primary }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.logName}>{log.name}</Text>
                <Text style={s.logMeta}>P {log.protein}g · C {log.carbs}g · F {log.fats}g · Fi {log.fiber}g</Text>
              </View>
              <Text style={s.logKcal}>{log.calories}</Text>
            </View>
          </GlassCard>
        ))}

        {logs.length === 0 && !whoopLoading && (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ fontFamily: fonts.label, color: colors.textDim, fontSize: 13 }}>
              No food logged yet. Tap + to add.
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [s.fab, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        onPress={openSheet}
        accessibilityLabel="Add food"
      >
        <Text style={s.fabIcon}>+</Text>
      </Pressable>

      <AddFoodSheet ref={sheetRef} />
    </SafeAreaView>
  )
```

- [ ] **Step 2: TypeScript check**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add app/(tabs)/dashboard/index.tsx
git commit -m "feat: wire live Whoop + food log data to dashboard"
```

---

## Task 13: AddFoodSheet scaffold + PhotoInput

**Files:**
- Create: `components/AddFoodSheet.tsx`, `components/PhotoInput.tsx`

- [ ] **Step 1: Create components/AddFoodSheet.tsx**

```tsx
// components/AddFoodSheet.tsx
import { forwardRef, useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import BottomSheet, { BottomSheetView, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { colors, fonts, radii } from '../lib/theme'
import { PhotoInput } from './PhotoInput'
import { TextFoodInput } from './TextFoodInput'
import { RestaurantSearch } from './RestaurantSearch'
import { BarcodeInput } from './BarcodeInput'
import type { FoodResult } from '../lib/types'

type Tab = 'photo' | 'text' | 'restaurant' | 'barcode'

const TABS: { id: Tab; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'text', label: 'Text' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'barcode', label: 'Barcode' },
]

export const AddFoodSheet = forwardRef<BottomSheet>((_, ref) => {
  const [activeTab, setActiveTab] = useState<Tab>('photo')
  const [pendingResult, setPendingResult] = useState<FoodResult | null>(null)

  const handleResult = useCallback((result: FoodResult) => {
    setPendingResult(result)
  }, [])

  const handleClose = useCallback(() => {
    setPendingResult(null)
    ;(ref as React.RefObject<BottomSheet>).current?.close()
  }, [ref])

  const handleSaved = useCallback(() => {
    setPendingResult(null)
    ;(ref as React.RefObject<BottomSheet>).current?.close()
  }, [ref])

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['75%', '92%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.sheet }}
      handleIndicatorStyle={{ backgroundColor: colors.cardBorder, width: 36 }}
    >
      <BottomSheetScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Log Food</Text>

        {/* Tab bar */}
        <View style={s.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              style={[s.tab, activeTab === tab.id && s.tabActive]}
              onPress={() => setActiveTab(tab.id)}
              accessibilityLabel={tab.label}
            >
              <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Tab content */}
        {activeTab === 'photo' && <PhotoInput onResult={handleResult} />}
        {activeTab === 'text' && <TextFoodInput onResult={handleResult} />}
        {activeTab === 'restaurant' && <RestaurantSearch onResult={handleResult} />}
        {activeTab === 'barcode' && <BarcodeInput onResult={handleResult} />}
      </BottomSheetScrollView>
    </BottomSheet>
  )
})

AddFoodSheet.displayName = 'AddFoodSheet'

const s = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: 'center', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.sheetBorder, marginBottom: 12 },
  tabBar: { flexDirection: 'row', backgroundColor: `${colors.primary}08`, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 3, gap: 2, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: `${colors.primary}15`, borderWidth: 1, borderColor: `${colors.primary}20` },
  tabText: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabTextActive: { color: colors.primary },
})
```

- [ ] **Step 2: Create components/PhotoInput.tsx**

```tsx
// components/PhotoInput.tsx
import { useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import Svg, { Path, Circle } from 'react-native-svg'
import { analyzeFood } from '../lib/api'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

async function compressForAPI(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  return result.base64!
}

export function PhotoInput({ onResult }: Props) {
  const [loading, setLoading] = useState(false)

  async function pickAndAnalyze(fromCamera: boolean) {
    const fn = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync
    const result = await fn({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 })
    if (result.canceled || !result.assets[0]) return

    setLoading(true)
    try {
      const base64 = await compressForAPI(result.assets[0].uri)
      const food = await analyzeFood({ mode: 'photo', data: base64 })
      onResult(food)
    } catch (e) {
      Alert.alert('Could not analyze photo', 'Try a clearer photo or use text entry.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.container}>
      <Pressable style={[s.zone, loading && { opacity: 0.5 }]} onPress={() => pickAndAnalyze(false)} disabled={loading}>
        <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth={1.5}>
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={12} cy={13} r={4} />
        </Svg>
        {loading
          ? <ActivityIndicator color={colors.primary} />
          : <Text style={s.hint}>Tap to <Text style={{ color: colors.primary }}>choose from library</Text></Text>
        }
      </Pressable>

      <View style={s.actions}>
        <Pressable style={({ pressed }) => [s.btnSecondary, pressed && { opacity: 0.7 }]} onPress={() => pickAndAnalyze(true)} disabled={loading}>
          <Text style={s.btnSecText}>Open Camera</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.85 }]} onPress={() => pickAndAnalyze(false)} disabled={loading}>
          <Text style={s.btnPriText}>Choose Photo →</Text>
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 12 },
  zone: { backgroundColor: `${colors.primary}05`, borderWidth: 1, borderStyle: 'dashed', borderColor: `${colors.primary}18`, borderRadius: radii.lg, height: 130, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hint: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim },
  actions: { flexDirection: 'row', gap: 8 },
  btnSecondary: { flex: 1, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, alignItems: 'center' },
  btnSecText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  btnPrimary: { flex: 1.5, padding: 13, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center' },
  btnPriText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
})
```

- [ ] **Step 3: Create stub components so AddFoodSheet compiles**

Create these three stub files (full implementation in Tasks 15–17):

```tsx
// components/TextFoodInput.tsx
import { View, Text } from 'react-native'
import { colors, fonts } from '../lib/theme'
import type { FoodResult } from '../lib/types'
export function TextFoodInput({ onResult: _ }: { onResult: (r: FoodResult) => void }) {
  return <View style={{ padding: 20 }}><Text style={{ fontFamily: fonts.label, color: colors.textDim }}>Text input — coming in Task 15</Text></View>
}
```

```tsx
// components/RestaurantSearch.tsx
import { View, Text } from 'react-native'
import { colors, fonts } from '../lib/theme'
import type { FoodResult } from '../lib/types'
export function RestaurantSearch({ onResult: _ }: { onResult: (r: FoodResult) => void }) {
  return <View style={{ padding: 20 }}><Text style={{ fontFamily: fonts.label, color: colors.textDim }}>Restaurant search — coming in Task 16</Text></View>
}
```

```tsx
// components/BarcodeInput.tsx
import { View, Text } from 'react-native'
import { colors, fonts } from '../lib/theme'
import type { FoodResult } from '../lib/types'
export function BarcodeInput({ onResult: _ }: { onResult: (r: FoodResult) => void }) {
  return <View style={{ padding: 20 }}><Text style={{ fontFamily: fonts.label, color: colors.textDim }}>Barcode scanner — coming in Task 17</Text></View>
}
```

- [ ] **Step 4: TypeScript check**
```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**
```bash
git add components/
git commit -m "feat: add AddFoodSheet scaffold and PhotoInput tab"
```

---

## Task 14: ConfirmFoodCard + save to Supabase

**Files:**
- Create: `components/ConfirmFoodCard.tsx`
- Modify: `components/AddFoodSheet.tsx`

- [ ] **Step 1: Write failing test for scaleByServing**

```ts
// __tests__/serving.test.ts
import { scaleByServing } from '../components/ConfirmFoodCard'

describe('scaleByServing', () => {
  it('scales macros proportionally', () => {
    const base = { calories: 300, protein: 30, carbs: 40, fats: 10, fiber: 5 }
    const result = scaleByServing(base, 150, 100) // 150g instead of 100g
    expect(result.calories).toBeCloseTo(450)
    expect(result.protein).toBeCloseTo(45)
    expect(result.fiber).toBeCloseTo(7.5)
  })

  it('handles zero originalGrams gracefully', () => {
    const base = { calories: 300, protein: 30, carbs: 40, fats: 10, fiber: 5 }
    const result = scaleByServing(base, 100, 0)
    expect(result.calories).toBe(300) // unchanged
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npx jest __tests__/serving.test.ts
```

- [ ] **Step 3: Create components/ConfirmFoodCard.tsx**

```tsx
// components/ConfirmFoodCard.tsx
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import { supabase } from '../lib/supabase'
import { colors, fonts, radii, spacing } from '../lib/theme'
import { GlassCard } from './GlassCard'
import type { FoodResult, FoodLog } from '../lib/types'

// Exported for unit testing
export function scaleByServing(
  base: Pick<FoodResult, 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber'>,
  newGrams: number,
  originalGrams: number
): typeof base {
  if (originalGrams === 0) return base
  const ratio = newGrams / originalGrams
  return {
    calories: Math.round(base.calories * ratio),
    protein: Math.round(base.protein * ratio * 10) / 10,
    carbs: Math.round(base.carbs * ratio * 10) / 10,
    fats: Math.round(base.fats * ratio * 10) / 10,
    fiber: Math.round(base.fiber * ratio * 10) / 10,
  }
}

interface Props {
  result: FoodResult
  inputMethod: 'photo' | 'text' | 'restaurant' | 'barcode'
  onSaved: () => void
  onRetake: () => void
}

interface EditableFields {
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
}

export function ConfirmFoodCard({ result, inputMethod, onSaved, onRetake }: Props) {
  const DEFAULT_GRAMS = 100
  const [servingGrams, setServingGrams] = useState(DEFAULT_GRAMS)
  const [fields, setFields] = useState<EditableFields>({
    name: result.name,
    calories: result.calories,
    protein: result.protein,
    carbs: result.carbs,
    fats: result.fats,
    fiber: result.fiber,
  })
  const [saving, setSaving] = useState(false)

  function changeServing(delta: number) {
    const next = Math.max(10, servingGrams + delta)
    const scaled = scaleByServing(fields, next, servingGrams)
    setServingGrams(next)
    setFields(f => ({ ...f, ...scaled }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('food_logs').insert({
        date: today,
        source: inputMethod,
        name: fields.name,
        calories: fields.calories,
        protein: fields.protein,
        carbs: fields.carbs,
        fats: fields.fats,
        fiber: fields.fiber,
        raw_response: result as unknown as Record<string, unknown>,
      })
      if (error) throw error

      // Upsert daily_summaries consumed total
      const { data: existing } = await supabase
        .from('daily_summaries')
        .select('calories_consumed')
        .eq('date', today)
        .single()

      await supabase.from('daily_summaries').upsert({
        date: today,
        calories_consumed: (existing?.calories_consumed ?? 0) + fields.calories,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' })

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onSaved()
    } catch (e) {
      Alert.alert('Failed to save', 'Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const MACRO_ITEMS: { key: keyof EditableFields; label: string; color: string }[] = [
    { key: 'protein', label: 'Protein', color: colors.protein },
    { key: 'carbs',   label: 'Carbs',   color: colors.carbs },
    { key: 'fats',    label: 'Fat',     color: colors.fat },
    { key: 'fiber',   label: 'Fiber',   color: colors.fiber },
  ]

  return (
    <View style={s.container}>
      {/* Dish name + calories */}
      <GlassCard style={s.headerCard}>
        <TextInput
          style={s.nameInput}
          value={fields.name}
          onChangeText={(v) => setFields(f => ({ ...f, name: v }))}
          placeholderTextColor={colors.textDim}
        />
        <View style={s.kcalRow}>
          <TextInput
            style={s.kcalInput}
            value={String(fields.calories)}
            keyboardType="numeric"
            onChangeText={(v) => setFields(f => ({ ...f, calories: Number(v) || 0 }))}
            placeholderTextColor={colors.textDim}
          />
          <Text style={s.kcalUnit}>kcal</Text>
        </View>
        <Text style={s.sourceBadge}>{result.source.toUpperCase()} · {(result.confidence ?? 'unknown').toUpperCase()} CONFIDENCE</Text>
      </GlassCard>

      {/* Macros grid */}
      <GlassCard>
        <View style={s.macroGrid}>
          {MACRO_ITEMS.map(({ key, label, color }) => (
            <View key={key} style={s.macroItem}>
              <Text style={s.macroLabel}>{label}</Text>
              <TextInput
                style={[s.macroValue, { color }]}
                value={String(fields[key])}
                keyboardType="decimal-pad"
                onChangeText={(v) => setFields(f => ({ ...f, [key]: Number(v) || 0 }))}
                placeholderTextColor={colors.textDim}
              />
              <Text style={s.macroUnit}>g</Text>
            </View>
          ))}
        </View>
      </GlassCard>

      {/* Serving size */}
      <GlassCard>
        <View style={s.servingRow}>
          <View>
            <Text style={s.servingLabel}>SERVING SIZE</Text>
            <Text style={s.servingValue}>{servingGrams}g</Text>
          </View>
          <View style={s.servingButtons}>
            {[-25, -10, +10, +25].map((delta) => (
              <Pressable
                key={delta}
                style={({ pressed }) => [s.servingBtn, pressed && { opacity: 0.7 }]}
                onPress={() => changeServing(delta)}
              >
                <Text style={s.servingBtnText}>{delta > 0 ? `+${delta}` : delta}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </GlassCard>

      {result.notes && (
        <GlassCard style={s.noteCard}>
          <Text style={s.noteText}>{result.notes}</Text>
        </GlassCard>
      )}

      {/* Action buttons */}
      <View style={s.actions}>
        <Pressable style={({ pressed }) => [s.retakeBtn, pressed && { opacity: 0.7 }]} onPress={onRetake}>
          <Text style={s.retakeText}>Retake</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={s.saveText}>{saving ? 'Saving…' : 'Save to Log →'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 10 },
  headerCard: { gap: 4 },
  nameInput: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text, padding: 0 },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  kcalInput: { fontFamily: fonts.mono, fontSize: 28, color: colors.primary, padding: 0 },
  kcalUnit: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim },
  sourceBadge: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1, marginTop: 4 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  macroItem: { flex: 1, minWidth: '40%', gap: 2 },
  macroLabel: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1.5, textTransform: 'uppercase' },
  macroValue: { fontFamily: fonts.mono, fontSize: 18, padding: 0 },
  macroUnit: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim },
  servingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  servingLabel: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1.5, textTransform: 'uppercase' },
  servingValue: { fontFamily: fonts.mono, fontSize: 18, color: colors.text, marginTop: 2 },
  servingButtons: { flexDirection: 'row', gap: 6 },
  servingBtn: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: `${colors.primary}10`, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  servingBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.primary },
  noteCard: { backgroundColor: `${colors.carbs}08`, borderColor: `${colors.carbs}15` },
  noteText: { fontFamily: fonts.body, fontSize: 11, color: colors.carbs, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  retakeBtn: { flex: 0.6, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, alignItems: 'center' },
  retakeText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  saveBtn: { flex: 1.4, padding: 13, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 },
  saveText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
})
```

- [ ] **Step 4: Wire ConfirmFoodCard into AddFoodSheet**

In `components/AddFoodSheet.tsx`, add the import and conditionally render the card when `pendingResult` is set:

```tsx
// Add import
import { ConfirmFoodCard } from './ConfirmFoodCard'

// Inside BottomSheetScrollView, before the tab content block:
{pendingResult ? (
  <ConfirmFoodCard
    result={pendingResult}
    inputMethod={activeTab as 'photo' | 'text' | 'restaurant' | 'barcode'}
    onSaved={handleSaved}
    onRetake={() => setPendingResult(null)}
  />
) : (
  <>
    {activeTab === 'photo' && <PhotoInput onResult={handleResult} />}
    {activeTab === 'text' && <TextFoodInput onResult={handleResult} />}
    {activeTab === 'restaurant' && <RestaurantSearch onResult={handleResult} />}
    {activeTab === 'barcode' && <BarcodeInput onResult={handleResult} />}
  </>
)}
```

- [ ] **Step 5: Run serving tests — expect PASS**
```bash
npx jest __tests__/serving.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 6: TypeScript check**
```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**
```bash
git add components/ConfirmFoodCard.tsx components/AddFoodSheet.tsx __tests__/serving.test.ts
git commit -m "feat: add ConfirmFoodCard with serving size scaling and Supabase save"
```

---

## Task 15: TextFoodInput tab

**Files:**
- Modify: `components/TextFoodInput.tsx`

- [ ] **Step 1: Replace stub with full implementation**

```tsx
// components/TextFoodInput.tsx
import { useState } from 'react'
import { View, TextInput, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { analyzeFood } from '../lib/api'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

export function TextFoodInput({ onResult }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAnalyze() {
    if (!text.trim()) return
    setLoading(true)
    try {
      const result = await analyzeFood({ mode: 'text', data: text.trim() })
      onResult(result)
    } catch {
      Alert.alert('Could not analyze', 'Try being more specific, e.g. "200g grilled salmon".')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.container}>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={setText}
        placeholder={'e.g. "200g grilled chicken breast" or "large bowl of oatmeal"'}
        placeholderTextColor={colors.textDim}
        multiline
        autoFocus
        returnKeyType="done"
      />
      <Text style={s.hint}>Include weight for more accurate results</Text>
      <Pressable
        style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }, (!text.trim() || loading) && { opacity: 0.5 }]}
        onPress={handleAnalyze}
        disabled={!text.trim() || loading}
      >
        {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnText}>Analyze →</Text>}
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 10 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: { fontFamily: fonts.label, fontSize: 11, color: colors.textDim },
  btn: { padding: 14, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center' },
  btnText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
})
```

- [ ] **Step 2: TypeScript check + commit**
```bash
npx tsc --noEmit
git add components/TextFoodInput.tsx
git commit -m "feat: implement TextFoodInput tab"
```

---

## Task 16: RestaurantSearch tab

**Files:**
- Modify: `components/RestaurantSearch.tsx`

- [ ] **Step 1: Replace stub with full implementation**

```tsx
// components/RestaurantSearch.tsx
import { useState } from 'react'
import { View, TextInput, Text, FlatList, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { searchRestaurant, getRestaurantItem } from '../lib/api'
import { colors, fonts, radii } from '../lib/theme'
import { GlassCard } from './GlassCard'
import type { FoodResult, RestaurantResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

export function RestaurantSearch({ onResult }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RestaurantResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selecting, setSelecting] = useState<number | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const items = await searchRestaurant(query.trim())
      setResults(items)
    } catch (e) {
      if (String(e).includes('quota_exceeded')) {
        Alert.alert('Daily limit reached', 'Spoonacular free tier: 150 searches/day. Try tomorrow or use text entry.')
      } else {
        Alert.alert('Search failed', 'Check your connection and try again.')
      }
    } finally {
      setSearching(false)
    }
  }

  async function handleSelect(item: RestaurantResult) {
    setSelecting(item.id)
    try {
      const detail = await getRestaurantItem(item.id)
      onResult({ ...detail, name: item.name })
    } catch {
      // Fall back to search result data
      onResult({
        name: item.name,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fats: item.fats,
        fiber: item.fiber,
        ingredients: [],
        source: 'spoonacular',
        confidence: 'high',
      })
    } finally {
      setSelecting(null)
    }
  }

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. McDonald's Big Mac"
          placeholderTextColor={colors.textDim}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
        <Pressable style={({ pressed }) => [s.searchBtn, pressed && { opacity: 0.85 }]} onPress={handleSearch}>
          {searching ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={s.searchBtnText}>Go</Text>}
        </Pressable>
      </View>

      {results.map((item) => (
        <GlassCard key={item.id} style={s.resultCard}>
          <Pressable onPress={() => handleSelect(item)} disabled={selecting === item.id} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <View style={s.resultHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.resultName}>{item.name}</Text>
                {item.restaurant ? <Text style={s.resultRest}>{item.restaurant}</Text> : null}
              </View>
              {selecting === item.id
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={s.resultKcal}>{item.calories} kcal</Text>
              }
            </View>
            <Text style={s.resultMacros}>P {item.protein}g · C {item.carbs}g · F {item.fats}g · Fi {item.fiber}g</Text>
          </Pressable>
        </GlassCard>
      ))}

      {results.length === 0 && !searching && query.length > 0 && (
        <Text style={s.empty}>No results. Try a different search term.</Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 8 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 13, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  searchBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontFamily: fonts.labelSemiBold, fontSize: 13, color: colors.bg },
  resultCard: { padding: 12 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  resultName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  resultRest: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim, marginTop: 1 },
  resultKcal: { fontFamily: fonts.mono, fontSize: 14, color: colors.primary },
  resultMacros: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim },
  empty: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim, textAlign: 'center', paddingVertical: 16 },
})
```

- [ ] **Step 2: TypeScript check + commit**
```bash
npx tsc --noEmit
git add components/RestaurantSearch.tsx
git commit -m "feat: implement RestaurantSearch tab"
```

---

## Task 17: BarcodeInput + Open Food Facts

**Files:**
- Modify: `components/BarcodeInput.tsx`

- [ ] **Step 1: Replace stub with full implementation**

```tsx
// components/BarcodeInput.tsx
import { useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { BarCodeScanner, BarCodeScannerResult } from 'expo-barcode-scanner'
import { fetchByBarcode } from '../lib/openfoodfacts'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

export function BarcodeInput({ onResult }: Props) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanned, setScanned] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)

  async function requestPermission() {
    const { status } = await BarCodeScanner.requestPermissionsAsync()
    setHasPermission(status === 'granted')
    if (status === 'granted') setScanning(true)
  }

  async function handleScan({ data }: BarCodeScannerResult) {
    if (scanned || loading) return
    setScanned(true)
    setLoading(true)
    try {
      const result = await fetchByBarcode(data)
      if (!result) {
        Alert.alert('Product not found', 'This barcode isn\'t in Open Food Facts. Try text entry instead.', [
          { text: 'OK', onPress: () => { setScanned(false); setLoading(false) } },
        ])
        return
      }
      onResult(result)
    } catch {
      Alert.alert('Scan failed', 'Check your connection and try again.')
      setScanned(false)
    } finally {
      setLoading(false)
    }
  }

  if (!scanning) {
    return (
      <View style={s.container}>
        <Text style={s.hint}>Scan a product barcode to get nutrition data from Open Food Facts (free, no API key).</Text>
        <Pressable style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]} onPress={requestPermission}>
          <Text style={s.btnText}>Open Scanner →</Text>
        </Pressable>
        {hasPermission === false && (
          <Text style={s.warning}>Camera permission denied. Enable it in Settings → Dimer.</Text>
        )}
      </View>
    )
  }

  return (
    <View style={s.scannerWrap}>
      <BarCodeScanner onBarCodeScanned={handleScan} style={StyleSheet.absoluteFillObject} />
      {loading && (
        <View style={s.overlay}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={s.overlayText}>Looking up barcode…</Text>
        </View>
      )}
      <View style={s.frame} />
      <Pressable style={s.cancelBtn} onPress={() => setScanning(false)}>
        <Text style={s.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 12, padding: 4 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  btn: { padding: 14, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center' },
  btnText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
  warning: { fontFamily: fonts.label, fontSize: 11, color: colors.danger, textAlign: 'center' },
  scannerWrap: { height: 300, borderRadius: radii.lg, overflow: 'hidden', position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,11,20,0.7)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  overlayText: { fontFamily: fonts.label, fontSize: 13, color: colors.text },
  frame: { position: 'absolute', width: 200, height: 120, borderWidth: 2, borderColor: colors.primary, borderRadius: 8, top: '50%', left: '50%', transform: [{ translateX: -100 }, { translateY: -60 }] },
  cancelBtn: { position: 'absolute', bottom: 12, alignSelf: 'center', padding: 10, backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder },
  cancelText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.textMuted },
})
```

- [ ] **Step 2: Note — barcode scanner requires a dev build**

`expo-barcode-scanner` does not work in Expo Go. After completing Task 20 (EAS), install the dev build on device to test this tab.

- [ ] **Step 3: TypeScript check + commit**
```bash
npx tsc --noEmit
git add components/BarcodeInput.tsx
git commit -m "feat: implement BarcodeInput with Open Food Facts lookup"
```

---

## Task 18: Log screen + FoodLogItem with swipe-to-delete

**Files:**
- Create: `components/FoodLogItem.tsx`, `app/(tabs)/log/index.tsx`

- [ ] **Step 1: Create components/FoodLogItem.tsx**

```tsx
// components/FoodLogItem.tsx
import { useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import { colors, fonts, radii, macroColors } from '../lib/theme'
import type { FoodLog } from '../lib/types'

const SOURCE_COLORS: Record<FoodLog['source'], string> = {
  photo: colors.protein,
  text: colors.carbs,
  restaurant: colors.fat,
  barcode: colors.fiber,
}

interface Props {
  log: FoodLog
  onDelete: (id: string) => void
}

export function FoodLogItem({ log, onDelete }: Props) {
  const swipeRef = useRef<Swipeable>(null)

  function handleDelete() {
    Alert.alert('Delete entry?', log.name, [
      { text: 'Cancel', onPress: () => swipeRef.current?.close() },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          onDelete(log.id)
        },
      },
    ])
  }

  function renderRightActions() {
    return (
      <Pressable style={s.deleteAction} onPress={handleDelete}>
        <Text style={s.deleteText}>Delete</Text>
      </Pressable>
    )
  }

  const accentColor = SOURCE_COLORS[log.source]
  const time = new Date(log.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
      <View style={s.container}>
        <View style={[s.accent, { backgroundColor: accentColor }]} />
        <View style={[s.iconWrap, { backgroundColor: `${accentColor}15` }]}>
          <View style={[s.iconDot, { backgroundColor: accentColor }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{log.name}</Text>
          <Text style={s.meta}>
            P {log.protein}g · C {log.carbs}g · F {log.fats}g · Fi {log.fiber}g · {time}
          </Text>
        </View>
        <Text style={[s.kcal, { color: accentColor }]}>{log.calories}</Text>
      </View>
    </Swipeable>
  )
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: 10,
    marginHorizontal: 14,
    marginBottom: 5,
  },
  accent: { width: 2, height: '80%', borderRadius: 1, alignSelf: 'center' },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconDot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  meta: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, marginTop: 1 },
  kcal: { fontFamily: fonts.mono, fontSize: 14 },
  deleteAction: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: radii.md,
    marginLeft: 6,
    marginBottom: 5,
    marginRight: 14,
  },
  deleteText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
})
```

- [ ] **Step 2: Create app/(tabs)/log/index.tsx**

```tsx
// app/(tabs)/log/index.tsx
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFoodLog } from '../../../hooks/useFoodLog'
import { FoodLogItem } from '../../../components/FoodLogItem'
import { colors, fonts, spacing } from '../../../lib/theme'

export default function LogScreen() {
  const { logs, loading, totalCalories, refetch, deleteLog } = useFoodLog()

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Today's Log</Text>
        <Text style={s.total}>{totalCalories.toLocaleString()} kcal</Text>
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      >
        {logs.map((log) => (
          <FoodLogItem key={log.id} log={log} onDelete={deleteLog} />
        ))}
        {logs.length === 0 && !loading && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No food logged today.</Text>
            <Text style={s.emptyHint}>Use the + button on the Dashboard to add.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  total: { fontFamily: fonts.mono, fontSize: 16, color: colors.primary },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textMuted },
  emptyHint: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim },
})
```

- [ ] **Step 3: TypeScript check**
```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**
```bash
git add components/FoodLogItem.tsx app/(tabs)/log/
git commit -m "feat: add Log screen and swipe-to-delete FoodLogItem"
```

---

## Task 19: Haptic feedback on key interactions

**Files:**
- Modify: `components/AddFoodSheet.tsx`, `app/(tabs)/dashboard/index.tsx`

- [ ] **Step 1: Add haptics to FAB press**

In `app/(tabs)/dashboard/index.tsx`, update the FAB `onPress`:
```tsx
import * as Haptics from 'expo-haptics'

// FAB onPress:
onPress={async () => {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  openSheet()
}}
```

- [ ] **Step 2: Add haptics to tab switches in AddFoodSheet**

In `components/AddFoodSheet.tsx`, update the tab `onPress`:
```tsx
import * as Haptics from 'expo-haptics'

// Tab onPress:
onPress={async () => {
  await Haptics.selectionAsync()
  setActiveTab(tab.id)
}}
```

- [ ] **Step 3: Haptics on save are already in ConfirmFoodCard (Task 14)**

Verify `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` is present in `handleSave`.

- [ ] **Step 4: Run all tests**
```bash
npx jest
```
Expected: All tests pass.

- [ ] **Step 5: TypeScript final check**
```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: add haptic feedback on FAB, tab switch, and save"
```

---

## Task 20: EAS Build configuration

**Files:**
- Create: `eas.json`
- Modify: `app.json` (EAS project ID after login)

- [ ] **Step 1: Install EAS CLI and log in**
```bash
npm install -g eas-cli
eas login
```

- [ ] **Step 2: Create eas.json**

```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "ios": { "simulator": false }
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 3: Configure EAS project**
```bash
eas build:configure
```
This adds `extra.eas.projectId` to `app.json`. Commit the updated `app.json`.

- [ ] **Step 4: Build development client (for camera + barcode testing)**
```bash
eas build --platform ios --profile development
```
Install the `.ipa` on your iPhone via the Expo dashboard link or TestFlight internal build. This build is required to test camera, barcode scanner, and Whoop OAuth deep links.

- [ ] **Step 5: Test full flow on device**
- Open Dimer → taps "Connect with Whoop" → completes OAuth → lands on dashboard
- Tap + → Photo tab → take/choose photo → confirm card → save → ring updates live
- Tap + → Text tab → type "200g grilled salmon" → confirm → save
- Tap + → Restaurant tab → search "McDonald's" → select item → save
- Tap + → Barcode tab → scan product → confirm → save
- Swipe left on log item → Delete

- [ ] **Step 6: Build preview for TestFlight**
```bash
eas build --platform ios --profile preview
eas submit --platform ios
```

- [ ] **Step 7: Final commit**
```bash
git add eas.json app.json
git commit -m "feat: add EAS build configuration for iOS dev + preview builds"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Supabase schema + RLS (Task 1)
- [x] food-analyze edge fn: Cal AI + Claude fallback + fiber (Task 2)
- [x] restaurant-search edge fn (Task 3)
- [x] Expo init + all packages (Task 4)
- [x] lib/theme.ts — all color tokens including `ringAmber` (Task 5)
- [x] lib/types.ts — FoodResult with fiber, source distinction documented (Task 5)
- [x] lib/supabase.ts — SecureStore adapter (Task 6)
- [x] lib/whoop.ts — token refresh within 5 min, kJ→kcal (Task 6)
- [x] lib/api.ts — edge fn wrappers (Task 6)
- [x] lib/openfoodfacts.ts — serving size parsing, per-100g fallback (Task 6)
- [x] Navigation shell + auth guard (Task 7)
- [x] Login screen + OAuth PKCE (Task 8)
- [x] auth/callback.tsx (Task 8)
- [x] useWhoopData — AppState foreground refresh (Task 9)
- [x] useFoodLog — realtime channel (Task 9)
- [x] useDeficit — pure, tested (Task 9)
- [x] DeficitRing — animated, color changes at 90%/100% (Task 10)
- [x] MacroBar — animated width (Task 10)
- [x] WhoopBadge (Task 10)
- [x] Dashboard screen with live data (Tasks 11–12)
- [x] Photo tab — compress → edge fn → ConfirmFoodCard (Task 13)
- [x] ConfirmFoodCard — editable fields, serving size scaling, Supabase insert + daily_summaries upsert (Task 14)
- [x] Text tab (Task 15)
- [x] Restaurant tab — quota_exceeded handled (Task 16)
- [x] Barcode tab — Open Food Facts direct, note on dev build requirement (Task 17)
- [x] Log screen — pull to refresh (Task 18)
- [x] FoodLogItem — swipe-to-delete with confirmation (Task 18)
- [x] Haptics — FAB, tab switch, save success (Task 19)
- [x] EAS build — dev + preview + TestFlight (Task 20)
- [x] History tab — "Coming soon" (Task 7)

**Type consistency:**
- `FoodResult.fats` (not `fat`) used consistently across types.ts, edge functions, ConfirmFoodCard, useFoodLog
- `food_logs.fats` column — matches DB schema
- `computeDeficit` exported from `hooks/useDeficit.ts` matches test import path
- `scaleByServing` exported from `components/ConfirmFoodCard.tsx` matches test import path
- `macroColors` exported from `lib/theme.ts` used in FoodLogItem

