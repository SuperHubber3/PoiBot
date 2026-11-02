import assert from 'node:assert/strict'
import { test } from 'node:test'
import { razorState } from '../src/lib/state/razor.js'

test('recent speech permits only one concurrent boop', () => {
    razorState.razorCache = true
    const claim = razorState.claim()
    assert(claim)
    assert.equal(razorState.claim(), null)
    razorState.restore(claim)
    assert(razorState.claim())
    razorState.razorCache = false
})

test('a failed older boop cannot restore a newer, already-consumed speech token', () => {
    razorState.razorCache = true
    const old = razorState.claim()
    assert(old)
    razorState.razorCache = true
    assert(razorState.claim())
    razorState.restore(old)
    assert.equal(razorState.claim(), null)
})
