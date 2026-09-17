import { useAutoAnimate } from '@formkit/auto-animate/react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useId, useRef, type KeyboardEvent, type ClipboardEvent } from 'react'
import { MAX_GROUP_SIZE, MAX_NAMES } from '../state/schema'
import { insertNames, moveItem, splitPastedNames } from '../lib/names'

interface Props {
  names: string[]
  groupSize: number
  onNamesChange: (names: string[]) => void
  onGroupSizeChange: (groupSize: number) => void
}

/** Stable-enough row keys: names may repeat, so key by position plus value. */
function rowId(index: number): string {
  return `name-${String(index)}`
}

export default function NameList({
  names,
  groupSize,
  onNamesChange,
  onGroupSizeChange,
}: Props) {
  const [listRef] = useAutoAnimate<HTMLUListElement>()
  const inputs = useRef(new Map<number, HTMLInputElement>())
  const groupId = useId()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // KeyboardSensor gives space-to-lift, arrows-to-move, escape-to-cancel and the
    // screen-reader announcements for free (PLAN §10.1) — which is exactly the part a
    // hand-rolled Alt+arrow path would have skipped.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const focusRow = (index: number) => {
    requestAnimationFrame(() => {
      inputs.current.get(index)?.focus()
    })
  }

  const setName = (index: number, value: string) => {
    const next = [...names]
    next[index] = value
    onNamesChange(next)
  }

  const addRow = (at: number) => {
    if (names.length >= MAX_NAMES) return
    onNamesChange(insertNames(names, at, ['']))
    focusRow(at)
  }

  const removeRow = (index: number) => {
    onNamesChange(names.filter((_, i) => i !== index))
    focusRow(Math.max(0, index - 1))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addRow(index + 1)
    } else if (event.key === 'Backspace' && names[index] === '') {
      event.preventDefault()
      removeRow(index)
    } else if (event.key === 'ArrowDown' && index < names.length - 1) {
      event.preventDefault()
      focusRow(index + 1)
    } else if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault()
      focusRow(index - 1)
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    const text = event.clipboardData.getData('text/plain')
    if (!/[\r\n]/.test(text)) return
    event.preventDefault()
    const pasted = splitPastedNames(text)
    if (pasted.length === 0) return
    // Replace the row being pasted into when it is empty, otherwise insert after it.
    const isEmpty = (names[index] ?? '') === ''
    const without = isEmpty ? names.filter((_, i) => i !== index) : names
    const at = isEmpty ? index : index + 1
    onNamesChange(insertNames(without, at, pasted))
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = names.findIndex((_, i) => rowId(i) === active.id)
    const to = names.findIndex((_, i) => rowId(i) === over.id)
    if (from === -1 || to === -1) return
    onNamesChange(moveItem(names, from, to))
  }

  return (
    <section aria-labelledby="names-heading">
      <h2 id="names-heading">Names</h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={names.map((_, i) => rowId(i))}
          strategy={verticalListSortingStrategy}
        >
          <ul className="name-list" ref={listRef}>
            {names.map((name, index) => (
              <NameRow
                key={rowId(index)}
                id={rowId(index)}
                index={index}
                value={name}
                registerInput={(el) => {
                  if (el) inputs.current.set(index, el)
                  else inputs.current.delete(index)
                }}
                onChange={(value) => {
                  setName(index, value)
                }}
                onKeyDown={(event) => {
                  onKeyDown(event, index)
                }}
                onPaste={(event) => {
                  onPaste(event, index)
                }}
                onRemove={() => {
                  removeRow(index)
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {names.length === 0 && (
        <p className="hint">
          No names yet. Add one — or paste a whole list at once, one name per line.
        </p>
      )}

      <button
        type="button"
        className="secondary"
        onClick={() => {
          addRow(names.length)
        }}
        disabled={names.length >= MAX_NAMES}
      >
        + Add name
      </button>

      <label htmlFor={groupId} className="group-size">
        People per slot
        <input
          id={groupId}
          type="number"
          min={1}
          max={MAX_GROUP_SIZE}
          value={groupSize}
          onChange={(event) => {
            const parsed = Number(event.target.value)
            if (!Number.isFinite(parsed)) return
            onGroupSizeChange(Math.min(MAX_GROUP_SIZE, Math.max(1, Math.round(parsed))))
          }}
        />
      </label>
    </section>
  )
}

interface RowProps {
  id: string
  index: number
  value: string
  registerInput: (el: HTMLInputElement | null) => void
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void
  onRemove: () => void
}

function NameRow({
  id,
  index,
  value,
  registerInput,
  onChange,
  onKeyDown,
  onPaste,
  onRemove,
}: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <li
      ref={setNodeRef}
      className="name-row"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        className="drag-handle"
        ref={setActivatorNodeRef}
        aria-label={`Reorder ${value === '' ? `row ${String(index + 1)}` : value}`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="row-number" aria-hidden="true">
        {index + 1}
      </span>
      <input
        ref={registerInput}
        type="text"
        value={value}
        placeholder="Name"
        aria-label={`Name ${String(index + 1)}`}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      <button
        type="button"
        className="secondary row-delete"
        onClick={onRemove}
        aria-label={`Delete ${value === '' ? `row ${String(index + 1)}` : value}`}
      >
        ×
      </button>
    </li>
  )
}
