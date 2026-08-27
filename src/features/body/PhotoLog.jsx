import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Lock, Trash2 } from 'lucide-react'
import {
  POSES,
  listPhotos,
  uploadPhoto,
  signedUrl,
  deletePhoto,
  comparablePairs,
} from '../../data/photos.js'
import { toDateString, formatShortDate } from '../../data/dates.js'
import { EmptyState, ScienceNote } from '../../components/ui.jsx'

/**
 * Progress photos, kept private.
 *
 * The scale measures body fat by bioimpedance, which follows hydration as much
 * as tissue — a reading that moved 1.6 points in two days is mostly water. A
 * photograph has no such problem, and over sixteen weeks it is the less
 * arguable record of the two.
 *
 * Everything visible here is deliberately quiet about it: images load through
 * short-lived signed URLs, never a public link, and no thumbnail is fetched
 * until the rider asks to see it. Nothing on this screen reaches the exported
 * study, the printable report or the share card.
 */

/**
 * One image, fetched only when it is going to be shown.
 *
 * Signed URLs expire, so this holds one for the life of the component rather
 * than storing it anywhere. Closing the screen and coming back mints a fresh
 * one, which is the intended behaviour rather than a limitation.
 */
function Photo({ photo, onDelete }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    signedUrl(photo.storage_path)
      .then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [photo.storage_path])

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '3 / 4',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
        }}
      >
        {url && (
          <img
            src={url}
            alt={`${photo.pose} view, ${formatShortDate(photo.taken_on)}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {failed && (
          <span
            className="muted"
            style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 'var(--text-xs)' }}
          >
            Could not load
          </span>
        )}
      </div>

      <figcaption
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--text-xs)',
        }}
      >
        <span className="muted">
          {formatShortDate(photo.taken_on)} · {photo.pose}
        </span>
        {onDelete && (
          <button
            type="button"
            className="btn"
            onClick={() => onDelete(photo)}
            aria-label={`Delete ${photo.pose} photo from ${formatShortDate(photo.taken_on)}`}
            style={{ padding: 6, minHeight: 0, background: 'none', border: 'none' }}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </figcaption>
    </figure>
  )
}

export default function PhotoLog({ showToast }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pose, setPose] = useState('front')
  const [takenOn, setTakenOn] = useState(() => toDateString())
  const [showAll, setShowAll] = useState(false)
  const fileRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      setPhotos(await listPhotos())
    } catch {
      // A failure here is almost always being offline; the log is not the
      // reason the rider opened this screen, so it fails quietly.
      setPhotos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusy(true)
    try {
      await uploadPhoto({ file, takenOn, pose })
      await refresh()
      showToast?.('Photo saved privately — location data removed')
    } catch (error) {
      showToast?.(String(error.message ?? error), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(photo) {
    if (!window.confirm(`Delete the ${photo.pose} photo from ${formatShortDate(photo.taken_on)}?`)) {
      return
    }
    try {
      await deletePhoto(photo)
      await refresh()
      showToast?.('Photo deleted')
    } catch (error) {
      showToast?.(String(error.message ?? error), 'error')
    }
  }

  const pairs = comparablePairs(photos)
  const visible = showAll ? photos : photos.slice(0, 6)

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Progress photos</h3>
        <span
          className="muted"
          style={{ fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Lock size={12} aria-hidden="true" /> Private
        </span>
      </div>

      <ScienceNote title="Why photos beat the scale here">
        Your scale reads body fat by bioimpedance, which tracks hydration as much as tissue — which
        is why it moved 1.6 points in two days. A photograph does not drift. Shoot the same three
        poses every fortnight, first thing in the morning, same spot and same light, and week
        sixteen answers the question on its own.
      </ScienceNote>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 130px', minWidth: 0 }}>
          <label htmlFor="photo-date" style={{ fontSize: 'var(--text-xs)' }}>
            Date
          </label>
          <input
            id="photo-date"
            type="date"
            value={takenOn}
            max={toDateString()}
            onChange={(e) => setTakenOn(e.target.value)}
          />
        </div>

        <div style={{ flex: '1 1 130px', minWidth: 0 }}>
          <label htmlFor="photo-pose" style={{ fontSize: 'var(--text-xs)' }}>
            Pose
          </label>
          <select id="photo-pose" value={pose} onChange={(e) => setPose(e.target.value)}>
            {POSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        <Camera size={16} aria-hidden="true" /> {busy ? 'Saving…' : 'Add photo'}
      </button>

      {/* Said plainly, next to the button that does it. A rider deciding
          whether to put photographs of their body into an app deserves to
          know what happens to them without going looking. */}
      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
        Stored in a private bucket only your account can open. Location and camera data are stripped
        from every image before it leaves your phone, and photos never appear in the exported study,
        the printable report or the share card.
      </p>

      {pairs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>First against latest</h4>
          {pairs.map((pair) => (
            <div key={pair.pose}>
              <p className="muted" style={{ margin: '0 0 6px', fontSize: 'var(--text-xs)' }}>
                {pair.label} · {formatShortDate(pair.first.taken_on)} →{' '}
                {formatShortDate(pair.latest.taken_on)}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Photo photo={pair.first} />
                <Photo photo={pair.latest} />
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          Loading…
        </p>
      ) : photos.length === 0 ? (
        <EmptyState>
          No photos yet. Front, side and back — relaxed, not flexed — every two weeks. The relaxed
          shot is the honest one, because a flexed comparison drifts as the flexing improves.
        </EmptyState>
      ) : (
        <>
          <h4 style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>
            All photos <span className="muted">({photos.length})</span>
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {visible.map((photo) => (
              <Photo key={photo.id} photo={photo} onDelete={handleDelete} />
            ))}
          </div>
          {photos.length > visible.length && (
            <button type="button" className="btn" onClick={() => setShowAll(true)}>
              Show all {photos.length}
            </button>
          )}
        </>
      )}
    </section>
  )
}
