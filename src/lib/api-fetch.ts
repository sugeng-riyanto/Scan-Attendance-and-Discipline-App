export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Gagal menghubungi server' }))
    throw new Error(data.error || 'Terjadi kesalahan')
  }
  return res.json()
}
