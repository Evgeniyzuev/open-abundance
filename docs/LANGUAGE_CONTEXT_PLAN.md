# Lightweight Language Context Plan

## Summary

Open Abundance uses a small in-app language context instead of a full i18n framework. The main app and profile language remain `ru` and `en`.

The first onboarding can additionally speak Simplified Chinese (`zh`, suitable for WeChat users), Spanish (`es`), and Hindi (`hi`). These three locales are intentionally scoped to onboarding and are not added to the global app dictionary or `user_profiles.default_locale`.

The app resolves language like this:

1. If the signed-in user has `user_profiles.default_locale = 'ru'`, show Russian.
2. Any other profile value resolves to English.
3. Guests first use the explicit main-app choice from `openAbundanceLocale`.
4. Without a main-app choice, guests use the browser language: `ru*` becomes Russian, everything else becomes English.
5. Onboarding uses its own `openAbundanceOnboardingLocale` preference and maps browser prefixes `ru`, `zh`, `es`, and `hi` to the matching onboarding copy; unsupported browsers use English.
6. New registration maps onboarding `ru` to profile `ru`; onboarding `en`, `zh`, `es`, and `hi` map to profile `en`. The server still validates `ru | en`.

## Implementation

- `lib/i18n.ts` owns `AppLocale`, locale detection, the local preference key, and the message dictionary.
- `UserProvider` is the app language source:
  - exposes `locale`, `t(key, values)`, and `setLocale(nextLocale)`;
  - updates `<html lang>` on the client;
  - optimistically updates `profile.default_locale`;
  - persists profile language with Supabase RLS.
- The Profile screen shows a language toggle button and saves the preference to `user_profiles.default_locale`.
- `lib/onboardingContent.ts` owns the separate onboarding locale type, five-language copy, browser detection, compact native language selector, and `openAbundanceOnboardingLocale` persistence.
- The onboarding header shows a compact selector with `RU`, `EN`, `中文`, `ES`, and `HI`. It applies instantly without changing the current onboarding step and does not mutate the main app language while the user is onboarding.
- The OAuth callback and authenticated registration claim read the onboarding choice and map the onboarding-only locales back to the app's supported `ru | en` profile values.
- Challenge JSON fields still support `{ en, ru }`, but the UI chooses by current app locale and falls back to English.
- `app/layout.tsx` keeps static `lang="en"` until the client provider applies the current locale.

## Encoding Policy

- React, API, and app logic should not contain scattered Russian UI strings.
- Add new visible UI text to `lib/i18n.ts` with ASCII message keys.
- If command-line encoding corrupts Cyrillic again, keep Russian text isolated in the dictionary and convert those values to Unicode escapes.
- Server/API fallback errors should be English unless they are explicitly localized through the client.

## Database

- `user_profiles.default_locale` default is `en`.
- Valid values are restricted to `ru` and `en`.
- Existing invalid or missing locale values are normalized to `en`.

## Test Plan

- Browser `ru-RU` guest sees Russian UI.
- Browser `en-US` or any non-Russian guest sees English UI.
- Onboarding language switch updates all three screens immediately and survives reload for `ru`, `en`, `zh`, `es`, and `hi`.
- A guest's explicit onboarding choice overrides browser detection; `ru` becomes the registration locale and the onboarding-only locales safely fall back to `en` in the main app.
- New Russian-browser registration stores `default_locale = 'ru'`.
- New non-Russian registration stores `default_locale = 'en'`.
- Existing users load from `user_profiles.default_locale`.
- Profile language toggle updates the UI immediately, persists to Supabase, and survives reload.
- Challenges use selected locale for JSON text and fall back to English.
- Run `pnpm lint` and `pnpm exec tsc --noEmit`.
