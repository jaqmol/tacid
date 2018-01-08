/* Copyright 2017 Ronny Reichmann */
/* globals test expect beforeAll afterAll */

// const { context } = require('teth/T')
const rimraf = require('rimraf')
const environment = require('./environment')
const dataBuffer = require('./data-buffer')
const testData = require('./storage-test-data.json')

const envPath = './storage-test-environment'
let env

beforeAll(done => {
  rimraf(envPath, () => {
    env = environment({maxDbs: 15, path: envPath})
    done()
  })
})

test('data buffer value and attachment', () => {
  const attachment = { hello: 'World!' }
  const attachmentJson = JSON.stringify(attachment)
  const attachmentBuffer = Buffer.from(attachmentJson)
  const value = { user: 'Roni' }
  const data = dataBuffer.fromValue(value, attachmentBuffer)
  const result = dataBuffer.toValue(data)
  const resultValue = result.value
  const resultAttachmentJson = result.attachment.toString('utf8')
  const resultAttachment = JSON.parse(resultAttachmentJson)
  expect(resultValue).toEqual(value)
  expect(resultAttachment).toEqual(attachment)
})

test('data buffer value without attachment', () => {
  const value = { user: 'Roni' }
  const data = dataBuffer.fromValue(value)
  const result = dataBuffer.toValue(data)
  expect(result).toEqual(value)
})

test('put one in store and get', done => {
  const item = testData[0]
  env.with('test-store', str => str.put(item.id, item))
    .then(resultKey => {
      expect(resultKey).toEqual(item.id)
      return env.with('test-store', str => str.get(resultKey))
    })
    .then(resultItem => {
      expect(resultItem).toEqual(item)
      done()
    })
    .catch(err => {
      console.error(err)
      expect(err).toBe(null)
    })
})

test('put many in store and get', done => {
  const allItems = testData.slice(1, 500)
  env.with('test-store', str => {
      return Promise.all(allItems.map(i => str.put(i.id, i)))
    })
    .then(allKeys => {
      return env.with('test-store', str => {
        return Promise.all(allKeys.map(k => str.get(k)))
      })
    })
    .then(resultItems => {
      expect(resultItems).toEqual(allItems)
      done()
    })
    .catch(err => {
      expect(err).toBe(null)
    })
})

test('put many in store and remove', done => {
  const allItems = testData.slice(500, 1000)
  env.with('test-store', str => {
      return str.count().then(countBefore => {
        return Promise.all(allItems.map(i => str.put(i.id, i)))
          .then(allResultKeys => ({countBefore, allResultKeys}))
      })
    })
    .then(result => {
      expect(result.allResultKeys).toEqual(allItems.map(i => i.id))
      return env.with('test-store', str => str.count()).then(countAfterPut => {
        return Object.assign(result, {countAfterPut})
      })
    })
    .then(result => {
      expect(result.countBefore).toBe(result.countAfterPut - 500)
      return env.with('test-store', str => {
        return Promise.all(result.allResultKeys.map(k => str.remove(k)))
      })
    })
    .then(allRemovedItems => {
      expect(allRemovedItems).toEqual(allItems)
      return env.with('test-store', str => str.count())
    })
    .then(countAfter => {
      expect(countAfter).toBe(500)
      const first = allItems[0];
      return env.with('test-store', str => str.remove(first.id))
    })
    .then(removedFirst => {
      expect(removedFirst).toEqual(null)
      done()
    })
    .catch(err => {
      console.error(err)
      expect(err).toBe(null)
    })
})

test('put and get in parallel', done => {
  let count = 0
  const operate = (name, from, to) => {
    const allItems = testData.slice(from, to)
    env.with(name, str => Promise.all(allItems.map(i => str.put(i.id, i))))
      .then(allPutKeys => {
        expect(allPutKeys).toEqual(allItems.map(i => i.id))
        return env.with(name, str => Promise.all(allPutKeys.map(k => str.get(k))))
      })
      .then(allGetItems => {
        expect(allGetItems).toEqual(allItems)
        count += 1
        if (count === 2) done()
      })
      .catch(err => {
        console.error(err)
        expect(err).toBe(null)
      })
  }
  operate('first-parallel', 1000, 1500)
  setTimeout(() => { operate('second-parallel', 1500, 2000) }, 5)
})

test('filter keys to slice', done => {
  setTimeout(() => {
    env.with('test-store', store => {
      // console.log('filter test store:', store.filter)
      return store.filter((key, ctx) => {
        ctx.stop = ctx.index >= 500
        return ctx.index < 500
      })
    })
    .then(allKeys => {
      expect(allKeys.length).toBe(500)
      const allStr = allKeys.reduce((acc, k) => !acc || (typeof k === 'string'), true)
      expect(allStr).toBe(true)
      done()
    })
    .catch(err => {
      console.error(err)
      expect(err).toBe(null)
      done()
    })
  }, 13)
})

test('filter values to slice', done => {
  setTimeout(() => {
    env.with('test-store', store => {
      return store.filter({values: true}, (key, value, ctx) => {
        ctx.stop = ctx.index >= 500
        return ctx.index < 500
      })
    })
    .then(allKeysAndValues => {
      expect(allKeysAndValues.length).toBe(500)
      const allPropNames = Object.keys(testData[0])
      allKeysAndValues.forEach(kv => {
        expect(typeof kv.key === 'string').toBe(true)
        expect(typeof kv.value === 'object').toBe(true)
        allPropNames.forEach(propName => {
          expect(kv.value[propName]).toBeDefined()
        })
      })
      done()
    })
    .catch(err => {
      expect(err).toBe(null)
      done()
    })
  }, 13)
})

test('filter values by prop', done => {
  setTimeout(() => {
    env.with('test-store', store => {
      return store.filter({values: true}, (k, v, ctx) => v.language === 'Spanish')
    })
    .then(allKeysAndValues => {
      allKeysAndValues.forEach(kv => {
        expect(kv.value.language).toEqual('Spanish')
      })
      done()
    })
    .catch(err => {
      expect(err).toBe(null)
      done()
    })
  }, 13)
})

// test('teth middleware integration with multiple stores', done => {
//   const ctx = context()
//   const allItems = testData.slice(2500, 3000)
//   const withMultipleStores = env.with('first-mw-store', 'second-mw-store')
//   ctx.define('put-items: in-both-stores',
//     withMultipleStores,
//     (msg, firstStore, secondStore) => {
//       return Promise.all(allItems.map(item => {
//         return Promise.all([
//           firstStore.put(item.id, item),
//           secondStore.put(item.id, item)
//         ])
//       }))
//     })
//   ctx.define('get-items: from-both-stores',
//     withMultipleStores,
//     (msg, firstStore, secondStore) => {
//       return Promise.all(msg.allKeys.map(key => {
//         return Promise.all([
//           firstStore.get(key),
//           secondStore.get(key)
//         ])
//       }))
//     })
//   ctx.send('put-items: in-both-stores')
//     .then(allPutKeyPairs => {
//       expect(allPutKeyPairs.length).toBe(allItems.length)
//       const allKeys = allPutKeyPairs.map(keyPair => {
//         expect(keyPair.length).toBe(2)
//         expect(keyPair[0]).toEqual(keyPair[1])
//         return keyPair[0]
//       })
//       return ctx.send({'get-items': 'from-both-stores', allKeys})
//     })
//     .then(allGetItemPairs => {
//       expect(allGetItemPairs.length).toBe(allItems.length)
//       allGetItemPairs.forEach((itemPair, idx) => {
//         expect(itemPair.length).toBe(2)
//         expect(itemPair[0]).toEqual(itemPair[1])
//         expect(itemPair[0]).toEqual(allItems[idx])
//       })
//       done()
//     })
//     .catch(err => {
//       console.error(err)
//       done()
//     })
// })

afterAll(done => {
  env.close()
  rimraf(envPath, (err) => {
    if (err) console.error(err)
    else done()
  })
})
