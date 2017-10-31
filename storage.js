/* Copyright 2017 Ronny Reichmann */
/* STORAGE is teth's KeyValueStore, based on LMDB */
/* dependencies: node-lmdb, mkdirp */

const path = require('path')
const pipe = require('teth/pipe')
const { define } = require('teth/T')
const { Env, Cursor } = require('node-lmdb')
const mkdirp = require('mkdirp').sync

const environmentForPath = {}

function environment (config) {
  if (!config.path) throw new Error('config.path missing')
  if (!config.maxDbs) throw new Error('config.maxDbs missing')
  config.maxSize = config.maxSize || 2 * 1024 * 1024 * 1024
  config.path = path.resolve(config.path)
  let env = environmentForPath[config.path]
  if (!env) {
    mkdirp(config.path)
    env = new Env()
    env.open({
      path: config.path,
      mapSize: config.maxSize,
      maxDbs: config.maxDbs
    })
    environmentForPath[config.path] = env
  }
  const composit = {
    close: () => {
      env.close()
      env = null
      environmentForPath[config.path] = undefined
      composit.close = undefined
      composit.storage = undefined
    },
    storage: name => composeStorage(env, name)
  }
  return composit
}

function dataBufferFromValueAndAttachment (value, attachment) {
  const valueJson = JSON.stringify(value)
  const valueJsonLen = Buffer.byteLength(valueJson)
  const attachmentLen = attachment ? attachment.length : 0
  const attachmentStartIdx = 8 + valueJsonLen
  const dataBuffer = Buffer.alloc(attachmentStartIdx + attachmentLen)
  dataBuffer.writeDoubleBE(valueJsonLen, 0)
  dataBuffer.write(valueJson, 8)
  if (attachmentLen) dataBuffer.fill(attachment, attachmentStartIdx)
  return dataBuffer
}
function valueAndAttachmentFromDataBuffer (dataBuffer) {
  const valueJsonLen = dataBuffer.readDoubleBE(0)
  const attachmentStartIdx = 8 + valueJsonLen
  const valueJson = dataBuffer.toString('utf8', 8, attachmentStartIdx)
  const value = JSON.parse(valueJson)
  if (dataBuffer.length > attachmentStartIdx) {
    const attachment = dataBuffer.slice(attachmentStartIdx)
    return { value, attachment }
  } else return value
}

define('type: teth-storage, retrieve: data-buffer-from-value-and-attachment-fn', () => dataBufferFromValueAndAttachment)
define('type: teth-storage, retrieve: value-and-attachment-from-data-buffer-fn', () => valueAndAttachmentFromDataBuffer)

function composeTransactionHandler (env) {
  let txn = null
  let counter = 0
  function begin () {
    if (counter === 0) {
      txn = env.beginTxn()
    }
    counter += 1
    return txn
  }
  function commit () {
    counter -= 1
    if (counter === 0) {
      txn.commit()
      txn = null
    }
  }
  return Object.freeze({ begin, commit })
}

function composeStorage (env, name) {
  if (!env) throw new Error('Argument <env> missing')
  if (!name) throw new Error('Argument <name> missing')
  let dbi = env.openDbi({
    name: name,
    create: true
  })
  const txnReadHandler = composeTransactionHandler(env)
  const txnWriteHandler = composeTransactionHandler(env)
  function put (key, value, attachment) {
    if (!key) return pipe.reject(new Error('<key> argument required'))
    if (!value) return pipe.reject(new Error('<value> argument required'))
    const txn = txnWriteHandler.begin()
    return pipe((resolve, reject) => {
      const dataBuffer = dataBufferFromValueAndAttachment(value, attachment)
      try {
        txn.putBinary(dbi, key, dataBuffer)
        resolve(key)
      } catch (err) {
        reject(err)
      }
      txnWriteHandler.commit()
    })
  }
  function get (key) {
    if (!key) return pipe.reject(new Error('<key> argument required'))
    const txn = txnReadHandler.begin()
    return pipe((resolve, reject) => {
      try {
        const dataBuffer = txn.getBinary(dbi, key)
        const result = valueAndAttachmentFromDataBuffer(dataBuffer)
        resolve(result)
      } catch (err) {
        reject(err)
      }
      txnReadHandler.commit()
    })
  }
  function del (key) {
    if (!key) return pipe.reject(new Error('<key> argument required'))
    const txn = txnWriteHandler.begin()
    return pipe((resolve, reject) => {
      try {
        const dataBuffer = txn.getBinary(dbi, key)
        const result = valueAndAttachmentFromDataBuffer(dataBuffer)
        txn.del(dbi, key)
        resolve(result)
      } catch (err) {
        reject(err)
      }
      txnWriteHandler.commit()
    })
  }
  function count () {
    const txn = txnReadHandler.begin()
    return pipe((resolve, reject) => {
      try {
        const stat = dbi.stat(txn)
        resolve(stat.entryCount)
      } catch (err) {
        reject(err)
      }
      txnReadHandler.commit()
    })
  }
  function filterKeys (callback) {
    const txn = txnReadHandler.begin()
    const endIndex = dbi.stat(txn).entryCount
    return pipe((resolve, reject) => {
      try {
        const cur = new Cursor(txn, dbi)
        const acc = []
        let key = cur.goToFirst()
        for (var i = 0; i < endIndex; i++) {
          const ctx = { index: i, stop: false }
          if (callback(key, ctx)) acc.push(key)
          key = cur.goToNext()
        }
        resolve(acc)
        cur.close()
      } catch (err) {
        reject(err)
      }
      txnReadHandler.commit()
    })
  }
  function filterValues (callback) {
    const txn = txnReadHandler.begin()
    const endIndex = dbi.stat(txn).entryCount
    function nextDeferredOperation (cur, index, stopper) {
      return pipe((resolveGet, rejectGet) => {
        try {
          cur.getCurrentBinary((key, dataBuffer) => {
            const value = valueAndAttachmentFromDataBuffer(dataBuffer)
            const ctx = { index, stop: false }
            const keep = callback(key, value, ctx)
            stopper.stop = ctx.stop
            if (keep) resolveGet({ key, value })
            else resolveGet(false)
          })
        } catch (err) {
          rejectGet(err)
        }
      }).then(result => result)
    }
    return pipe((resolve, reject) => {
      try {
        const cur = new Cursor(txn, dbi)
        const acc = []
        cur.goToFirst()
        const stopper = { stop: false }
        for (var i = 0; i < endIndex; i++) {
          acc.push(nextDeferredOperation(cur, i, stopper))
          cur.goToNext()
          if (stopper.stop) break
        }
        const closeAndCommit = () => {
          cur.close()
          txnReadHandler.commit()
        }
        pipe.all(acc)
          .then(results => {
            resolve(results.filter(r => r))
            closeAndCommit()
          })
          .catch(err => {
            reject(err)
            closeAndCommit()
          })
      } catch (err) {
        reject(err)
      }
    })
  }
  function filter (includeValue, callback) {
    if (includeValue) {
      return filterValues(callback)
    } else {
      return filterKeys(callback)
    }
  }
  const composit = { put, get, del, count, filter, close }
  function close () {
    dbi.close()
    dbi = null
    env = null
    composit.put = undefined
    composit.get = undefined
    composit.del = undefined
    composit.count = undefined
    composit.filter = undefined
    composit.close = undefined
  }
  return composit
}

module.exports = { environment }
