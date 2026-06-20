import { fileTreeSchema } from '../shared/catalog.js'
import { validateProps } from './validate.js'

interface FileTreeProps {
  files: Array<{ path: string; change: string }>
}

const MARKER: Record<string, string> = {
  add: '+',
  modify: '~',
  delete: '-',
  move: '→',
}

/** A file-change map with add/modify/delete/move markers. */
export function FileTree(props: FileTreeProps) {
  const { files } = validateProps('FileTree', fileTreeSchema, props)
  return (
    <ul className='vp-filetree'>
      {files.map(file => (
        <li key={file.path} className='vp-filetree__row' data-change={file.change}>
          <span className='vp-filetree__marker' aria-hidden='true'>
            {MARKER[file.change]}
          </span>
          <code className='vp-filetree__path'>{file.path}</code>
          <span className='vp-filetree__change'>{file.change}</span>
        </li>
      ))}
    </ul>
  )
}
