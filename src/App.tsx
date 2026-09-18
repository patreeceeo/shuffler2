import { useEffect } from 'react'
import { useRotationState } from './state/useRotationState'
import { EMPTY_STATE, normalizeSlots } from './state/schema'
import { derive, toTextTable } from './lib/schedule'
import { shuffle } from './lib/shuffle'
import { formatSlot } from './lib/dates'
import NameList from './components/NameList'
import RecurrenceBuilder from './components/RecurrenceBuilder'
import ScheduleTable from './components/ScheduleTable'
import ShareBar from './components/ShareBar'
import SlotList from './components/SlotList'
import Toolbar from './components/Toolbar'

export default function App() {
  const { state, ready, corrupted, dismissCorrupted, update, shareUrl } =
    useRotationState()
  const schedule = derive(state)

  // <title> follows the rotation title, so a tab full of shared links stays legible.
  // In an effect, not during render: writing document.title while rendering is a
  // Rules-of-React violation the compiler's lint rules reject.
  const trimmedTitle = state.title.trim()
  useEffect(() => {
    document.title = trimmedTitle.length > 0 ? `${trimmedTitle} — Shuffler` : 'Shuffler'
  }, [trimmedTitle])

  return (
    <main className="container app">
      <Toolbar
        title={state.title}
        onTitleChange={(title) => {
          update((prev) => ({ ...prev, title }))
        }}
        onShuffle={() => {
          // Discrete action: pushState, so the browser back button is undo (§4.1).
          update((prev) => ({ ...prev, names: shuffle(prev.names) }), 'push')
        }}
        onReset={() => {
          update(EMPTY_STATE, 'push')
        }}
        canShuffle={state.names.length > 1}
      />

      {corrupted && (
        <article className="notice" role="status">
          <p>
            That link looked corrupted, so this started you with a blank rotation. The
            original link may have been truncated on its way to you.
          </p>
          <button type="button" className="secondary" onClick={dismissCorrupted}>
            Dismiss
          </button>
        </article>
      )}

      <div className="panels">
        <NameList
          names={state.names}
          groupSize={state.groupSize}
          onNamesChange={(names) => {
            update((prev) => ({ ...prev, names }))
          }}
          onGroupSizeChange={(groupSize) => {
            update((prev) => ({ ...prev, groupSize }))
          }}
        />

        <div className="when-panel">
          <RecurrenceBuilder
            slotCount={state.slots.length}
            onGenerate={(slots) => {
              // Append and de-duplicate; generate never wipes what is there (§5).
              update(
                (prev) => ({ ...prev, slots: normalizeSlots([...prev.slots, ...slots]) }),
                'push',
              )
            }}
            onAddSlot={(slot) => {
              update((prev) => ({
                ...prev,
                slots: normalizeSlots([...prev.slots, slot]),
              }))
            }}
          />
          <SlotList
            slots={state.slots}
            onSlotsChange={(slots, discrete) => {
              update(
                (prev) => ({ ...prev, slots: normalizeSlots(slots) }),
                discrete === true ? 'push' : 'replace',
              )
            }}
          />
        </div>

        <ScheduleTable
          schedule={schedule}
          hasNames={state.names.length > 0}
          hasSlots={state.slots.length > 0}
        />
      </div>

      <ShareBar
        url={ready ? shareUrl : ''}
        textTable={toTextTable(state, schedule, formatSlot)}
      />
    </main>
  )
}
