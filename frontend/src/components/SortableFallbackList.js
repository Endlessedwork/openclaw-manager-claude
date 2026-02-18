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
          : 'bg-[#0c0c0e] border-zinc-800/60 hover:border-zinc-700'
      }`}
    >
      {canEdit && (
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 touch-none">
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <span className="text-xs text-zinc-500 font-mono w-6 text-right">#{index + 1}</span>
      <span className="flex-1 text-sm font-mono text-zinc-300 truncate">{label}</span>
      {canEdit && (
        <button onClick={() => onRemove(id)} className="text-zinc-600 hover:text-red-400 p-0.5">
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
    return <div className="text-center py-4 text-xs text-zinc-600">No fallbacks configured</div>;
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
