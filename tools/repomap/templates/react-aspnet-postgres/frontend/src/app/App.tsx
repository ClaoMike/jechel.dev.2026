import { Route, Routes } from 'react-router'
import { HomePage } from '@/pages/home'

/** The site's routes: one page slice each (src/pages/<page>). */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  )
}
