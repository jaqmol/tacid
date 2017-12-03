/* Copyright 2017 Ronny Reichmann */
/* Data Buffer Composition and Decomposition */

const dataBuffer = {
  fromValue: (value, attachment) => {
    const valueJson = JSON.stringify(value)
    const valueJsonLen = Buffer.byteLength(valueJson)
    const attachmentLen = attachment ? attachment.length : 0
    const attachmentStartIdx = 8 + valueJsonLen
    const db = Buffer.alloc(attachmentStartIdx + attachmentLen)
    db.writeDoubleBE(valueJsonLen, 0)
    db.write(valueJson, 8)
    if (attachmentLen) db.fill(attachment, attachmentStartIdx)
    return db
  },
  toValue: db => {
    const valueJsonLen = db.readDoubleBE(0)
    const attachmentStartIdx = 8 + valueJsonLen
    const valueJson = db.toString('utf8', 8, attachmentStartIdx)
    const value = JSON.parse(valueJson)
    if (db.length > attachmentStartIdx) {
      const attachment = db.slice(attachmentStartIdx)
      return { value, attachment }
    } else return value
  }
}

module.exports = dataBuffer
