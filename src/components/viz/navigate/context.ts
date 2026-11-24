/** What every variant gets from the page: the collection, the navigator, layout facts. */
import type { ComputedRef, InjectionKey, Ref } from 'vue'

import type { LoadedArticle } from '../host/loadArticle'
import type { Collection } from './events'
import type { Occurrence } from './occurrences'
import type { Navigator } from './useNavigator'

export interface NavContext {
  collection: Collection
  article: LoadedArticle
  nav: Navigator
  /** Dates need an era on every label (the fixture spans BCE and CE). */
  era: boolean
  /** Viewport width class: 'wide' leaves room for a margin column beside the full reading width. */
  width: Ref<'narrow' | 'medium' | 'wide'>
  skin: ComputedRef<'desktop' | 'mobile'>
  /** Dated occurrences with their linked names (pass 2); a superset of the collection's events. */
  occurrences: Occurrence[]
  articleId: 'frank-gehry' | 'bilbao' | 'test-fixture'
  variant: string
}

export const NAV: InjectionKey<NavContext> = Symbol('timeline-navigation')
