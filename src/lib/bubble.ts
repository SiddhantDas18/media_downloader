import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';

import { hasPhotos, requestPhotos, updateSettings, getSettings } from '@/lib/store';

// Android-only native module in modules/floating-bubble. Missing on iOS and in Expo Go.
const native = requireOptionalNativeModule<{
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  start(scheme: string): boolean;
  stop(): void;
  isRunning(): boolean;
}>('FloatingBubble');

export const bubbleSupported = !!native;
const scheme = String(Constants.expoConfig?.scheme ?? 'redditdownloader');

/**
 * Turning the bubble on needs Gallery access and "Display over other apps". Returns what's still missing;
 * the bubble only starts (and the setting only turns on) when nothing is.
 */
export async function enableBubble(): Promise<'photos' | 'overlay' | null> {
  if (!native) return 'overlay';
  if (!(await requestPhotos())) return 'photos';
  if (!native.canDrawOverlays()) return 'overlay';
  native.start(scheme);
  updateSettings({ bubble: true });
  return null;
}

// Set while the user is on the system overlay screen, so returning with the permission granted finishes enabling.
let awaitingOverlay = false;
export function openOverlaySettings() {
  awaitingOverlay = true;
  native?.openOverlaySettings();
}

export function disableBubble() {
  native?.stop();
  updateSettings({ bubble: false });
}

/** On every app open: keep the bubble running if it's on, or switch it off if a permission was revoked. */
export async function syncBubble() {
  if (!native) return;
  if (awaitingOverlay) {
    awaitingOverlay = false;
    if (native.canDrawOverlays()) await enableBubble();
    return;
  }
  if (!getSettings().bubble) return;
  if (native.canDrawOverlays() && (await hasPhotos())) {
    if (!native.isRunning()) native.start(scheme);
  } else disableBubble();
}
