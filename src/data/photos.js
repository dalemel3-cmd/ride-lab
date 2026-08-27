/**
 * Progress photos — the most sensitive data in the study.
 *
 * Three decisions shape everything here, and all three are about the rider
 * rather than the feature:
 *
 *   1. The bucket is private. There is no public URL for any of these, ever.
 *      Viewing one mints a signed URL that expires in minutes, and the storage
 *      policy checks the first path segment against auth.uid(), so a signed URL
 *      for someone else's photo cannot even be requested.
 *
 *   2. Metadata is stripped before upload, not after. A phone photo carries
 *      EXIF including GPS, and a progress photo is taken at home. Re-encoding
 *      through a canvas discards every tag — there is no metadata left to leak,
 *      whatever happens to the file later.
 *
 *   3. Nothing here reaches the case study export, the printable report or the
 *      share card. Those are documents made to be handed to other people; this
 *      is not.
 */

import { supabase } from '../supabaseClient.js'

export const BUCKET = 'body-photos'

/** Front, side and back. Comparing across poses measures the camera. */
export const POSES = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
]

/** Long edge, in pixels. Plenty for comparison; a 12 MP original is not. */
const MAX_EDGE = 1600

/** Signed URLs live long enough to look at and not much longer. */
const SIGNED_URL_TTL_SEC = 300

/**
 * Re-encode an image file, stripping every scrap of metadata.
 *
 * Drawing to a canvas and exporting keeps only pixels: EXIF, GPS coordinates,
 * device make and model, and the original timestamp are all discarded, because
 * none of them survive the trip through the bitmap. This is the privacy
 * guarantee, and doing it before upload rather than after is what makes it one
 * — a file that never had coordinates in it cannot lose them later.
 *
 * Downscaling to a 1600px long edge is a side benefit: a 4 MB phone photo
 * becomes a few hundred kilobytes, which matters when the study runs to a
 * hundred images.
 */
export async function stripMetadata(file, { maxEdge = MAX_EDGE, quality = 0.86 } = {}) {
  const bitmap = await createImageBitmap(file)

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Could not process that image.')
  return blob
}

/**
 * Upload one photo and record it.
 *
 * The path is `<user id>/<date>/<pose>-<timestamp>.jpg`. The leading user id is
 * not decoration — the storage policy reads it, so the layout of the path is
 * the access control.
 */
export async function uploadPhoto({ file, takenOn, pose, notes = null }) {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw new Error('Not signed in.')

  const clean = await stripMetadata(file)
  const path = `${userId}/${takenOn}/${pose}-${Date.now()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, clean, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('body_photos')
    .insert({ taken_on: takenOn, pose, storage_path: path, notes })
    .select()
    .single()

  if (error) {
    // Leave no orphan in the bucket if the row fails to write. An image with
    // no index entry is invisible to the app and still counts against quota.
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }

  return data
}

/** Every photo, newest first. Rows only — images are fetched on demand. */
export async function listPhotos() {
  const { data, error } = await supabase
    .from('body_photos')
    .select('*')
    .order('taken_on', { ascending: false })
    .order('pose', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * A short-lived URL for one photo.
 *
 * Deliberately not cached anywhere persistent. The URL is the capability, so
 * writing it to localStorage would turn a private photo into a link that
 * outlives the session that asked for it.
 */
export async function signedUrl(storagePath, expiresIn = SIGNED_URL_TTL_SEC) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error) throw error
  return data?.signedUrl ?? null
}

/** Remove the image and its row together. */
export async function deletePhoto(photo) {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([photo.storage_path])
  // A missing object is not a reason to keep a dead row pointing at it.
  if (storageError && !/not found/i.test(storageError.message ?? '')) throw storageError

  const { error } = await supabase.from('body_photos').delete().eq('id', photo.id)
  if (error) throw error
}

/**
 * The earliest and latest photo for each pose.
 *
 * The comparison the study actually wants: same pose, furthest apart in time.
 * Returns only poses with two distinct dates, because one photo is not a
 * before-and-after however much it might feel like a start.
 */
export function comparablePairs(photos = []) {
  const byPose = new Map()

  for (const photo of photos) {
    if (!byPose.has(photo.pose)) byPose.set(photo.pose, [])
    byPose.get(photo.pose).push(photo)
  }

  const pairs = []
  for (const { value, label } of POSES) {
    const group = (byPose.get(value) ?? []).slice().sort((a, b) => a.taken_on.localeCompare(b.taken_on))
    if (group.length < 2) continue

    const first = group[0]
    const latest = group[group.length - 1]
    if (first.taken_on === latest.taken_on) continue

    pairs.push({ pose: value, label, first, latest, count: group.length })
  }

  return pairs
}
