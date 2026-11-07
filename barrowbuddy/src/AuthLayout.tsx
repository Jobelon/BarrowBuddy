import type { ReactNode } from 'react'
import exchangeMotion from './assets/auth-motion/exchange.webp'
import exchangeStill from './assets/auth-motion/exchange-still.webp'
import passMotion from './assets/auth-motion/student-pass.webp'
import passStill from './assets/auth-motion/student-pass-still.webp'

type Scene = 'exchange' | 'pass'

const scenes = {
  exchange: {
    label: 'Campus Exchange',
    title: 'Borrow what',
    accent: 'you need.',
    caption: 'Find what you need and lend what you can to fellow CIT students.',
    motion: exchangeMotion,
    still: exchangeStill,
  },
  pass: {
    label: 'CIT Student Pass',
    title: 'Join the',
    accent: 'campus exchange.',
    caption: 'Use your CIT email to join your campus borrowing community.',
    motion: passMotion,
    still: passStill,
  },
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h17m-4-4 4 4-4 4m5 6H4m4-4-4 4 4 4" />
        </svg>
      </span>
      <span>BorrowBuddy</span>
    </div>
  )
}

function ScenePanel({ scene }: { scene: Scene }) {
  const artwork = scenes[scene]

  return (
    <aside className="scene-panel" aria-label="Campus Exchange">
      <div className="scene-copy">
        <p className="scene-kicker">{artwork.label}</p>
        <p className="scene-title">{artwork.title} <span>{artwork.accent}</span></p>
        <p className="scene-description">{artwork.caption}</p>
      </div>
      <picture className="scene-art">
        <source media="(prefers-reduced-motion: reduce)" srcSet={artwork.still} />
        <img src={artwork.motion} width="630" height="297" alt="" />
      </picture>
    </aside>
  )
}

export function AuthLayout({ scene = 'exchange', children }: { scene?: Scene; children: ReactNode }) {
  return (
    <div className="auth-page">
      <main className="auth-card">
        <ScenePanel scene={scene} />
        <div className="auth-content">
          <Brand />
          {children}
        </div>
      </main>
    </div>
  )
}
