import { IconArrowRight, IconFolder, IconMinus, IconPencil, IconPlus } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { fileTreeSchema } from '@visualplan/core'
import { decodeJson, validateProps } from './validate.js'

interface FileTreeProps {
  files: unknown
}

const MARKER: Record<string, ReactNode> = {
  add: <IconPlus size={15} stroke={2.5} />,
  modify: <IconPencil size={14} stroke={2} />,
  delete: <IconMinus size={15} stroke={2.5} />,
  move: <IconArrowRight size={15} stroke={2} />,
}

interface DirNode {
  dirs: Map<string, DirNode>
  files: Array<{ name: string; change: string }>
}

function emptyDir(): DirNode {
  return { dirs: new Map(), files: [] }
}

/** Group flat `{path}` entries into a nested directory tree. */
function buildTree(files: Array<{ path: string; change: string }>): DirNode {
  const root = emptyDir()
  for (const { path, change } of files) {
    const segments = path.split('/').filter(Boolean)
    let node = root
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      if (segment === undefined) continue
      let next = node.dirs.get(segment)
      if (!next) {
        next = emptyDir()
        node.dirs.set(segment, next)
      }
      node = next
    }
    node.files.push({ name: segments[segments.length - 1] ?? path, change })
  }
  return root
}

/** Collapse a chain of single-child directories (src -> src/api -> ...) into one label. */
function collapse(name: string, node: DirNode): { label: string; node: DirNode } {
  let label = name
  let current = node
  while (current.dirs.size === 1 && current.files.length === 0) {
    const entry = current.dirs.entries().next().value
    if (!entry) break
    label = `${label}/${entry[0]}`
    current = entry[1]
  }
  return { label, node: current }
}

function renderDir(node: DirNode, depth: number): ReactNode[] {
  const rows: ReactNode[] = []
  for (const name of [...node.dirs.keys()].sort()) {
    const child = node.dirs.get(name)
    if (!child) continue
    const collapsed = collapse(name, child)
    rows.push(
      <li
        key={`dir:${depth}:${collapsed.label}`}
        className='vp-filetree__row vp-filetree__row--dir'
        style={{ paddingLeft: `${depth * 1.15}rem` }}
      >
        <IconFolder size={15} stroke={2} className='vp-filetree__folder' aria-hidden='true' />
        <span className='vp-filetree__dir'>{collapsed.label}/</span>
      </li>,
    )
    rows.push(...renderDir(collapsed.node, depth + 1))
  }
  for (const file of node.files) {
    rows.push(
      <li
        key={`file:${depth}:${file.name}`}
        className='vp-filetree__row'
        data-change={file.change}
        style={{ paddingLeft: `${depth * 1.15}rem` }}
      >
        <span className='vp-filetree__marker' aria-hidden='true'>
          {MARKER[file.change]}
        </span>
        <span className='vp-filetree__name'>{file.name}</span>
        <span className='vp-filetree__change'>{file.change}</span>
      </li>,
    )
  }
  return rows
}

/** A nested directory tree of file changes with add/modify/delete/move markers. */
export function FileTree(props: FileTreeProps) {
  const { files } = validateProps('FileTree', fileTreeSchema, { files: decodeJson(props.files) })
  return <ul className='vp-filetree'>{renderDir(buildTree(files), 0)}</ul>
}
