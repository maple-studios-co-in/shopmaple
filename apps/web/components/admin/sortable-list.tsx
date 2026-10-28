"use client";
import { useId, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Move one entry to a new index. This is exactly the array the Move up/Move down
 * buttons produce after |to - from| neighbour swaps, so content contracts that
 * validate ordered lists see no new shapes from drag-and-drop.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export type SortableMove = { from: number; to: number };
type RowElement = "li" | "div";
export type SortableListProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  /** Human label used in the handle name and live-region announcements. */
  getLabel: (item: T, index: number) => string;
  onReorder: (next: T[], move: SortableMove) => void;
  renderItem: (item: T, index: number, row: { handle: ReactNode }) => ReactNode;
  as?: "ol" | "ul" | "div";
  rowAs?: RowElement;
  className?: string;
  rowClassName?: string;
  /** Extra attributes for a row, e.g. aria-label or tabIndex for focus management. */
  rowProps?: (item: T, index: number) => Record<string, unknown>;
  /** Receives the row element so callers can manage keyboard focus after moves. */
  rowRef?: (item: T, node: HTMLElement | null) => void;
  disabled?: boolean;
};

const instructions = "To reorder, press space to lift the item, use the up and down arrow keys to move it, press space again to drop it, or press escape to cancel.";

function Row<T>({ item, index, id, label, as: Element, className, extra, rowRef, renderItem, dropTarget, disabled }: {
  item: T; index: number; id: string; label: string; as: RowElement; className?: string;
  extra?: Record<string, unknown>; rowRef?: (item: T, node: HTMLElement | null) => void;
  renderItem: SortableListProps<T>["renderItem"]; dropTarget: boolean; disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const handle = (
    <button type="button" className="admin-drag-handle" aria-label={`Reorder ${label}`}
      ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled}>
      <span aria-hidden="true">⠿</span>
    </button>
  );
  return (
    <Element {...extra} ref={(node: HTMLElement | null) => { setNodeRef(node); rowRef?.(item, node); }}
      className={className} style={style} data-sortable-key={id}
      data-dragging={isDragging ? "true" : undefined} data-drop-target={dropTarget ? "true" : undefined}>
      {renderItem(item, index, { handle })}
    </Element>
  );
}

export function SortableList<T>({
  items, getKey, getLabel, onReorder, renderItem, as: Container = "ol", rowAs = "li",
  className = "admin-section-list", rowClassName, rowProps, rowRef, disabled = false,
}: SortableListProps<T>) {
  const contextId = useId();
  const [over, setOver] = useState<UniqueIdentifier | null>(null);
  const [active, setActive] = useState<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = items.map(getKey);
  const labelOf = (id: UniqueIdentifier) => { const index = keys.indexOf(String(id)); const item = items[index]; return item === undefined ? String(id) : getLabel(item, index); };
  const position = (id: UniqueIdentifier | null | undefined) => (id === null || id === undefined ? -1 : keys.indexOf(String(id))) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, position ${position(active.id)} of ${keys.length}. Use the arrow keys to move it, space to drop, escape to cancel.`,
    onDragOver: ({ active, over }) => over ? `${labelOf(active.id)} is at position ${position(over.id)} of ${keys.length}.` : `${labelOf(active.id)} is no longer over the list.`,
    onDragEnd: ({ active, over }) => over ? `${labelOf(active.id)} dropped at position ${position(over.id)} of ${keys.length}.` : `${labelOf(active.id)} was dropped outside the list and stays at position ${position(active.id)}.`,
    onDragCancel: ({ active }) => `Reordering cancelled. ${labelOf(active.id)} stays at position ${position(active.id)} of ${keys.length}.`,
  };
  function finish(event: DragEndEvent) {
    setActive(null); setOver(null);
    const from = keys.indexOf(String(event.active.id)), to = event.over ? keys.indexOf(String(event.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onReorder(moveItem(items, from, to), { from, to });
  }
  return (
    <DndContext id={contextId} sensors={sensors} collisionDetection={closestCenter} autoScroll={false}
      accessibility={{ announcements, screenReaderInstructions: { draggable: instructions } }}
      onDragStart={(event: DragStartEvent) => { setActive(event.active.id); setOver(null); }}
      onDragOver={(event: DragOverEvent) => setOver(event.over?.id ?? null)}
      onDragEnd={finish} onDragCancel={() => { setActive(null); setOver(null); }}>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <Container className={className} data-sortable-list="">
          {items.map((item, index) => {
            const id = keys[index]!;
            return <Row key={id} item={item} index={index} id={id} label={getLabel(item, index)} as={rowAs} className={rowClassName}
              extra={rowProps?.(item, index)} rowRef={rowRef} renderItem={renderItem} disabled={disabled}
              dropTarget={active !== null && over === id && over !== active} />;
          })}
        </Container>
      </SortableContext>
    </DndContext>
  );
}
