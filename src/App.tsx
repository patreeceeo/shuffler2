import { useEffect } from 'react'
import { Tabs } from '@base-ui/react/tabs'
import { useRotationState } from './state/useRotationState'
import { EMPTY_STATE, normalizeSlots } from './state/schema'
import { derive, toTextTable } from './lib/schedule'
import { shuffle } from './lib/shuffle'
import { formatSlot } from './lib/dates'
import NameList from './components/NameList'
import RecurrenceBuilder from './components/RecurrenceBuilder'
import ScheduleTable from './components/ScheduleTable'
import ShareBar, { URL_WARN_LENGTH } from './components/ShareBar'
import SlotList from './components/SlotList'
import Toolbar from './components/Toolbar'
import Help from './components/Help'

export default function App() {
  const { state, ready, corrupted, dismissCorrupted, update, shareUrl } =
    useRotationState()
  const schedule = derive(state)
  const liveUrl = ready ? shareUrl : ''
  /**
   * The length warning is the one thing that must not be buried by moving Share into a tab:
   * a link long enough to be mangled has to announce itself from the tab strip.
   */
  const urlTooLong = liveUrl.length > URL_WARN_LENGTH

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

      {/*
        The schedule is the answer, so it sits directly under the toolbar where the eye
        lands after hitting Shuffle. The two builders that feed it are secondary, and go
        below in tabs so only one is on screen at a time.
      */}
      <ScheduleTable
        schedule={schedule}
        hasNames={state.names.length > 0}
        hasSlots={state.slots.length > 0}
      />

      <Tabs.Root defaultValue="names" className="builder-tabs">
        <Tabs.List className="builder-tabs-list" aria-label="Rotation inputs">
          <Tabs.Tab value="names" className="builder-tab">
            Names <span className="tab-count">{state.names.length}</span>
          </Tabs.Tab>
          <Tabs.Tab value="dates" className="builder-tab">
            Dates <span className="tab-count">{state.slots.length}</span>
          </Tabs.Tab>
          <Tabs.Tab value="share" className="builder-tab">
            Share
            {urlTooLong && (
              <span className="tab-warn" role="img" aria-label="link may be too long">
                ⚠
              </span>
            )}
          </Tabs.Tab>
          {/* No count badge: neither Share nor Help is one of the lists being built. */}
          <Tabs.Tab value="help" className="builder-tab">
            Help
          </Tabs.Tab>
          <Tabs.Indicator className="builder-tab-indicator" />
        </Tabs.List>

        {/*
          keepMounted: the recurrence builder holds unsubmitted form state (start date,
          interval, count). Unmounting it on a tab switch would silently discard a
          half-filled form.
        */}
        <Tabs.Panel value="names" keepMounted className="builder-panel">
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
        </Tabs.Panel>

        <Tabs.Panel value="dates" keepMounted className="builder-panel">
          <div className="when-panel">
            <RecurrenceBuilder
              slotCount={state.slots.length}
              onGenerate={(slots) => {
                // Append and de-duplicate; generate never wipes what is there (§5).
                update(
                  (prev) => ({
                    ...prev,
                    slots: normalizeSlots([...prev.slots, ...slots]),
                  }),
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
        </Tabs.Panel>

        {/*
          Not keepMounted: the only state in here is the transient "Copied" flash, and
          letting it unmount resets that, which is what you want on re-entry.
        */}
        <Tabs.Panel value="share" className="builder-panel">
          <ShareBar
            url={liveUrl}
            textTable={toTextTable(state, schedule, formatSlot)}
          />
        </Tabs.Panel>

        {/* Static prose, so there is no form state to preserve — let it unmount. */}
        <Tabs.Panel value="help" className="builder-panel">
          <Help />
        </Tabs.Panel>
      </Tabs.Root>
    </main>
  )
}
