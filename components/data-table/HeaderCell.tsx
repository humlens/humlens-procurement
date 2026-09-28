import { useRef, useState, type CSSProperties } from 'react';
import type { Header, RowData } from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  EyeOff,
  GripVertical,
  Layers,
  MoreVertical,
  PanelLeft,
  PanelRight,
  PinOff,
  X,
} from 'lucide-react';

import Popover, { MenuDivider, MenuItem } from './Popover';
import { SELECT_COLUMN_ID, columnLabel, hasData } from './utils';
import type { tableFeatureSet } from '@/lib/tableFeatures';

export default function HeaderCell<TData extends RowData>({
  header,
  style,
  className,
  onReorder,
  onResizeStart,
  children,
}: {
  header: Header<typeof tableFeatureSet, TData, unknown>;
  style: CSSProperties;
  className: string;
  onReorder: (draggedId: string, targetId: string) => void;
  /** Called just before a resize drag starts (DataTable fixes stretched widths first). */
  onResizeStart?: () => void;
  children: React.ReactNode;
}) {
  const column = header.column;
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const sorted = column.getIsSorted();
  const pinned = column.getIsPinned();
  const isSelect = column.id === SELECT_COLUMN_ID;
  const draggable = !isSelect && !header.isPlaceholder;

  const close = () => setMenuOpen(false);
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <th
      style={style}
      className={`${className} group relative ${dropTarget ? 'bg-brand-50' : ''}`}
      onDragOver={(event) => {
        if (!draggable || !event.dataTransfer.types.includes('application/x-column-id')) return;
        event.preventDefault();
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(event) => {
        setDropTarget(false);
        const draggedId = event.dataTransfer.getData('application/x-column-id');
        if (draggedId && draggedId !== column.id) onReorder(draggedId, column.id);
      }}
    >
      {header.isPlaceholder ? null : isSelect ? (
        children
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/x-column-id', column.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            title="Drag to reorder"
            className="-ml-2 hidden shrink-0 cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing group-hover:block"
          >
            <GripVertical size={12} />
          </span>
          <button
            type="button"
            className={`flex min-w-0 items-center gap-1 ${column.getCanSort() ? 'cursor-pointer select-none hover:text-gray-700' : 'cursor-default'}`}
            onClick={column.getCanSort() ? column.getToggleSortingHandler() : undefined}
            title={column.getCanSort() ? 'Sort (shift-click to sort by several columns)' : undefined}
          >
            <span className="truncate">{children}</span>
            {column.getCanSort() &&
              (sorted === 'asc' ? (
                <ArrowUp size={12} className="shrink-0 text-brand-600" />
              ) : sorted === 'desc' ? (
                <ArrowDown size={12} className="shrink-0 text-brand-600" />
              ) : (
                <ArrowUpDown size={11} className="shrink-0 text-gray-300" />
              ))}
            {sorted && column.getSortIndex() > 0 && <span className="text-[10px] text-brand-600">{column.getSortIndex() + 1}</span>}
          </button>
          {column.getIsGrouped() && <Layers size={11} className="shrink-0 text-brand-600" aria-label="Grouped" />}
          {pinned && (pinned === 'start' ? <PanelLeft size={11} className="shrink-0 text-gray-400" /> : <PanelRight size={11} className="shrink-0 text-gray-400" />)}
          <button
            ref={menuRef}
            type="button"
            aria-label={`${columnLabel(column)} column options`}
            className={`ml-auto shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 ${menuOpen ? 'visible bg-gray-200' : 'invisible group-hover:visible'}`}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={13} />
          </button>
          <Popover anchorRef={menuRef} open={menuOpen} onClose={close} align="end">
            {column.getCanSort() && (
              <>
                <MenuItem icon={ArrowUp} active={sorted === 'asc'} onClick={run(() => column.toggleSorting(false))}>
                  Sort ascending
                </MenuItem>
                <MenuItem icon={ArrowDown} active={sorted === 'desc'} onClick={run(() => column.toggleSorting(true))}>
                  Sort descending
                </MenuItem>
                {sorted && (
                  <MenuItem icon={X} onClick={run(() => column.clearSorting())}>
                    Clear sort
                  </MenuItem>
                )}
                <MenuDivider />
              </>
            )}
            {column.getCanPin() && (
              <>
                {pinned !== 'start' && (
                  <MenuItem icon={PanelLeft} onClick={run(() => column.pin('start'))}>
                    Pin to left
                  </MenuItem>
                )}
                {pinned !== 'end' && (
                  <MenuItem icon={PanelRight} onClick={run(() => column.pin('end'))}>
                    Pin to right
                  </MenuItem>
                )}
                {pinned && (
                  <MenuItem icon={PinOff} onClick={run(() => column.pin(false))}>
                    Unpin
                  </MenuItem>
                )}
                <MenuDivider />
              </>
            )}
            {hasData(column) && column.getCanGroup() && (
              <MenuItem icon={Layers} active={column.getIsGrouped()} onClick={run(() => column.toggleGrouping())}>
                {column.getIsGrouped() ? 'Stop grouping' : `Group by ${columnLabel(column).toLowerCase()}`}
              </MenuItem>
            )}
            {column.getCanHide() && (
              <MenuItem icon={EyeOff} onClick={run(() => column.toggleVisibility(false))}>
                Hide column
              </MenuItem>
            )}
          </Popover>
        </div>
      )}

      {header.column.getCanResize() && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${columnLabel(column)}`}
          onMouseDown={(event) => {
            onResizeStart?.();
            header.getResizeHandler()(event);
          }}
          onTouchStart={(event) => {
            onResizeStart?.();
            header.getResizeHandler()(event);
          }}
          onDoubleClick={() => column.resetSize()}
          onClick={(event) => event.stopPropagation()}
          className={`absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none ${
            column.getIsResizing() ? 'bg-brand-500' : 'hover:bg-gray-300'
          }`}
        />
      )}
    </th>
  );
}
