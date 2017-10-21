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
    return pipe(resolve => {
      const dataBuffer = dataBufferFromValueAndAttachment(value, attachment)
      txn.putBinary(dbi, key, dataBuffer)
      resolve(key)
      txnWriteHandler.commit()
    })
  }
  function get (key) {
    if (!key) return pipe.reject(new Error('<key> argument required'))
    const txn = txnReadHandler.begin()
    return pipe(resolve => {
      const dataBuffer = txn.getBinary(dbi, key)
      const result = valueAndAttachmentFromDataBuffer(dataBuffer)
      resolve(result)
      txnReadHandler.commit()
    })
  }
  function del (key) {
    if (!key) return pipe.reject(new Error('<key> argument required'))
    const txn = txnWriteHandler.begin()
    return pipe(resolve => {
      const dataBuffer = txn.getBinary(dbi, key)
      const result = valueAndAttachmentFromDataBuffer(dataBuffer)
      txn.del(dbi, key)
      resolve(result)
      txnWriteHandler.commit()
    })
  }
  function count () {
    const txn = txnReadHandler.begin()
    return pipe(resolve => {
      const stat = dbi.stat(txn)
      resolve(stat.entryCount)
      txnReadHandler.commit()
    })
  }
  function iterate (startIndex, endIndex) {
    const txn = txnReadHandler.begin()
    const entryCount = dbi.stat(txn).entryCount
    startIndex = arguments.length > 0 ? startIndex : 0
    endIndex = arguments.length > 1 ? endIndex : entryCount
    if (endIndex > entryCount) {
      txnReadHandler.commit()
      return pipe.reject(new Error(`Out of bounds: startIndex = ${startIndex}, endIndex = ${endIndex}, entryCount = ${entryCount}`))
    }
    return pipe((resolve, reject) => {
      const cur = new Cursor(txn, dbi)
      let key = cur.goToFirst()
      let idx = 0
      while (idx < startIndex) { // fast forward
        key = cur.goToNext()
        idx += 1
      }
      return next => {
        if (idx < endIndex) {
          next({
            key,
            get: () => pipe(resolveGet => {
              cur.getCurrentBinary((key, dataBuffer) => {
                resolveGet(valueAndAttachmentFromDataBuffer(dataBuffer))
              })
            })
          })
          key = cur.goToNext()
          idx += 1
        } else {
          resolve(idx)
          txnReadHandler.commit()
        }
      }
    })
  }
  function keys (startIndex, endIndex) {
    const txn = txnReadHandler.begin()
    const entryCount = dbi.stat(txn).entryCount
    startIndex = arguments.length > 0 ? startIndex : 0
    endIndex = arguments.length > 1 ? endIndex : entryCount
    if (endIndex > entryCount) {
      txnReadHandler.commit()
      return pipe.reject(new Error(`Out of bounds: startIndex = ${startIndex}, endIndex = ${endIndex}, entryCount = ${entryCount}`))
    }
    return pipe((resolve, reject) => {
      const cur = new Cursor(txn, dbi)
      let key = cur.goToFirst()
      let idx = 0
      while (idx < startIndex) {
        key = cur.goToNext()
        idx += 1
      }
      const acc = []
      while (idx < endIndex) {
        acc.push(key)
        key = cur.goToNext()
        idx += 1
      }
      resolve(acc)
      setTimeout(txnReadHandler.commit, 0)
    })
  }
  const composit = { put, get, del, count, iterate, keys, close }
  function close () {
    dbi.close()
    dbi = null
    env = null
    composit.put = undefined
    composit.get = undefined
    composit.del = undefined
    composit.count = undefined
    composit.iterate = undefined
    composit.keys = undefined
    composit.close = undefined
  }
  return composit
}

module.exports = { environment }
