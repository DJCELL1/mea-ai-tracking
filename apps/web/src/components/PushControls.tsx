import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useToast } from './Toast';

interface PushInfo {
  enabled: boolean;
  publicKey: string | null;
  devices: number;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Turn push notifications on/off for this device. */
export function PushControls() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: info } = useQuery({ queryKey: ['push'], queryFn: () => api.get<PushInfo>('/push') });
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported()) return setSub(null);
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then(setSub, () => setSub(null));
  }, []);

  if (!info) return null;
  if (!info.enabled) return <div className="small muted">Push notifications aren't set up on the server yet (see the README: VAPID keys).</div>;
  if (isIos() && !isStandalone())
    return (
      <div className="small muted">
        On iPhone, notifications only work from the installed app (iOS 16.4 or later): open this site in Safari, tap Share → <strong>Add to Home Screen</strong>, then open Mea from your home screen and come back here.
      </div>
    );
  if (!supported()) return <div className="small muted">This browser doesn't support push notifications.</div>;

  const permission = Notification.permission;

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      if (result !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your phone settings for this app.');
      const reg = await navigator.serviceWorker.ready;
      const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(info!.publicKey!) }));
      await api.post('/push/subscribe', s.toJSON());
      setSub(s);
      await qc.invalidateQueries({ queryKey: ['push'] });
      await api.post('/push/test');
      toast('Notifications on. A test is on its way.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!sub) return;
    setBusy(true);
    try {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
      setSub(null);
      await qc.invalidateQueries({ queryKey: ['push'] });
      toast('Notifications off on this device');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    try {
      const r = await api.post<{ sent: number }>('/push/test');
      toast(r.sent ? 'Test sent' : 'No devices to send to');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {sub ? (
        <>
          <div className="small">
            <span style={{ color: 'var(--accent)' }}>●</span> On for this device{info.devices > 1 ? ` (and ${info.devices - 1} other)` : ''}.
          </div>
          <div className="grid-2">
            <button type="button" className="btn" onClick={test} disabled={busy}>
              Send a test
            </button>
            <button type="button" className="btn btn-ghost btn-danger" onClick={disable} disabled={busy}>
              Turn off here
            </button>
          </div>
        </>
      ) : permission === 'denied' ? (
        <div className="small muted">Notifications are blocked for this app. Allow them in your phone or browser settings, then reload.</div>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={enable} disabled={busy || sub === undefined}>
          Turn on notifications on this device
        </button>
      )}
      {error && <div className="banner error small">{error}</div>}
    </div>
  );
}
