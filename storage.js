/* Copyright 2017 Ronny Reichmann */
/* STORAGE is teth's KeyValueStore, based on LMDB */
/* dependencies: node-lmdb, mkdirp */

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
  console.log('resolved environment path:', config.path)
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
    storage: name => composeStorage(environment, name)
  }
  return composit
}

function composeTransactionHandler () {
  let txn = null
  let counter = 0
  function begin () {
    if (counter === 0) {
      txn = environment.beginTxn()
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
  const valueJsonBuf = Buffer.from(valueJson)
  const valueLengthBuf = new Buffer(7)
  valueLengthBuf.writeUInt32LE(valueJsonBuf.length, 0)
  return Buffer.concat(
    attachment
    ? [valueLengthBuf, valueJsonBuf, attachment]
    : [valueLengthBuf, valueJsonBuf])
}
function valueAndAttachmentFromDataBuffer (dataBuffer) {
  const valueLength = dataBuffer.readUInt32LE(0)
  const separatorIndex = 7 + valueLength
  const valueJson = dataBuffer.toString('utf8', 7, separatorIndex)
  const value = JSON.parse(valueJson)
  const attachment = dataBuffer.length > separatorIndex
    ? dataBuffer.slice(separatorIndex)
    : undefined
  return { value, attachment }
}

define('type: teth-storage, retrieve: data-buffer-from-value-and-attachment-fn', () => dataBufferFromValueAndAttachment)
define('type: teth-storage, retrieve: value-and-attachment-from-data-buffer-fn', () => valueAndAttachmentFromDataBuffer)

function composeStorage (environment, name) {
  if (!environment) throw new Error('Argument <environment> missing')
  if (!name) throw new Error('Argument <name> missing')
  let dbi = environment.openDbi({
    name: name,
    create: true
  })
  const txnHandler = composeTransactionHandler()
  function put (key, value, attachment) {
    const txn = txnHandler.begin()
    return pipe(resolve => {
      const dataBuffer = dataBufferFromValueAndAttachment(value, attachment)
      txn.putBinary(dbi, key, dataBuffer)
      resolve(key)
      txnHandler.commit()
    })
  }
  function get (key) {
    const txn = txnHandler.begin()
    return pipe(resolve => {
      const dataBuffer = txn.getBinary(dbi, key)
      const result = valueAndAttachmentFromDataBuffer(dataBuffer)
      resolve(result)
      txnHandler.commit()
    })
  }
  function del (key) {
    const txn = txnHandler.begin()
    return pipe(resolve => {
      const dataBuffer = txn.getBinary(dbi, key)
      const result = valueAndAttachmentFromDataBuffer(dataBuffer)
      txn.del(dbi, key)
      resolve(result)
      txnHandler.commit()
    })
  }
  // function keys () {
  //   const txn = txnHandler.begin()
  //   return pipe(resolve => {
  //     const cursor = new Cursor(txn, dbi)
  //     let key = cursor.goToFirst()
  //     let counter = 0
  //     if (!key) {
  //       resolve(counter)
  //       txnHandler.commit()
  //     } else {
  //       return next => {
  //         next(key)
  //         counter += 1
  //         key = cursor.goToNext()
  //         if (!key) {
  //           resolve(counter)
  //           txnHandler.commit()
  //         }
  //       }
  //     }
  //   })
  // }
  const composit = { put, get, del, /*keys,*/ close }
  function close () {
    dbi.close()
    dbi = null
    environment = null
    composit.put = undefined
    composit.get = undefined
    composit.del = undefined
    // composit.keys = undefined
    composit.close = undefined
  }
  return composit
}

module.exports = { environment }
