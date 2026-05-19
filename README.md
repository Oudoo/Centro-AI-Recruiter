# Centro CDX · AI Recruiter

A standalone Next.js app that conducts AI-led screening interviews for Centro CDX BPO candidates.

**Stack:** Next.js 15 (App Router, TypeScript) · Hume AI EVI 2 (voice agent + emotion) · Anthropic Claude Sonnet 4.6 (rubric scoring) · Tailwind CSS

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# Fill in: ANTHROPIC_API_KEY, HUME_API_KEY, HUME_SECRET_KEY, HUME_EVI_CONFIG_ID

# 3. Run
npm run dev
```

Visit http://localhost:3000

## What it does (v1)

1. Candidate lands on `/` → enters name + email + consents
2. Tap "Start Screening" → routed to `/screen/[sessionId]`
3. Hume EVI 2 connects via WebSocket, "Maya" runs the 5-segment interview from the persona prompt seeded in Zoho Creator (`AI_Config` record `4256189000012932032`)
4. On session end → POST to `/api/score` → Claude Sonnet 4.6 scores against the rubric
5. Redirect to `/results/[sessionId]` → score breakdown, per-segment notes, transcript

## Persona / rubric source of truth

The active rubric lives in **two places**:

- **Zoho Creator → `AI_Config` form** (record ID `4256189000012932032`, `Customer_Service_English_v1` v1.0.0) — this is the SoT for TLs who want to tune the rubric without redeploying
- **`lib/rubric.ts`** — mirrors the Creator record. v1 reads from this file. v1.1 will fetch from Creator's REST API at session start.

To update the rubric for v1 testing, edit `lib/rubric.ts` and redeploy. To update for v1.1+, edit the Creator record via the UI or `ZohoCreator_updateRecordByID`.

## Hume EVI Config

You must create an EVI Config in the [Hume Platform](https://platform.hume.ai/) dashboard:

1. Go to **EVI** → **Configs** → **+ Create Config**
2. Set **Model: Claude Sonnet 4.5** (Hume's hosted Anthropic option) OR keep their default
3. Set **System Prompt:** paste the content from `lib/rubric.ts` → `activeRubric.personaPrompt`
4. Set **Voice:** any English voice that fits Maya (recommend a warm female voice — Hume's `ITO` or `KORA` work well)
5. Save → copy the **Config ID** → paste into `.env.local` as `HUME_EVI_CONFIG_ID`

**Important:** the Role_Play_Scenario isn't loaded into Hume directly — it's injected as a tool/system note at the role-play moment. v1 keeps the persona prompt all-in-one for simplicity; v1.1 will split into structured prompt + tool calls.

## Env vars

| Var | Source | Required for |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | Scoring endpoint |
| `HUME_API_KEY` + `HUME_SECRET_KEY` | platform.hume.ai → API Keys | EVI access token issuance |
| `HUME_EVI_CONFIG_ID` | platform.hume.ai → EVI Configs | Loading Maya's persona at session start |
| `DAILY_API_KEY` | dashboard.daily.co | v1.1 (recording storage) |
| `ZOHO_CREATOR_OAUTH_*` | api-console.zoho.com | v1.1 (POST results to Screening_Session) |

**Security:** never commit `.env.local`. Production deploys use Vercel → Project → Settings → Environment Variables.

## File structure

```
app/
  layout.tsx                  · Roboto font, Centro brand
  globals.css
  page.tsx                    · Landing: name / email / consent
  screen/[sessionId]/page.tsx · The actual screening UI
  results/[sessionId]/page.tsx · Score breakdown
  api/
    hume-token/route.ts       · Issues short-lived Hume access token
    score/route.ts            · Calls Claude with the rubric

lib/
  rubric.ts                   · Persona + scoring rubric (mirrors AI_Config)
  hume.ts                     · Hume SDK wrapper (server-side token)
  claude.ts                   · Anthropic SDK wrapper (server-side scoring)
  theme.ts                    · Centro brand constants

components/
  BrandHeader.tsx             · Header with Centro logo
  HumeWidget.tsx              · The Hume EVI 2 voice widget
  ScoreCard.tsx               · Per-dimension score card
```

## Logos & branding

Place `centro-logo.png` (140x40 recommended) in `public/`. The hexagonal mark + "centro" wordmark from the brand guide. Colors: `#004a59` (primary), `#ffffff` (paper), `#32373c` (ink). Font: Roboto via Google Fonts (loaded in `globals.css`).

## What's NOT in v1 (deliberately deferred)

- **Daily.co recording** — Hume handles the voice transport directly; recording will land in v1.1 via Daily or Hume's chat-export API
- **Facial expression analysis** — Hume's expression-measurement API call after frame extraction; deferred to v1.2
- **POST to Zoho Creator** — v1.1, after smoke test validates the scoring quality
- **WhatsApp/SMS invites** — deferred (recruiter shares the screening URL manually)
- **Bias audit dashboard** — Creator-side, post-data-collection (v1.2)

## Smoke-test plan

Round 1: Mahmoud + 2 engineers, ~3 sessions each
Round 2: Pre-sales team (5-8 people)
Round 3: Deployment team (5-8 people)
Round 4: Software team (5-8 people)

Calibrate rubric thresholds after ~25 sessions.
