import { del, get, put } from '@vercel/blob'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type StoredFile = { pathname: string; url: string }

function usesBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

function localRoot() {
  return process.env.LOCAL_UPLOAD_DIR ? path.resolve(process.env.LOCAL_UPLOAD_DIR) : path.join(process.cwd(), '.data', 'uploads')
}

function resolveLocal(pathname: string) {
  const normalized = pathname.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0')) throw new Error('Invalid storage path.')
  const parts = normalized.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) throw new Error('Invalid storage path.')
  const root = localRoot()
  const absolute = path.resolve(root, normalized)
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  if (!absolute.startsWith(prefix)) throw new Error('Invalid storage path.')
  return absolute
}

function contentTypeFromPathname(pathname: string) {
  const extension = path.extname(pathname).toLowerCase()
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

export async function storeFile(pathname: string, bytes: Uint8Array, contentType: string): Promise<StoredFile> {
  if (usesBlob()) {
    const blob = await put(pathname, Buffer.from(bytes), { access: 'private', addRandomSuffix: false, contentType })
    return { pathname: blob.pathname, url: blob.url }
  }
  const absolute = resolveLocal(pathname)
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, bytes)
  return { pathname, url: '' }
}

export async function readStoredFile(pathname: string): Promise<{ bytes: Uint8Array; contentType: string; etag: string } | null> {
  if (usesBlob()) {
    const result = await get(pathname, { access: 'private' })
    if (!result || result.statusCode === 304) return null
    const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer())
    return { bytes, contentType: result.blob.contentType || contentTypeFromPathname(pathname), etag: result.blob.etag ?? '' }
  }
  try {
    const bytes = new Uint8Array(await readFile(resolveLocal(pathname)))
    return { bytes, contentType: contentTypeFromPathname(pathname), etag: '' }
  } catch {
    return null
  }
}

export async function deleteStoredFile(file: { pathname: string; url?: string }) {
  if (usesBlob()) {
    await del(file.url || file.pathname)
    return
  }
  await rm(resolveLocal(file.pathname), { force: true })
}
