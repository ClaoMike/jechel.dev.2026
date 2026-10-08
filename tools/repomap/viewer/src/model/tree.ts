/** The explorer's folder tree, built from a list of repository paths. Pure. */

/** A folder of the explorer's tree. */
export interface Folder {
  name: string
  path: string
  folders: Map<string, Folder>
  files: string[]
  count: number
}

/** Files → a folder tree, each folder with the number of files under it. */
export function buildTree(files: readonly string[]): Folder {
  const root: Folder = { name: '', path: '', folders: new Map(), files: [], count: 0 }
  for (const file of files) {
    const parts = file.split('/')
    let folder = root
    folder.count++
    for (let i = 0; i < parts.length - 1; i++) {
      let next = folder.folders.get(parts[i])
      if (!next) {
        next = { name: parts[i], path: parts.slice(0, i + 1).join('/'), folders: new Map(), files: [], count: 0 }
        folder.folders.set(parts[i], next)
      }
      next.count++
      folder = next
    }
    folder.files.push(file)
  }
  return root
}
