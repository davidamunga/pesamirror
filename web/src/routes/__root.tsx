import { useEffect } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import Footer from '../components/Footer'
import Header from '../components/Header'

import appCss from '../styles.css?url'

const darkModeScript = `
(function() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
})();
`

function RegisterSw() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const base =
        typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/'
      navigator.serviceWorker.register(`${base}sw.js`).catch(() => {})
    }
  }, [])
  return null
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'PesaMirror' },
      { name: 'theme-color', content: '#fafafa', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'manifest',
        href: `/manifest.json`,
      },
    ],
    scripts: [{ id: 'dark-mode', children: darkModeScript }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        <RegisterSw />
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <Scripts />
      </body>
    </html>
  )
}

