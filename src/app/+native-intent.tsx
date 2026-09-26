// The iOS share extension (expo-sharing) reopens the app with `redditdownloader://expo-sharing`.
// There's no such route; send it Home, where LinkPill picks up the shared link and opens Preview.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path.includes('expo-sharing') ? '/' : path;
}
