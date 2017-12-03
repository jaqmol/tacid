/* Copyright 2017 Ronny Reichmann */
/* Storage, interface available via environment.with(...) */

const pipe = require('teth-pipe')
const dataBuffer = require('./data-buffer')

function Storage (config) {
  if (!config.intMan) throw new Error('config.intMan missing')
  if (!config.writeTxnMan) throw new Error('config.writeTxnMan missing')
  if (!config.readTxnMan) throw new Error('config.readTxnMan missing')
  const intMan = config.intMan
  const writeTxnMan = config.writeTxnMan
  const readTxnMan = config.readTxnMan
  this.put = (key, value, attachment) => {
    if (!key) return pipe.reject(new Error('Argument <key> missing'))
    if (!value) return pipe.reject(new Error('Argument <value> missing'))
    return pipe((resolve, reject) => {
      // try {
        const data = dataBuffer.fromValue(value, attachment)
        resolve(intMan.put(writeTxnMan.get(), key, data))
      // } catch (err) {
      //   reject(err)
      // }
    })
  }
  this.get = (key) => {
    if (!key) return pipe.reject(new Error('Argument <key> missing'))
    return pipe((resolve, reject) => {
      // try {
        const data = intMan.get(readTxnMan.get(), key)
        resolve(dataBuffer.toValue(data))
      // } catch (err) {
      //   reject(err)
      // }
    })
  }
  this.remove = (key) => {
    if (!key) return pipe.reject(new Error('Argument <key> missing'))
    return pipe((resolve, reject) => {
      // try {
        const data = intMan.remove(writeTxnMan.get(), key)
        resolve(dataBuffer.toValue(data))
      // } catch (err) {
      //   reject(err)
      // }
    })
  }
  this.count = () => {
    return pipe((resolve, reject) => {
      // try {
        resolve(intMan.count(readTxnMan.get()))
      // } catch (err) {
      //   reject(err)
      // }
    })
  }
  this.filter = (...args) => {
    const config = args.length === 2 ? args[0] : { values: false }
    const callback = args.length === 2 ? args[1] : args[0]
    if (!callback) return pipe.reject(new Error('Argument <callback> missing'))
    return pipe((resolve, reject) => {
      const count = intMan.count(readTxnMan.get())
      const cursor = intMan.cursor(readTxnMan.get())
      const acc = []
      let key = cursor.first()
      for (var index = 0; index < count; index++) {
        const ctx = { index, stop: false }
        if (config.values) {
          const data = intMan.get(readTxnMan.get(), key)
          const value = dataBuffer.toValue(data)
          if (callback(key, value, ctx)) {
            acc.push({key, value})
          }
        } else {
          if (callback(key, ctx)) {
            acc.push(key)
          }
        }
        if (ctx.stop) break
        key = cursor.next()
      }
      cursor.close()
      resolve(acc)
    })
  }
  // Note: Commit usage pattern does not yield good coding style,
  //       nore does it perform better:
  // this.commit = () => {
  //   return pipe((resolve, reject) => {
  //     try {
  //       writeTxnMan.commit()
  //       readTxnMan.commit()
  //       resolve(true)
  //     } catch (err) {
  //       reject(err)
  //     }
  //   })
  // }
  this.drop = (confirmCallback) => {
    if (!confirmCallback) return pipe.reject(new Error('Argument <confirmCallback> missing'))
    return pipe((resolve, reject) => {
      // try {
        const performDrop = confirmCallback()
        if (performDrop) {
          intMan.drop()
        }
        resolve(performDrop)
      // } catch (err) {
      //   reject(err)
      // }
    })
  }
}

module.exports = Storage
