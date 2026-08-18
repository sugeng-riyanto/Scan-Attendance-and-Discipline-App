/**
 * Minimal line-level diff for T&C version comparison.
 * Returns an array of diff lines tagged as + / - / = (unchanged).
 */

export type DiffLine = { tag: '+' | '-' | '='; text: string }

/** LCS-based longest common subsequence diff (Myers-style, simplified). */
function lcs(a: string[], b: string[]): number[][] {
  const n = a.length, m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const dp = lcs(a, b)

  const result: DiffLine[] = []
  let i = a.length, j = b.length
  const stack: DiffLine[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ tag: '=', text: a[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ tag: '+', text: b[j - 1] })
      j--
    } else {
      stack.push({ tag: '-', text: a[i - 1] })
      i--
    }
  }

  for (let k = stack.length - 1; k >= 0; k--) result.push(stack[k])
  return result
}

/** Count added and removed lines in a diff. */
export function diffStats(diff: DiffLine[]): { added: number; removed: number; unchanged: number } {
  let added = 0, removed = 0, unchanged = 0
  for (const line of diff) {
    if (line.tag === '+') added++
    else if (line.tag === '-') removed++
    else unchanged++
  }
  return { added, removed, unchanged }
}
