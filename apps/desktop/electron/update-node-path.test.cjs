'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const mainSource = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8')

test('desktop updater PATH helper uses the VIGIL managed Node name consistently', () => {
  assert.match(mainSource, /function\s+vigilManagedNodePathEntries\s*\(/)
  assert.match(mainSource, /\.\.\.vigilManagedNodePathEntries\(\)/)
  assert.doesNotMatch(mainSource, /\bhermesManagedNodePathEntries\b/)
})
