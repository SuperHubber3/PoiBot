import assert from 'node:assert/strict'
import { test } from 'node:test'
import { containsWord } from '../src/listeners/reactions.js'

test('reaction phrases use both word boundaries and allow punctuation', () => {
    assert.equal(containsWord('i forgor!', 'forgor'), true)
    assert.equal(containsWord('forgorn something', 'forgor'), false)
    assert.equal(containsWord('something unforgor', 'forgor'), false)
    assert.equal(containsWord('x a+b!', 'a+b'), true)
    assert.equal(containsWord('éforgor', 'forgor'), false)
})
