import { Github } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { FCMSettingsDialog } from '@/components/FCMSettingsDialog'

const GITHUB_URL = 'https://github.com/davidamunga/pesamirror'
const BASE = typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/'

export default function Header() {
  return (
    <header className="sticky top-0 z-10 w-full border-b border-border py-3 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="max-w-lg mx-auto px-4 flex h-14 items-center justify-between">
        <h1 className="text-lg font-semibold font-display">
          <Link
            to="/"
            className="flex items-center gap-2 text-foreground hover:text-foreground/90"
          >
            <img src={`${BASE}logo.png`} alt="PesaMirror" className="size-10" />
            <span className="text-3xl">PesaMirror</span>
          </Link>
        </h1>
        <div className="flex items-center gap-1">
          <FCMSettingsDialog />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="View source on GitHub"
          >
            <Github className="size-6" />
          </a>
        </div>
      </div>
    </header>
  )
}
