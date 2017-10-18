/* Copyright 2017 Ronny Reichmann */
/* globals test expect afterAll */

const { send } = require('teth/T')
const pipe = require('teth/pipe')
const { environment } = require('./storage')
const testData = require('./storage-test-data.json')

const dataBufferFromValueAndAttachment = send.sync('type: teth-storage, retrieve: data-buffer-from-value-and-attachment-fn')
const valueAndAttachmentFromDataBuffer = send.sync('type: teth-storage, retrieve: value-and-attachment-from-data-buffer-fn')

const env = environment({maxDbs: 1, path: './storage-test-environment'})
const store = env.storage('test-storage')

test('test value and attachment', () => {
  const attachment = { hello: 'World!' }
  const attachmentJson = JSON.stringify(attachment)
  const attachmentBuffer = Buffer.from(attachmentJson)

  const value = { user: 'Roni' }
  const dataBuffer = dataBufferFromValueAndAttachment(value, attachmentBuffer)
  const result = valueAndAttachmentFromDataBuffer(dataBuffer)

  const resultValue = result.value
  const resultAttachmentJson = result.attachment.toString('utf8')
  const resultAttachment = JSON.parse(resultAttachmentJson)

  expect(resultValue).toEqual(value)
  expect(resultAttachment).toEqual(attachment)
})

test('test value without attachment', () => {
  const value = { user: 'Roni' }
  const dataBuffer = dataBufferFromValueAndAttachment(value)
  const result = valueAndAttachmentFromDataBuffer(dataBuffer)

  expect(result).toEqual(value)
})

function testBatchPut (store, allItems, done) {
  const allItemIds = allItems.map(i => i.id)
  pipe.all(allItems.map(i => store.put(i.id, i)))
    .then(allResultKeys => {
      allResultKeys.forEach(key => {
        const idx = allItemIds.indexOf(key)
        expect(idx).toBeGreaterThan(-1)
      })
      done()
    })
    .catch(err => {
      expect(err).toBe(null)
      done()
    })
}
function testBatchGet (store, allItems, done) {
  pipe.all(allItems.map(i => store.get(i.id)))
    .then(allRetrievedItems => {
      expect(allRetrievedItems).toEqual(allItems)
      done()
    })
    .catch(err => {
      expect(err).toBe(null)
      done()
    })
}

function batchCall (label, batchFn) {
  for (var i = 0; i < 5; i++) {
    const start = i * 1000
    test(`${label} ${i + 1}. 1000 test items`, done => {
      batchFn(store, testData.slice(start, start + 1000), done)
    })
  }
}

batchCall('putting', testBatchPut)
batchCall('getting', testBatchGet)

test('count', done => {
  store.count().then(count => {
    expect(count).toBeGreaterThan(0)
    done()
  })
})

test('iterating keys', done => {
  store.keys()
    .forEach(key => {
      console.log(key)
    })
    .then(count => {
      console.log('count', count)
      done()
    })
    .catch(err => {
      expect(err).toBe(null)
    })
})

// TODO: KEYS TESTS

afterAll(() => {
  store.close()
  env.close()
})
