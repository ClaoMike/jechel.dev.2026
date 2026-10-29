import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

// Feature-Sliced Design (https://fsd.how), checked by `npm run lint`: layers import only from the layers below
// (app → pages → widgets → features → entities → shared), slices of one layer don't import each other (entities may,
// through @x), and other slices are reached only through their public API (index.ts). Tests that span slices live in
// src/test/integration, outside the layers.
export default defineConfig([
  ...fsd.configs.recommended,
  // Relative imports inside a slice, @/<layer>/<slice> across slices.
  { rules: { 'fsd/import-locality': 'error' } },
  {
    // A feature under test (the Feature Testing tab) is used only there until it goes to visitors: it's still a
    // feature of its own, not part of that page.
    files: ['./src/features/work-with-me/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
])
