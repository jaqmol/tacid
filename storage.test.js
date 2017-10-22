/* Copyright 2017 Ronny Reichmann */
/* globals test expect beforeAll afterAll */

const { send } = require('teth/T')
const pipe = require('teth/pipe')
const rimraf = require('rimraf')
const { environment } = require('./storage')
const testData = require('./storage-test-data.json')

const dataBufferFromValueAndAttachment = send.sync('type: teth-storage, retrieve: data-buffer-from-value-and-attachment-fn')
const valueAndAttachmentFromDataBuffer = send.sync('type: teth-storage, retrieve: value-and-attachment-from-data-buffer-fn')

const envPath = './storage-test-environment'
let env
let store

beforeAll(done => {
  rimraf(envPath, () => {
    env = environment({maxDbs: 1, path: envPath})
    store = env.storage('test-storage')
    done()
  })
})

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

function validateTestDataSet (item) {
  validateTestDataSet.keyNames.forEach(k => {
    expect(item[k]).toBeDefined()
  })
}
validateTestDataSet.keyNames = ['id', 'email', 'gender', 'language', 'country', 'city', 'state', 'zip', 'street', 'streetNumber', 'phone', 'newsletter', 'firstName', 'lastName']

test('filter keys to slice', done => {
  store
    .filter(false, (key, ctx) => {
      ctx.stop = ctx.index >= 2000
      if (ctx.stop) return false
      return ctx.index >= 1000
    })
    .then(aThousandKeys => {
      expect(aThousandKeys.length).toBe(1000)
      const keysAreAllStr = aThousandKeys.reduce((acc, k) => {
        if (!acc) return acc
        return typeof k === 'string'
      }, true)
      expect(keysAreAllStr).toBe(true)
      done()
    })
    .catch(err => {
      console.error(err)
      expect(err).toBe(null)
      done()
    })
})

test('filter values to slice', done => {
  store
    .filter(true, (key, value, ctx) => {
      ctx.stop = ctx.index >= 3000
      if (ctx.stop) return false
      return ctx.index >= 2000
    })
    .then(aThousandKeysAndValues => {
      expect(aThousandKeysAndValues.length).toBe(1000)
      aThousandKeysAndValues.forEach(kv => {
        validateTestDataSet(kv.value)
      })
      done()
    })
    .catch(err => {
      console.error(err)
      expect(err).toBe(null)
      done()
    })
})

test('filter values by prop', done => {
  store
    .filter(true, (k, v, ctx) => v.language === 'Spanish')
    .then(keyValuePairs => {
      const fromDb = keyValuePairs
        .reduce((acc, kvp) => {
          acc[kvp.key] = kvp.value
          return acc
        }, {})
      const originals = testData
        .filter(item => item.language === 'Spanish')
        .reduce((acc, item) => {
          acc[item.id] = item
          return acc
        }, {})
      expect(fromDb).toEqual(originals)
      done()
    })
    .catch(err => {
      console.error(err)
      expect(err).toBe(null)
      done()
    })
})

afterAll(done => {
  store.close()
  env.close()
  rimraf(envPath, done)
})
