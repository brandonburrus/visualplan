import { CATALOG } from '../../runtime/shared/catalog.js'

/** `visualplan components` — print the component vocabulary cheat-sheet. */
export function runComponents(): void {
  const lines: string[] = [
    'VisualPlan components — use these directly in a plan .mdx (no imports):',
    '',
  ]
  for (const entry of CATALOG) {
    lines.push(`${entry.name}`)
    lines.push(`  ${entry.summary}`)
    const enums = Object.entries(entry.staticEnums)
    for (const [prop, values] of enums) {
      lines.push(`  ${prop}: ${values.join(' | ')}`)
    }
    lines.push('  example:')
    for (const exampleLine of entry.example.split('\n')) {
      lines.push(`    ${exampleLine}`)
    }
    lines.push('')
  }
  lines.push('Start the plan with a `# Title` heading. Do not use YAML frontmatter.')
  process.stdout.write(`${lines.join('\n')}\n`)
}
