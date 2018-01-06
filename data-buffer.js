/* Copyright 2017 Ronny Reichmann */
/* Data Buffer Composition and Decomposition */

const dataBuffer = {
  fromValue: (value, attachment) => {
    const valueJson = JSON.stringify(value)
    const valueJsonLen = Buffer.byteLength(valueJson)
    const attachmentLen = attachment ? attachment.length : 0
    const attachmentStartIdx = 8 + valueJsonLen
    const buf = Buffer.alloc(attachmentStartIdx + attachmentLen)
    buf.writeDoubleBE(valueJsonLen, 0)
    buf.write(valueJson, 8)
    if (attachmentLen) buf.fill(attachment, attachmentStartIdx)
    return buf
  },
  toValue: buf => {
    if (!buf) return null;
    const valueJsonLen = buf.readDoubleBE(0)
    const attachmentStartIdx = 8 + valueJsonLen
    const valueJson = buf.toString('utf8', 8, attachmentStartIdx)
    const value = JSON.parse(valueJson)
    if (buf.length > attachmentStartIdx) {
      const attachment = buf.slice(attachmentStartIdx)
      return { value, attachment }
    } else return value
  }
}

module.exports = dataBuffer
