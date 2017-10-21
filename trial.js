const { environment } = require('./storage')

const testData = require('./storage-test-data.json')
const envPath = './trial-environment'
const env = environment({maxDbs: 1, path: envPath})
const store = env.storage('test-storage')
const pipe = require('teth/pipe')
const rimraf = require('rimraf').sync
const start = Date.now()

pipe.all(testData.map(v => store.put(v.id, v)))
  .then(() => store.keys())
  .then(keys => {
    return pipe.all(keys.map(k => store.get(k)))
  })
  .then(values => {
    const end = Date.now() - start
    console.log(`put 5000 and get ${values.length} values in ${end} ms`)
  })
  .then(() => {
    // store.close()
    // env.close()
  })
  .then(() => {
    rimraf(envPath)
  })
  .catch(err => { // TODO: DOES NOT THROW ON BOUNDS OVERFLOW
    console.log(err)
  })
