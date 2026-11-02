import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConversationWindow } from '../src/lib/chat/conversation.js'

test('mention starts a conversation; follow-ups refresh the inactivity timeout', () => {
    const window = new ConversationWindow(300_000)
    const send = (content: string, now: number) => window.accept({ key: 'guild-channel', content, botId: '123', now })
    assert.equal(send('hello', 0), null)
    assert.equal(send('<@123> hello', 1), 'hello')
    assert.equal(send('follow-up', 290_000), 'follow-up')
    assert.equal(send('still here', 580_000), 'still here')
    assert.equal(send('expired', 880_000), null)
    assert.equal(send('<@!123> back again', 880_001), 'back again')
})

test('activity is isolated per server and channel, and ignores commands and empty mentions', () => {
    const window = new ConversationWindow(100)
    const send = (key: string, content: string, now = 0) => window.accept({ key, content, botId: '123', now })
    assert.equal(send('a', '<@123>'), null)
    assert.equal(send('a', 'hello'), null)
    assert.equal(send('a', '<@123> hello <@123>'), 'hello')
    assert.equal(send('a', 'another person joins'), 'another person joins')
    assert.equal(send('other-server', 'hello'), null)
    assert.equal(send('other-channel', 'hello'), null)
    assert.equal(send('a', 'poi hug somebody', 90), null)
    assert.equal(send('a', 'hello', 100), null)
    assert.equal(send('a', '<@456> hello', 101), null)
})
