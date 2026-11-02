import assert from 'node:assert/strict'
import { test } from 'node:test'
import { v2, v2Container, v2Update } from '../src/lib/util/v2.js'

test('component messages suppress mentions on send and edit', () => {
    const content = '@everyone <@123456789012345678> <@&123456789012345679>'
    const sent = v2(content)
    const edited = v2Update(v2Container(content))
    assert.deepEqual(sent.allowedMentions, { parse: [] })
    assert.deepEqual(edited.allowedMentions, { parse: [] })
    assert.equal(sent.components[0].toJSON().components[0].content, content)
})
