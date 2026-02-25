import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { AddToHomeScreenHint } from '../components/AddToHomeScreenHint'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'

import appCss from '../styles.css?url'

const darkModeScript = `
(function() {
  var stored = localStorage.getItem('theme');
  var dark;
  if (stored === 'dark') {
    dark = true;
  } else if (stored === 'light') {
    dark = false;
  } else {
    dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.documentElement.classList.toggle('dark', dark);
})();
`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'PesaMirror' },
      { name: 'theme-color', content: '#fafafa', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#18181b', media: '(prefers-color-scheme: dark)' },
      { property: 'og:image', content: '/ogimage.png' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' },
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
        <Header />
        <main className="flex-1 pb-28">
          <AddToHomeScreenHint />
          <Outlet />
        </main>
        <BottomNav />
        <Toaster position="top-center" />
        <Scripts />
      </body>
    </html>
  )
}

