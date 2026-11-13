import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DarkModeToggle } from './DarkModeToggle' 

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DarkModeToggle />
  </StrictMode>,
)
