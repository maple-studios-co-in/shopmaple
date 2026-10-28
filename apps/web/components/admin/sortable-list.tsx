"use client";
import { createElement, useId, useRef, useState, type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent, type Modifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

export type SortableRowProps = Record<string, unknown> & {
  ref?: (node: HTMLElement | null) => void;
  className?: string;
};
export type SortableListProps<T> = {
  items: readonly T[];
  /** Stable identity for each item; it must be unique within the list. */
  getId: (item: T) => string;
  /** Spoken name used for the handle label and the live-region announcements. */
  getLabel: (item: T, index: number) => string;
  /** Receives exactly the array the Move up/down buttons would produce by repeated swaps. */
  onReorder: (next: T[], moved: T, from: number, to: number) => void;
  /** Row content; place `handle` wherever the grip should appear. */
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  tag?: "ol" | "ul" | "div";
  rowTag?: "li" | "fieldset" | "details" | "div";
  className?: string;
  /** Extra attributes for a row: labels, data attributes and a ref callback for focus management. */
  rowProps?: (item: T, index: number) => SortableRowProps;
};

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const instructions = "To pick up an item, press space or enter. While lifted, use the up and down arrow keys to move it. Press space or enter again to drop it in its new position, or press escape to cancel.";

function SortableRow({ id, label, tag, dragging, dropTarget, rowProps, children }: {
  id: string;
  label: string;
  tag: NonNullable<SortableListProps<unknown>["rowTag"]>;
  dragging: boolean;
  dropTarget: "before" | "after" | null;
  rowProps: SortableRowProps;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id });
  const { ref, className, ...rest } = rowProps;
  const handle = (
    <button
      type="button"
      className="admin-drag-handle"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag ${label}`}
    >
      <GripVertical aria-hidden="true" size={16} />
    </button>
  );
  return createElement(tag, {
    ...rest,
    ref: (node: HTMLElement | null) => { setNodeRef(node); ref?.(node); },
    className: [className, dragging ? "is-dragging" : ""].filter(Boolean).join(" ") || undefined,
    style: { transform: CSS.Transform.toString(transform), transition },
    "data-sortable-row": "",
    "data-dragging": dragging ? "true" : undefined,
    "data-drop-target": dropTarget ?? undefined,
  }, children(handle));
}

export function SortableList<T>({ items, getId, getLabel, onReorder, renderItem, tag = "ol", rowTag = "li", className, rowProps }: SortableListProps<T>) {
  const contextId = useId();
  const ids = items.map(getId);
  const [active, setActive] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const snapshot = useRef<{ ids: string[]; labels: string[] }>({ ids: [], labels: [] });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const describe = (id: string | number | undefined) => {
    const index = snapshot.current.ids.indexOf(String(id));
    return { label: snapshot.current.labels[index] ?? String(id), position: index + 1, count: snapshot.current.ids.length };
  };
  const announcements: Announcements = {
    onDragStart({ active }) {
      const { label, position, count } = describe(active.id);
      return `Picked up ${label}. It is in position ${position} of ${count}. Use the arrow keys to move it, space to drop it, or escape to cancel.`;
    },
    onDragOver({ active, over }) {
      const { label } = describe(active.id);
      // Lifting reports the item over itself; keep the "Picked up" message until it moves.
      if (over && over.id === active.id) return undefined;
      if (!over) return `${label} is no longer over the list.`;
      return `${label} is now in position ${describe(over.id).position} of ${describe(over.id).count}.`;
    },
    onDragEnd({ active, over }) {
      const { label, position, count } = describe(active.id);
      const target = over ? describe(over.id).position : position;
      return `${label} dropped in position ${target} of ${count}.`;
    },
    onDragCancel({ active }) {
      const { label, position, count } = describe(active.id);
      return `Reordering cancelled. ${label} returned to position ${position} of ${count}.`;
    },
  };
  function start(event: DragStartEvent) {
    snapshot.current = { ids, labels: items.map((item, index) => getLabel(item, index)) };
    setActive(String(event.active.id));
    setOver(String(event.active.id));
  }
  function move(event: DragOverEvent) {
    setOver(event.over ? String(event.over.id) : null);
  }
  function end(event: DragEndEvent) {
    const from = ids.indexOf(String(event.active.id));
    const to = event.over ? ids.indexOf(String(event.over.id)) : -1;
    setActive(null);
    setOver(null);
    if (from < 0 || to < 0 || from === to) return;
    onReorder(arrayMove([...items], from, to), items[from]!, from, to);
  }
  const activeIndex = active === null ? -1 : ids.indexOf(active);
  const overIndex = over === null ? -1 : ids.indexOf(over);
  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      accessibility={{ announcements, screenReaderInstructions: { draggable: instructions } }}
      onDragStart={start}
      onDragOver={move}
      onDragEnd={end}
      onDragCancel={() => { setActive(null); setOver(null); }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {createElement(tag, { className }, items.map((item, index) => {
          const id = ids[index]!;
          const dropTarget = activeIndex >= 0 && overIndex === index && overIndex !== activeIndex ? (overIndex < activeIndex ? "before" : "after") : null;
          return (
            <SortableRow key={id} id={id} label={getLabel(item, index)} tag={rowTag} dragging={activeIndex === index} dropTarget={dropTarget}
              rowProps={rowProps?.(item, index) ?? {}}>
              {handle => renderItem(item, index, handle)}
            </SortableRow>
          );
        }))}
      </SortableContext>
    </DndContext>
  );
}
