/** Fake-data fixture only. Never imported by production collaboration or editors. */
type Peer = { key: string; name: string; color: string; x?: number; y?: number };
type StatusPeer = Peer & { status: 'viewing' | 'typing' | 'idle' };
export function createLocalPresenceStatus({ typingMs, idleMs }: { typingMs: number; idleMs: number }) {
  let peers: readonly StatusPeer[] = [], session = 0, connected = false;
  const listeners = new Set<() => void>();
  const timers = new Map<string, { typing?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout> }>();
  const emit = () => listeners.forEach(listener => listener());
  function clear(key: string) {
    const timer = timers.get(key); clearTimeout(timer?.typing); clearTimeout(timer?.idle); timers.delete(key);
  }
  function setStatus(key: string, status: StatusPeer['status']) {
    if (!connected || !peers.some(peer => peer.key === key)) return;
    peers = peers.map(peer => peer.key === key ? { ...peer, status } : peer); emit();
  }
  function activity(key: string, typing = false) {
    if (!connected || !peers.some(peer => peer.key === key)) return;
    clear(key); const generation = session;
    const timer: { typing?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout> } = {};
    timers.set(key, timer);
    setStatus(key, typing ? 'typing' : 'viewing');
    if (typing) timer.typing = setTimeout(() => {
      if (generation === session) setStatus(key, 'viewing');
    }, typingMs);
    timer.idle = setTimeout(() => {
      if (generation !== session) return;
      clear(key); setStatus(key, 'idle');
    }, idleMs);
  }
  function disconnect() {
    session++; connected = false; for (const key of timers.keys()) clear(key); peers = []; emit();
  }
  return {
    connect(_flowId: string, next: readonly Peer[]) {
      disconnect(); connected = true; peers = next.map(peer => ({ ...peer, status: 'viewing' }));
      peers.forEach(peer => activity(peer.key)); emit();
    },
    type: (key: string) => activity(key, true), activity: (key: string) => activity(key),
    remove(key: string) { clear(key); peers = peers.filter(peer => peer.key !== key); emit(); },
    disconnect, snapshot: () => peers,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
