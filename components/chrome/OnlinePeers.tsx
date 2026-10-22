'use client';

// RunFlow's own implementation from observed public interactions, not Arc Pro source.
import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useReducedMotion } from 'motion/react';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/arc/popover/popover';
import { motionTokens } from '@/components/arc/lib/motion-tokens';
import s from './OnlinePeers.module.css';

type Peer = { key: string; name: string; color: string; status?: 'viewing' | 'typing' | 'idle' };
const statusOf = (peer: Peer) => peer.status ?? 'viewing';
const statusText = (peer: Peer) => peer.status === 'typing' ? '正在输入' : peer.status === 'idle' ? '暂时无操作' : '正在查看此流程';
function StatusMark({ peer }: { peer: Peer }) {
  return <span className={s.dot} data-peer-status={statusOf(peer)} aria-hidden="true">
    {peer.status === 'typing' && <span className={s.typingDots}><i /><i /><i /></span>}
  </span>;
}
const MAX = 4, SIZE = 28, REST_STEP = SIZE * .68, FAN_STEP = SIZE + 4;
const nameOf = (peer: Peer) => peer.name.trim() || '未命名同事';
function initials(peer: Peer) {
  const name = peer.name.trim();
  if (!name) return '?';
  const words = name.split(/\s+/);
  return (words.length > 1 ? Array.from(words[0])[0] + Array.from(words.at(-1)!)[0] : Array.from(name).slice(0, 2).join('')).toUpperCase();
}

function Count({ value, prefix = '', reduced }: { value: number; prefix?: string; reduced: boolean }) {
  const [last, setLast] = useState({ value, from: value });
  if (last.value !== value) setLast({ value, from: last.value });
  const direction = value >= last.from ? 1 : -1;
  return <span className={s.number} aria-hidden="true"><AnimatePresence initial={false} mode="popLayout" custom={direction}>
    <motion.span key={value} custom={direction} initial={{ y: reduced ? 0 : direction * 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }} variants={{ gone: (d: number) => ({ y: reduced ? 0 : d * -12, opacity: 0 }) }} exit="gone"
      transition={reduced ? { duration: 0 } : { ...motionTokens.spring.snappy, opacity: { duration: .12 } }}>
      {prefix}{value}
    </motion.span>
  </AnimatePresence></span>;
}

function Face({ peer, x, active, index, reduced, onPoint }: {
  peer: Peer; x: number; active: boolean; index: number; reduced: boolean; onPoint: () => void;
}) {
  const present = useIsPresent();
  return <motion.span className={s.face} data-peer-key={peer.key} data-peer-status={statusOf(peer)} data-index={index} aria-hidden="true" inert={!present || undefined}
    onPointerEnter={present ? onPoint : undefined} style={{ '--peer-color': peer.color, zIndex: active ? 20 : index + 1 } as CSSProperties}
    initial={reduced ? false : { scale: .4, opacity: 0, x }} animate={{ x, y: active ? -2 : 0, scale: 1, opacity: 1 }}
    exit={{ scale: reduced ? 1 : .4, opacity: 0, transition: { duration: reduced ? 0 : .16 } }}
    transition={reduced ? { duration: 0 } : { ...motionTokens.spring.morph, x: motionTokens.spring.smooth }}>
    <span className={s.portrait}>{initials(peer)}</span><StatusMark peer={peer} />
  </motion.span>;
}

function Stack({ peers }: { peers: readonly Peer[] }) {
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false), [hover, setHover] = useState(false), [keyboard, setKeyboard] = useState(false);
  const [activeId, setActiveId] = useState(peers[0].key);
  const trigger = useRef<HTMLButtonElement>(null), label = useRef<HTMLSpanElement>(null), labelWasShown = useRef(false);
  const labelX = useMotionValue(0);
  const headingId = useId();
  const visible = peers.slice(0, MAX), extra = Math.max(0, peers.length - MAX);
  const slots = visible.length + (extra ? 1 : 0), activeIndex = Math.max(0, visible.findIndex(peer => peer.key === activeId));
  const active = visible[activeIndex], fanned = (hover || keyboard) && !open;
  const step = fanned ? FAN_STEP : REST_STEP;

  useLayoutEffect(() => {
    if (!fanned || !label.current || !trigger.current) { labelWasShown.current = false; return; }
    const rect = trigger.current.getBoundingClientRect(), width = label.current.offsetWidth;
    const center = rect.right - SIZE / 2 + (activeIndex - slots + 1) * FAN_STEP;
    const left = Math.min(Math.max(12, center - width / 2), Math.max(12, window.innerWidth - 12 - width));
    if (!labelWasShown.current) { labelX.jump(left - rect.left); labelWasShown.current = true; return; }
    const animation = animate(labelX, left - rect.left, reduced ? { duration: 0 } : motionTokens.spring.morph);
    return () => animation.stop();
  }, [activeIndex, active.name, active.status, slots, fanned, reduced, labelX]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); setKeyboard(true);
    const next = (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
    setActiveId(visible[next].key);
  }

  return <div className={s.root} data-online-peers data-pop data-fanned={fanned} data-many={peers.length > 1}
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} onPaste={event => event.stopPropagation()}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button ref={trigger} type="button" className={s.trigger} aria-label={`在线同事，${peers.length} 人`}
        onPointerEnter={event => { if (event.pointerType !== 'touch') setHover(true); }} onPointerLeave={() => setHover(false)}
        onFocus={event => setKeyboard(event.currentTarget.matches(':focus-visible'))} onBlur={() => setKeyboard(false)} onKeyDown={onKeyDown}>
        <span aria-hidden="true"><AnimatePresence initial={false}>
          {visible.map((peer, index) => <Face key={peer.key} peer={peer} index={index} x={(index - slots + 1) * step}
            active={fanned && index === activeIndex} reduced={reduced} onPoint={() => setActiveId(peer.key)} />)}
        </AnimatePresence></span>
        {extra > 0 && <motion.span className={s.overflow} aria-hidden="true" animate={{ x: 0 }}><Count value={extra} prefix="+" reduced={reduced} /></motion.span>}
        {peers.length > 1 && <span className={s.mobileCount} aria-hidden="true"><Count value={peers.length - 1} prefix="+" reduced={reduced} /></span>}
      </button></PopoverTrigger>
      {fanned && <motion.span ref={label} className={s.label} aria-hidden="true" style={{ x: labelX }} layout="size"
        initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : motionTokens.spring.morph}>
        {nameOf(active)}<span>{statusText(active)}</span>
      </motion.span>}
      <PopoverContent className={s.panel} align="end" side="bottom" aria-labelledby={headingId} data-pop
        inert={!open || undefined} aria-hidden={!open || undefined}
        onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} onPaste={event => event.stopPropagation()}>
        <div className={s.heading}><h2 id={headingId}>一起看这张流程</h2><span className={s.total} aria-label={`${peers.length} 人`}><Count value={peers.length} reduced={reduced} /></span>
          <PopoverClose asChild><button type="button" disabled={!open} className={s.close} aria-label="关闭成员名单">×</button></PopoverClose>
        </div>
        <p className={s.caption}>当前在线同事，不包含你自己</p>
        <ul className={s.list}>
          <AnimatePresence initial={false}>
            {peers.map(peer => <RosterRow key={peer.key} peer={peer} reduced={reduced} />)}
          </AnimatePresence>
        </ul>
        {peers.some(peer => peer.status === 'idle') && <p className={s.statusNote}>暂时无操作不等于离线，也不代表已离开。</p>}
      </PopoverContent>
    </Popover>
  </div>;
}

function RosterRow({ peer, reduced }: { peer: Peer; reduced: boolean }) {
  const present = useIsPresent();
  return <motion.li className={s.row} data-peer-status={statusOf(peer)} aria-hidden={!present || undefined} inert={!present || undefined}
    layout="position" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
    exit={{ height: 0, opacity: 0 }} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}>
    <span className={s.rowFace} data-peer-status={statusOf(peer)} aria-hidden="true" style={{ '--peer-color': peer.color } as CSSProperties}><span className={s.portrait}>{initials(peer)}</span><StatusMark peer={peer} /></span>
    <span className={s.rowCopy}><span className={s.name}>{nameOf(peer)}</span><span className={s.detail}>{statusText(peer)}</span></span>
  </motion.li>;
}

/** Ignore cursor/selection ticks; render only explicitly supplied display statuses. */
export const OnlinePeers = memo(function OnlinePeers({ peers }: { peers: readonly Peer[] }) {
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef(peers);
  useEffect(() => {
    const before = new Set(previous.current.map(peer => peer.key)), now = new Set(peers.map(peer => peer.key));
    const joined = peers.filter(peer => !before.has(peer.key)), left = previous.current.filter(peer => !now.has(peer.key));
    if (joined.length || left.length) setAnnouncement([
      joined.length ? `${joined.map(nameOf).join('、')} 加入了这张流程` : '',
      left.length ? `${left.map(nameOf).join('、')} 离开了这张流程` : '',
    ].filter(Boolean).join('；'));
    previous.current = peers;
  }, [peers]);
  return <>{peers.length ? <Stack peers={peers} /> : null}
    <span className={s.srOnly} role="status" aria-live="polite" aria-atomic="true">{announcement}</span></>;
}, (before, after) => before.peers.length === after.peers.length && before.peers.every((peer, i) => {
  const next = after.peers[i]; return peer.key === next.key && peer.name === next.name && peer.color === next.color && statusOf(peer) === statusOf(next);
}));
