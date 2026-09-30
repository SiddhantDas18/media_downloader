# Known issues

## Instagram

### 1. Reels / videos come back as images (open when signed out; fixed when signed in, untested)
- **Seen:** 2026-09-26 on an Android phone in Expo Go. Sharing a reel or a video post saved the cover image instead of the video.
- **Why:** the full-quality GraphQL query (`www.instagram.com/graphql/query`, `doc_id=8845758582119845`) fails, so extraction falls back to the embed page (`/p/<code>/embed/captioned/`). The embed data often has `is_video: true` without `video_url`, and the old code turned those nodes into images.
- **Done so far:** `parseIgMedia` in `src/lib/extract.ts` now returns `null` for a video without `video_url`, so the user gets an error instead of a wrong file. That's a guard, not a fix: reels still don't download when GraphQL fails.
- **To fix:** find a logged-out source that returns reel video URLs when GraphQL is limited, or retry GraphQL with the LSD token and cookies from the embed page. Confirm with a real reel link on the phone.

### 2. Photos download at lower quality (open, fix not yet confirmed)
- **Seen:** 2026-09-26. Carousel photos downloaded, but smaller than the originals.
- **Why:** the same fallback. Embed-page `display_resources` top out at 640px.
- **Done so far:** GraphQL requests now send `X-CSRFToken` (without it Instagram answers 403), and photos prefer `display_url` (full size, up to 1440px). Couldn't confirm from the dev machine: Instagram rate-limits that network (`401 "Please wait a few minutes"`).
- **To check:** on the phone, a carousel should now save 1080–1440px photos. If it still saves 640px, GraphQL is failing on the phone too and needs the same work as issue 1.

## Reddit

### 3. Bare `v.redd.it` links save silent, lower-res video (minor, by design)
- A `v.redd.it/<id>` link has no post id, so the embed page (which lists MP4s with audio, up to 1080p) can't be used. The app falls back to the DASH playlist: best video-only stream, often 720p, no sound.
- Post links (`reddit.com/r/…/comments/…`, `redd.it/…`, share links) aren't affected.

## Android floating bubble

### 4. Native bubble module not yet compiled or run (open)
- `modules/floating-bubble` (Kotlin) was written without an Android SDK on the dev machine, so it has never been compiled or tried on a device.
- **To check:** `npx expo run:android` with a phone connected. Turn on Settings → Floating download bubble, allow Gallery and "Display over other apps", copy a link in Instagram, tap the bubble.
- Play Store: `SYSTEM_ALERT_WINDOW` and a `specialUse` foreground service both need a policy declaration when publishing.

## Instagram sign-in

### 5. Signed-in Instagram requests not yet tried on a device (open)
- Settings → Accounts → Instagram opens instagram.com's own login in a WebView (`src/app/instagram-login.tsx`). While signed in, a hidden instagram.com WebView (`src/components/ig-session.tsx`) runs `/api/v1/media/<id>/info/` with the user's own cookies. That covers age-restricted posts, full-size photos and real reel videos (issues 1 and 2).
- Verified offline only: the shortcode→id conversion against real Instagram data, and the response parser (`node src/lib/extract.check.ts`).
- **To check on the phone:** sign in, paste an age-restricted post and a reel, then sign out and confirm the Settings row flips back. Sign-out calls Instagram's web logout endpoint (`/api/v1/web/accounts/logout/ajax/`); if that endpoint changed, the cookies can outlive the "signed out" state.

### 6. Signed-in age-restricted posts still failed (fix in, untested)
- **Seen:** 2026-09-29, signed in, age-restricted post wouldn't download.
- **Likely cause:** the hidden WebView sent Instagram's *desktop* web app id (`936619743392459`) from a *mobile* browser, which Instagram rejects ("useragent mismatch"). Errors were also swallowed (non-JSON bodies never resolved, so every request hit the 15 s timeout), and the app then fell back to logged-out lookups that can't see age-restricted posts.
- **Fix:** `src/components/ig-session.tsx` now sends the app id the page itself was served with (mobile-web fallback `1217981644879628`), plus the CSRF token and www-claim like instagram.com does. Instagram's own error text now reaches the Preview error message.
- **To check:** paste an age-restricted post while signed in. If it still fails, the message now says what Instagram answered. Send that text.
