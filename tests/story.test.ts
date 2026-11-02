import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateStory } from '../src/lib/services/story.service.js'

test('story intro and ending fit together in a Discord message', () => {
    const result = validateStory({ intro: 'a'.repeat(3500), routes: [
        { label: 'Yes', ending: 'b'.repeat(3500), win: true },
        { label: 'No', ending: 'c'.repeat(3500), win: false },
    ] })
    assert(result)
    assert.equal(result.intro.length, 1200)
    assert.equal(result.routes[0].ending.length, 1200)
})

test('story rejects string booleans and empty labels instead of granting the wrong outcome', () => {
    const good = { label: 'Good', ending: 'Victory', win: true }
    assert.equal(validateStory({ intro: 'Hello', routes: [good, { label: 'Bad', ending: 'Lost', win: 'false' }] }), null)
    assert.equal(validateStory({ intro: 'Hello', routes: [good, { label: ' ', ending: 'Lost', win: false }] }), null)
})
