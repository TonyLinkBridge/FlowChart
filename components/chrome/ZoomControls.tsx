'use client';

import { Minus, Plus } from 'lucide-react';
import { FloatingButtonGroup } from '@/components/arc/floating-button-group/floating-button-group';
import s from './ZoomControls.module.css';

interface Props {
  zoom: number;
  onZoomOut: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  className?: string;
}

/** Presentation only: the parent retains all zoom, fit and wheel behavior. */
export function ZoomControls({ zoom, onZoomOut, onFit, onZoomIn, className }: Props) {
  return <div className={[s.controls, className].filter(Boolean).join(' ')} data-pop
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <FloatingButtonGroup label="画布缩放" variant="floating" size="sm" orientation="horizontal" tooltipSide="top"
      items={[
        { id: 'zoom-out', label: '缩小画布', icon: <Minus />, iconOnly: true, onSelect: onZoomOut },
        { id: 'fit', label: `适应画布 · ${Math.round(zoom * 100)}%`, icon: <span className={s.percentage}>{Math.round(zoom * 100)}%</span>, iconOnly: true,
          reserveLabels: ['适应画布 · 100%', '适应画布 · 250%'], onSelect: onFit },
        { id: 'zoom-in', label: '放大画布', icon: <Plus />, iconOnly: true, onSelect: onZoomIn },
      ]} />
  </div>;
}
