/* Copyright 2017 Ronny Reichmann */
/* Teth Storage Public Interface */

const EnvironmentManager = require('./environment-manager')

function Environment (config) {
  if (!(this instanceof Environment)) return new Environment(config)
  const envMan = new EnvironmentManager(config)
  this.with = (...args) => {
    const lastArg = args[args.length - 1]
    if ((args.length === 2) && (typeof lastArg === 'function')) {
      return envMan.withStore(args[0], lastArg)
    } else {
      throw new Error('Must be called with a store name and a callback function.')
    }
  }
  this.close = () => envMan.close()
}

module.exports = Environment
