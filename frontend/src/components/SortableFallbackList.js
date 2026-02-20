import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';

function SortableItem({ id, index, label, onRemove, canEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
        isDragging
          ? 'bg-orange-500/10 border-orange-500/30 shadow-lg'
          : 'bg-surface-card border-subtle hover:border-strong'
      }`}
    >
      {canEdit && (
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-theme-dimmed hover:text-theme-muted touch-none">
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <span className="text-xs text-theme-faint font-mono w-6 text-right">#{index + 1}</span>
      <span className="flex-1 text-sm font-mono text-theme-secondary truncate">{label}</span>
      {canEdit && (
        <button onClick={() => onRemove(id)} className="text-theme-dimmed hover:text-red-400 p-0.5">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default function SortableFallbackList({ items, onReorder, onRemove, canEdit }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);
      onReorder(arrayMove(items, oldIndex, newIndex));
    }
  };

  if (items.length === 0) {
    return <div className="text-center py-4 text-xs text-theme-dimmed">No fallbacks configured</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {items.map((id, index) => (
            <SortableItem key={id} id={id} index={index} label={id} onRemove={onRemove} canEdit={canEdit} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
