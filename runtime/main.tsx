import Plan, { frontmatter } from 'virtual:plan'
import { mount } from './index.js'
import type { PlanMeta } from './Layout.js'

mount(Plan, (frontmatter ?? {}) as PlanMeta)
