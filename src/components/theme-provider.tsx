'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * next-themes provider wired to the `class` attribute, so Tailwind's
 * `@custom-variant dark` (`.dark *`) applies. Defaults to the user's system
 * preference; the toggle persists the choice in localStorage.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  )
}
