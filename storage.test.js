/* Copyright 2017 Ronny Reichmann */
/* globals test expect */

const { send } = require('teth/T')
const { environment } = require('./storage')
const mockUserData = require('./storage-test-data.json')

const dataBufferFromValueAndAttachment = send.sync('type: teth-storage, retrieve: data-buffer-from-value-and-attachment-fn')
const valueAndAttachmentFromDataBuffer = send.sync('type: teth-storage, retrieve: value-and-attachment-from-data-buffer-fn')

test('test value and attachment', () => {
  const attachment = { hello: 'World!' }
  const attachmentJson = JSON.stringify(attachment)
  const attachmentBuffer = Buffer.from(attachmentJson)

  const value = { user: 'Roni' }
  const dataBuffer = dataBufferFromValueAndAttachment(value, attachmentBuffer)
  const result = valueAndAttachmentFromDataBuffer(dataBuffer)

  const resultValue = result.value
  const resultAttachmentJson = result.attachment.toString('utf8')
  const resultAttachment = JSON.parse(resultAttachmentJson)

  expect(resultValue).toEqual(value)
  expect(resultAttachment).toEqual(attachment)
})

test('test value without attachment', () => {
  const value = { user: 'Roni' }
  const dataBuffer = dataBufferFromValueAndAttachment(value)
  const result = valueAndAttachmentFromDataBuffer(dataBuffer)

  expect(result.value).toEqual(value)
  expect(result.attachment).toBeUndefined()
})
