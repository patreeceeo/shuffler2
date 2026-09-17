import { useRotationState } from './state/useRotationState'
import { EMPTY_STATE } from './state/schema'
import NameList from './components/NameList'
import ShareBar from './components/ShareBar'
import Toolbar from './components/Toolbar'

export default function App() {
  const { state, ready, corrupted, dismissCorrupted, update, shareUrl } =
    useRotationState()

  return (
    <main className="container app">
      <Toolbar
        title={state.title}
        onTitleChange={(title) => {
          update((prev) => ({ ...prev, title }))
        }}
        onShuffle={() => {
          /* wired up in M4 */
        }}
        onReset={() => {
          update(EMPTY_STATE, 'push')
        }}
        canShuffle={false}
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
      </div>

      <ShareBar url={ready ? shareUrl : ''} textTable={state.names.join('\n')} />
    </main>
  )
}
