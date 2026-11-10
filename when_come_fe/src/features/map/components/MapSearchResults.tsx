import { useEffect, useRef, useState } from 'react';
import { Content, Overlay } from '@radix-ui/react-dialog';
import { Maximize2, X } from 'lucide-react';
import { Dialog, DialogClose, DialogDescription, DialogPortal, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { StopMap, mapResultDetails } from './StopMap';
import { isMappableStop, stopKey } from '../types/map';
import type { StopSummary } from '../types/map';

interface MapSearchResultsProps {
  stops: readonly StopSummary[];
  resultsKey: string;
  itemLabel: '장소' | '정류장';
  listLabel: string;
  selectedKey: string | null;
  confirmLabel: string;
  note?: string;
  onSelect: (key: string | null) => void;
  onConfirm: () => void;
}

export function MapSearchResults({ stops, resultsKey, itemLabel, listLabel, selectedKey, confirmLabel, note = undefined, onSelect, onConfirm }: MapSearchResultsProps) {
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLParagraphElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const hadSelectionRef = useRef(false);
  const selected = stops.find(stop => stopKey(stop) === selectedKey);
  const canShowMap = import.meta.env.VITE_ENABLE_STOP_MAP === 'true' && stops.some(isMappableStop);
  const showExpanded = expanded && canShowMap && !selected;

  useEffect(() => {
    if (selected) {
      confirmRef.current?.scrollIntoView?.({ block: 'center' });
      confirmRef.current?.focus({ preventScroll: true });
    } else if (hadSelectionRef.current) {
      resultsRef.current?.focus();
    }
    hadSelectionRef.current = !!selected;
  }, [selected]);

  function handleExpandedChange(open: boolean) {
    if (open && document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    setExpanded(open);
  }

  function handleSelect(key: string) {
    setExpanded(false);
    onSelect(key);
  }

  return (
    <Dialog open={showExpanded} onOpenChange={handleExpandedChange}>
      {selected ? (
        <div className="space-y-2 rounded-card border border-border-default bg-surface-card p-3">
          <p className="text-caption text-text-secondary">선택한 {itemLabel}</p>
          <p className="break-words text-card-title">{selected.name}</p>
          <p className="break-words text-caption text-text-secondary">{mapResultDetails(selected, itemLabel)}</p>
          {note && <p className="text-caption text-text-secondary">{note}</p>}
          <button ref={confirmRef} type="button" onClick={onConfirm} className="min-h-12 w-full rounded-control bg-text-primary px-3 text-button text-white">{confirmLabel}</button>
          <button type="button" onClick={() => onSelect(null)} className="min-h-11 w-full rounded-control px-3 text-button text-text-secondary hover:bg-surface-muted">검색 결과 다시 보기</button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <p ref={resultsRef} tabIndex={-1} role="status" className="text-caption text-text-secondary">검색 결과 {stops.length}개</p>
            {canShowMap && <DialogTrigger asChild>
              <button ref={triggerRef} type="button" className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-button text-text-primary hover:bg-surface-muted">
                <Maximize2 aria-hidden="true" className="size-4" />지도 크게 보기
              </button>
            </DialogTrigger>}
          </div>
          {!showExpanded && <StopMap enabled={canShowMap} stops={stops} resultsKey={resultsKey} itemLabel={itemLabel} listLabel={listLabel} selectedStopKey={null} onSelect={handleSelect} />}
        </div>
      )}
      <DialogPortal>
        <Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Content onCloseAutoFocus={event => {
          event.preventDefault();
          (confirmRef.current ?? triggerRef.current)?.focus({ preventScroll: true });
        }} className="fixed inset-0 z-50 flex h-dvh flex-col gap-3 bg-surface-card px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-5/6 sm:w-[calc(100%-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:p-4 sm:shadow-floating">
          <div className="flex items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-card-title">{itemLabel} 지도</DialogTitle>
              <DialogDescription className="text-caption text-text-secondary">핀을 눌러 후보를 고르세요.</DialogDescription>
            </div>
            <DialogClose asChild><button type="button" aria-label="지도 닫기" className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-muted"><X aria-hidden="true" className="size-5" /></button></DialogClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {showExpanded && <StopMap enabled expanded showList={false} stops={stops} resultsKey={resultsKey} itemLabel={itemLabel} selectedStopKey={null} onSelect={handleSelect} />}
          </div>
          <DialogClose asChild><button type="button" className="min-h-12 rounded-control border border-border-default px-3 text-button text-text-primary hover:bg-surface-muted">목록에서 선택</button></DialogClose>
        </Content>
      </DialogPortal>
    </Dialog>
  );
}
