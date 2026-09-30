import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { setIgSession } from '@/lib/extract';
import { showToast, updateSettings, useApp } from '@/lib/store';

const IG = 'https://www.instagram.com/';
// Posts back whether this WebView has a signed-in Instagram session (ds_user_id is a readable cookie; sessionid isn't).
const AUTH_JS = `window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'auth', signedIn: document.cookie.includes('ds_user_id'), path: location.pathname })); true;`;
/**
 * Injected into the hidden page on load. Instagram rejects an X-IG-App-ID that doesn't match the browser type
 * ("useragent mismatch"): the WebView is a mobile browser, so use the app id the page itself was served with,
 * falling back to Instagram's mobile-web id. CSRF token and www-claim mirror what instagram.com sends.
 */
const HELPERS_JS = `window.igHeaders = () => {
  if (!window.__igAppId) {
    const html = document.documentElement.innerHTML;
    window.__igAppId = (html.match(/"X-IG-App-ID":"(\\d+)"/) || html.match(/"appId":"(\\d+)"/) || html.match(/"app_id":"(\\d+)"/) || [])[1]
      || (/Mobi|Android|iPhone/.test(navigator.userAgent) ? '1217981644879628' : '936619743392459');
  }
  return {
    'X-IG-App-ID': window.__igAppId,
    'X-CSRFToken': (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '',
    'X-IG-WWW-Claim': sessionStorage.getItem('www-claim-v2') || '0',
    'X-ASBD-ID': '129477',
    'X-Requested-With': 'XMLHttpRequest',
  };
};`;
export const IG_LOGIN_URL = `${IG}accounts/login/`;
export const igAuthScript = AUTH_JS;
export const isInstagramPage = (url: string) => url.startsWith(IG);

/**
 * Hidden instagram.com page, mounted while signed in. Requests run *inside* it with fetch(..., credentials: 'include'),
 * so Instagram sees the user's own session cookies (HttpOnly, never readable by the app) exactly like its website does.
 */
export function IgSession() {
  const signedIn = useApp((s) => s.settings.igSignedIn);
  const signingOut = useApp((s) => s.igSignOut);
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const queue = useRef<string[]>([]);
  const pending = useRef(new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>());
  const seq = useRef(0);

  const run = (js: string) => (ready.current ? web.current?.injectJavaScript(js) : queue.current.push(js));

  useEffect(() => {
    if (!signedIn) return;
    setIgSession(
      (path) =>
        new Promise((resolve, reject) => {
          const id = ++seq.current;
          pending.current.set(id, { resolve, reject });
          setTimeout(() => pending.current.delete(id) && reject(new Error('Instagram took too long to answer')), 15000);
          // HELPERS_JS travels with each request: the load-time injection and the first request can race.
          run(`${HELPERS_JS} fetch(${JSON.stringify(path)}, { credentials: 'include', headers: igHeaders() })
            .then((r) => r.text().then((body) => window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'res', id: ${id}, status: r.status, body }))))
            .catch((e) => window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'res', id: ${id}, error: String(e) })));
            true;`);
        }),
    );
    return () => {
      setIgSession(null);
    };
  }, [signedIn]);

  useEffect(() => {
    if (!signingOut) return;
    // Instagram's web logout: needs the csrftoken cookie (readable) echoed as a header.
    run(`${HELPERS_JS} (() => {
      const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
      fetch('/api/v1/web/accounts/logout/ajax/', { method: 'POST', credentials: 'include',
        headers: { ...igHeaders(), 'X-CSRFToken': csrf, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'one_tap_app_login=0' })
        .finally(() => window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loggedOut' })));
    })(); true;`);
  }, [signingOut]);

  if (!signedIn) return null;

  const onMessage = (e: WebViewMessageEvent) => {
    if (!isInstagramPage(e.nativeEvent.url)) return;
    const msg = JSON.parse(e.nativeEvent.data);
    if (msg.type === 'auth' && !msg.signedIn) {
      updateSettings({ igSignedIn: false }); // session expired or revoked
      showToast('Signed out of Instagram. Sign in again in Settings for age-restricted posts.');
    } else if (msg.type === 'loggedOut') {
      updateSettings({ igSignedIn: false });
    } else if (msg.type === 'res') {
      const p = pending.current.get(msg.id);
      pending.current.delete(msg.id);
      if (!p) return;
      if (msg.error) return p.reject(new Error(msg.error));
      let json: any;
      try {
        json = JSON.parse(msg.body);
      } catch {
        // An HTML page instead of JSON: usually a login/checkpoint redirect.
        return p.reject(new Error(`Instagram answered ${msg.status} with a web page (session may need a fresh sign-in)`));
      }
      if (msg.status >= 400 || json?.status === 'fail') p.reject(new Error(`Instagram answered ${msg.status}: ${json?.message ?? 'request failed'}`));
      else p.resolve(json);
    }
  };

  return (
    <WebView
      ref={web}
      source={{ uri: IG }}
      style={styles.hidden}
      pointerEvents="none"
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      injectedJavaScript={HELPERS_JS + AUTH_JS}
      onMessage={onMessage}
      onLoadEnd={() => {
        ready.current = true;
        queue.current.splice(0).forEach((js) => web.current?.injectJavaScript(js));
      }}
    />
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10 },
});
