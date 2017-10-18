/* Copyright 2017 Ronny Reichmann */
/* STORAGE is teth's KeyValueStore, based on LMDB */
/* dependencies: node-lmdb, mkdirp */

const pipe = require('teth/pipe')
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

function composeStorage (environment, name) {
  if (!environment) throw new Error('Argument <environment> missing')
  if (!name) throw new Error('Argument <name> missing')
  let dbi = environment.openDbi({
    name: name,
    create: true
  })
  const txnHandler = composeTransactionHandler()
  function put (key, value) {
    const txn = txnHandler.begin()
    return pipe(resolve => {
      const jsonValue = JSON.stringify(value)
      txn.putString(dbi, key, jsonValue)
      resolve(value)
      txnHandler.commit()
    })
  }
  function get (key) {
    const txn = txnHandler.begin()
    return pipe(resolve => {
      const jsonValue = txn.getString(dbi, key)
      const value = JSON.parse(jsonValue)
      resolve(value)
      txnHandler.commit()
    })
  }
  function del (key) {
    const txn = txnHandler.begin()
    return pipe(resolve => {
      const jsonValue = txn.getString(dbi, key)
      const value = JSON.parse(jsonValue)
      txn.del(dbi, key)
      resolve(value)
      txnHandler.commit()
    })
  }
  function keys () {
    const txn = txnHandler.begin()
    return pipe(resolve => {
      const cursor = new Cursor(txn, dbi)
      let key = cursor.goToFirst()
      let counter = 0
      if (!key) {
        resolve(counter)
        txnHandler.commit()
      } else {
        return next => {
          next(key)
          counter += 1
          key = cursor.goToNext()
          if (!key) {
            resolve(counter)
            txnHandler.commit()
          }
        }
      }
    })
  }
  const composit = { put, get, del, keys, close }
  function close () {
    dbi.close()
    dbi = null
    environment = null
    composit.put = undefined
    composit.get = undefined
    composit.del = undefined
    composit.keys = undefined
    composit.close = undefined
  }
  return composit
}

module.exports = { environment }
