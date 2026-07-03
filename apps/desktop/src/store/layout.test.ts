import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $sidebarProjectPaths, addSidebarProjectPath, removeSidebarProjectPath } from './layout'

describe('layout project shortcuts', () => {
  beforeEach(() => {
    window.localStorage.clear()
    $sidebarProjectPaths.set([])
  })

  afterEach(() => {
    window.localStorage.clear()
    $sidebarProjectPaths.set([])
  })

  it('adds and removes project shortcuts without touching other entries', () => {
    addSidebarProjectPath('/work/alpha/')
    addSidebarProjectPath('/work/beta')
    addSidebarProjectPath('/work/alpha')

    expect($sidebarProjectPaths.get()).toEqual(['/work/alpha', '/work/beta'])

    removeSidebarProjectPath('/work/alpha/')

    expect($sidebarProjectPaths.get()).toEqual(['/work/beta'])
  })

  it('ignores removal requests for unknown projects', () => {
    addSidebarProjectPath('/work/alpha')

    removeSidebarProjectPath('/work/missing')

    expect($sidebarProjectPaths.get()).toEqual(['/work/alpha'])
  })
})
