import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { Project, ts } from 'ts-morph'
import { negate } from '../plugins/extract-ts/conditions.ts'
import { extractProject, type ExtractResult } from '../plugins/extract-ts/extract.ts'
import type { FileEntry, RenderCase } from '../src/shared/types.ts'

/** A small MVVM + Redux Toolkit app, in memory. */
const FILES: Record<string, string> = {
  'src/services/api.ts': `
    import axios from 'axios'
    const http = axios.create()
    export const api = {
      books: {
        list: () => http.get('/api/books'),
        save: (book: unknown) => http.post('/api/books', book),
      },
    }`,
  'src/store/baseApi.ts': `
    import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
    export const baseApi = createApi({ baseQuery: fakeBaseQuery(), endpoints: () => ({}) })`,
  'src/store/booksApi.ts': `
    import { api } from '../services/api'
    import { baseApi } from './baseApi'
    export const booksApi = baseApi.injectEndpoints({
      endpoints: (build) => ({
        listBooks: build.query({ queryFn: async () => ({ data: await api.books.list() }) }),
        saveBook: build.mutation({ queryFn: async (book) => ({ data: await api.books.save(book) }) }),
      }),
    })
    export const { useListBooksQuery, useSaveBookMutation } = booksApi`,
  'src/store/shelfSlice.ts': `
    import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
    import { api } from '../services/api'
    export const loadShelf = createAsyncThunk('shelf/load', () => api.books.list())
    export const shelfSlice = createSlice({
      name: 'shelf',
      initialState: { open: false },
      reducers: { opened(state) { state.open = true } },
      extraReducers: (builder) => builder.addCase(loadShelf.fulfilled, () => {}),
    })
    export const { opened } = shelfSlice.actions`,
  'src/store/listeners.ts': `
    import { createListenerMiddleware } from '@reduxjs/toolkit'
    import { baseApi } from './baseApi'
    import { opened } from './shelfSlice'
    export const listeners = createListenerMiddleware()
    const startListening = listeners.startListening.withTypes()
    startListening({ actionCreator: opened, effect: (_, { dispatch }) => dispatch(baseApi.util.resetApiState()) })`,
  'src/Books.viewModel.ts': `
    import { useListBooksQuery } from './store/booksApi'
    import { opened } from './store/shelfSlice'
    export function useBooksViewModel() {
      const { data } = useListBooksQuery()
      return { data, open: () => opened() }
    }`,
  'src/Books.tsx': `
    import { useBooksViewModel } from './Books.viewModel'
    export function Books() {
      const vm = useBooksViewModel()
      return <button onClick={vm.open}>{String(vm.data)}</button>
    }`,
}

describe('TypeScript extractor: Redux Toolkit', () => {
  let result: ExtractResult
  const node = (label: string) => {
    const found = result.nodes.find((n) => n.label === label)
    assert.ok(found, `node ${label}`)
    return found
  }
  const hasEdge = (from: string, type: string, to: string) => result.edges.some((e) => e.from === node(from).id && e.type === type && e.to === node(to).id)

  before(() => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, strict: true } })
    const files: FileEntry[] = []
    for (const [path, text] of Object.entries(FILES)) {
      project.createSourceFile(`/repo/${path}`, text)
      files.push({ path, layer: path.endsWith('.tsx') ? 'views' : path.endsWith('.viewModel.ts') ? 'viewmodels' : 'frontend', role: 'production', roleReason: 'test' })
    }
    result = extractProject(project, files, '/repo', { apiPrefixes: ['/api'] })
  })

  it('finds query APIs, their generated hooks, slices, actions, thunks and listener middleware', () => {
    assert.equal(node('baseApi').kind, 'store-api')
    assert.equal(node('booksApi').kind, 'store-api')
    assert.equal(node('useListBooksQuery').kind, 'hook')
    assert.equal(node('useListBooksQuery').parent, node('booksApi').id)
    assert.equal(node('useSaveBookMutation').attrs?.endpoint, 'saveBook')
    assert.equal(node('shelfSlice').kind, 'slice')
    assert.equal(node('opened').kind, 'action')
    assert.equal(node('opened').parent, node('shelfSlice').id)
    assert.equal(node('loadShelf').kind, 'thunk')
    assert.equal(node('listeners').kind, 'middleware')
  })

  it('links view → view model → hook → API call, each on its own layer', () => {
    assert.ok(hasEdge('Books', 'uses', 'useBooksViewModel'))
    assert.ok(hasEdge('useBooksViewModel', 'uses', 'useListBooksQuery'))
    assert.ok(hasEdge('useListBooksQuery', 'calls', 'api.books.list'))
    assert.ok(hasEdge('useSaveBookMutation', 'calls', 'api.books.save'))
    assert.ok(!hasEdge('useListBooksQuery', 'calls', 'api.books.save'), 'a hook only reaches its own endpoint')
    assert.deepEqual([node('Books'), node('useBooksViewModel'), node('useListBooksQuery')].map((n) => n.id.split(':')[0]), ['views', 'viewmodels', 'frontend'])
  })

  it('follows library members back to our own declarations', () => {
    assert.ok(hasEdge('booksApi', 'uses', 'baseApi'), 'baseApi.injectEndpoints')
    assert.ok(hasEdge('shelfSlice', 'uses', 'loadShelf'), 'loadShelf.fulfilled in extraReducers')
    assert.ok(hasEdge('loadShelf', 'calls', 'api.books.list'))
    assert.ok(hasEdge('listeners', 'uses', 'opened'), 'listeners.startListening through a withTypes alias')
    assert.ok(hasEdge('listeners', 'uses', 'baseApi'), 'baseApi.util.resetApiState()')
  })
})

/** A page that shows different children depending on its state. */
const STATES: Record<string, string> = {
  'src/useThings.ts': `
    export function useThings() { return { status: 'loading' as 'loading' | 'error' | 'loaded', items: [] as string[] } }`,
  'src/Parts.tsx': `
    export function Skeleton() { return <i /> }
    export function Failed() { return <b /> }
    export function Thing({ name }: { name: string }) { return <span>{name}</span> }
    export function Empty() { return <p /> }
    export function Frame({ children }: { children?: unknown }) { return <div>{children as never}</div> }`,
  'src/Page.tsx': `
    import { useThings } from './useThings'
    import { Empty, Failed, Frame, Skeleton, Thing } from './Parts'
    export function Page({ compact }: { compact: boolean }) {
      const query = useThings()
      const state = query
      if (state.status === 'error') return <Failed />
      return (
        <Frame>
          {state.status === 'loading' && <Skeleton />}
          {state.items.length > 0 ? state.items.map((name) => <Thing key={name} name={name} />) : !compact && <Empty />}
        </Frame>
      )
    }`,
}

describe('TypeScript extractor: when a component renders a child', () => {
  let result: ExtractResult
  const id = (label: string) => result.nodes.find((n) => n.label === label)!.id
  const when = (child: string) => result.edges.find((e) => e.from === id('Page') && e.to === id(child) && e.type === 'renders')?.attrs?.when as RenderCase[]

  before(() => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, strict: true } })
    const files: FileEntry[] = Object.entries(STATES).map(([path, text]) => {
      project.createSourceFile(`/repo/${path}`, text)
      return { path, layer: 'frontend', role: 'production', roleReason: 'test' }
    })
    result = extractProject(project, files, '/repo', { apiPrefixes: ['/api'] })
  })

  it('records the condition, from && and ?: and if … return', () => {
    assert.deepEqual(when('Failed').map((c) => c.if), [["state.status === 'error'"]])
    assert.deepEqual(when('Skeleton').map((c) => c.if), [["state.status !== 'error'", "state.status === 'loading'"]], 'an early return before it is negated')
    assert.deepEqual(when('Empty').map((c) => c.if), [["state.status !== 'error'", '!(state.items.length > 0)', '!compact']])
    assert.deepEqual(when('Frame').map((c) => c.if), [["state.status !== 'error'"]])
  })

  it('says when a child is rendered for each item of a list', () => {
    assert.equal(when('Thing')[0].each, 'state.items')
    assert.deepEqual(when('Thing')[0].if, ["state.status !== 'error'", 'state.items.length > 0'])
  })

  it('traces what a condition reads back to the hook or prop it comes from', () => {
    assert.deepEqual(when('Skeleton')[0].reads, [{ name: 'state', from: 'useThings' }])
    assert.deepEqual(when('Empty')[0].reads, [
      { name: 'state', from: 'useThings' },
      { name: 'compact', from: 'a prop' },
    ])
  })
})

describe('negate', () => {
  it('reads like code', () => {
    assert.equal(negate('open'), '!open')
    assert.equal(negate('!open'), 'open')
    assert.equal(negate("a === 'b'"), "a !== 'b'")
    assert.equal(negate('a && b'), '!(a && b)')
    assert.equal(negate('!(a && b)'), 'a && b')
  })
})
