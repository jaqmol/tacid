/* Copyright 2017 Ronny Reichmann */
/* Transactions Manager */

function TransactionManager ({env, readOnly}) {
  let txn = null
  this.get = () => {
    if (!txn) {
      txn = env.beginTxn({readOnly})
    }
    return txn
  }
  this.commit = () => {
    if (txn) {
      txn.commit()
      txn = null
    }
  }
}

module.exports = TransactionManager
