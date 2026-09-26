# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project specifics

- Package manager is **npm** (`package-lock.json`), so use `npx`, not `bunx`. Expo SDK **57** — docs at https://docs.expo.dev/versions/v57.0.0/
- Media Downloader app: paste a post link, preview its media, download originals. UI follows the "Vault" direction of the Claude Design file `Media Downloader.dc.html` / `Downloader App.dc.html`.
- No test runner. Verify with `npx expo lint`, `npx tsc --noEmit`, and `node src/lib/extract.check.ts` (assert-based parser checks; `*.check.ts` is excluded from tsc).
- `app.json` enables `typedRoutes` and `reactCompiler` — skip manual `useMemo`/`useCallback`; route hrefs are type-checked.
- Open extraction bugs are tracked in `KNOWN_ISSUES.md`.
- Needs a dev build for Face ID (`expo-local-authentication`) and saving to Photos; not a web target (`src/lib/store.ts` reads files at import time).

## Architecture

- `src/lib/extract.ts` — link → `Post { source, author, slug, nsfw, items[] }`. Reddit via the public embed page (`embed.reddit.com/r/<sub>/comments/<id>/`; logged-out `.json` is 403 since 2026-09), X via `api.fxtwitter.com`, TikTok via `tikwm.com`, everything else via Open Graph tags (fetched with a link-preview bot UA) or a direct file URL. Kept import-free so the check script runs under plain Node.
- `src/lib/store.ts` — the only app state: a module-level store read with `useApp()` (`useSyncExternalStore`). Settings + history persist to `Paths.document/state.json`; jobs, the open post, and the Private-folder unlock are session-only. The download queue lives here too (2 parallel, `File.downloadFileAsync` into `Paths.document/MediaDL/<Source>`, NSFW into `MediaDL/.private`, then copied to a "Media Downloader" Photos album when `saveTo === 'photos'`).
- Routes: `src/app/_layout.tsx` gates onboarding vs. the app with `Stack.Protected`. `(tabs)/` holds Home/Queue/History/Settings with a custom JS tab bar; `preview`, `folder/[key]`, `viewer/[id]` are stack screens; `picker` and `location` are `formSheet`s. The picker reads the current post from the store (`setPost`).
- `modules/floating-bubble/` — local Android-only Expo module (autolinked from `./modules`): a foreground service drawing a draggable bubble over other apps; tapping it reads the clipboard and opens `redditdownloader://preview?url=…`. JS wrapper + permission flow in `src/lib/bubble.ts` (no-op on iOS and in Expo Go).
- Styling: tokens in `src/constants/theme.ts` (`T` colors/radii, `F` font family names loaded in the root layout); shared primitives (`Txt`, `Btn`, `Card`, `Row`, `SettingRow`, `Radio`, `Thumb`, `BackButton`) in `src/components/ui.tsx`.
