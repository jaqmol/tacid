/* Copyright 2017 Ronny Reichmann */
/* Interface & Cursor Managers */

const { Cursor } = require('node-lmdb')

function InterfaceManager (config) {
  if (!config.env) throw new Error('config.env missing')
  if (!config.name) throw new Error('config.name missing')
  const dbi = config.env.openDbi({ name, create: true })
  this.put = (writeTxn, key, data) => {
    writeTxn.putBinary(dbi, key, data)
    return key
  }
  this.get = (readTxn, key) => {
    return readTxn.getBinary(dbi, key)
  }
  this.remove = (writeTxn, key) => {
    const data = this.get(writeTxn, key)
    writeTxn.del(dbi, key)
    return data
  }
  this.count = (readTxn) => {
    return dbi.stat(readTxn).entryCount
  }
  this.cursor = (readTxn) => {
    return new CursorManager({readTxn, dbi})
  }
  this.drop = () => {
    return dbi.drop()
  }
  this.close = () => {
    dbi.close()
  }
}

function CursorManager (config) {
  if (!config.readTxn) throw new Error('config.readTxn missing')
  if (!config.dbi) throw new Error('config.dbi missing')
  const cur = new Cursor(config.readTxn, config.dbi)
  this.first = () => cur.goToFirst()
  this.next = () => cur.goToNext()
  this.close = () => cur.close()
}

module.exports = InterfaceManager
