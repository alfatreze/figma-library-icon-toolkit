/** The id git gives a file: SHA-1 of "blob <bytes>\0" + content. Comparing it with the host's tree tells us what really changed. */
export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content)
  const head = new TextEncoder().encode(`blob ${body.length}\0`)
  const all = new Uint8Array(head.length + body.length)
  all.set(head, 0)
  all.set(body, head.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', all))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}
