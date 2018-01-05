/* Copyright 2017 Ronny Reichmann */
/* Environment Manager */

const { Env } = require('node-lmdb')
const path = require('path')
const mkdirp = require('mkdirp').sync
const TransactionManager = require('./transaction-manager')
const InterfaceManager = require('./interface-manager')
const Storage = require('./storage')

function EnvironmentManager (config) {
  if (!config.path) throw new Error('config.path missing')
  if (!config.maxDbs) throw new Error('config.maxDbs missing')
  config.maxSize = config.maxSize || 2 * 1024 * 1024 * 1024
  config.path = path.resolve(config.path)
  mkdirp(config.path)
  const env = new Env()
  env.open({
    path: config.path,
    mapSize: config.maxSize,
    maxDbs: config.maxDbs
  })
  const writeTxnMan = new TransactionManager({ env, readOnly: false })
  this.withStore = (name, callback) => {
    const intMan = new InterfaceManager({ name, env })
    const readTxnMan = new TransactionManager({ env, readOnly: true })
    const store = new Storage({ intMan, writeTxnMan, readTxnMan })
    let thenable = null
    try {
      thenable = callback(store)
    } catch (err) {
      return Promise.reject(err)
    }
    if (thenable.then && thenable.catch) {
      return thenable.then(result => {
        writeTxnMan.commit()
        readTxnMan.commit()
        intMan.close()
        return result
      })
    } else return Promise.reject(new Error('Callback return value must be thenable'))
  }
  this.close = () => {
    env.close()
  }
}

module.exports = EnvironmentManager
