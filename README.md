# teth-storage

Teth key-value-store/-database. Based on [LMDB via node-lmdb](https://github.com/Venemo/node-lmdb), a full-ACID high performance key-value-store.

Teth-storage abstracts away the transaction-handling of the underlaying LMDB through usage of [teth-pipe.](https://github.com/jaqmol/teth-pipe) All operations performed within an operation-sequence (i.e. `.map()`, `.filter()`, `.reduce()`, `forEach()`, ...) are automatically and efficiently wrapped in a transaction. Handling of parallel read and write transactions is covered as well.

The API of teth-storage is concise and minimalistic: put(), get(), del(), filter() and count() are the only database operations that must be mastered to build high performance data services.

## usage

``` javascript
const { environment } = require('teth/storage')
const env = environment({ maxDbs: 1, path: './path-to-env-dir' })
const store = env.storage('store-name')
/* Run operations on "store", see below for API */
store.close()
env.close()
```

## environment(<config>) -> <env-composit>

`<config>`: environment configuration object literal, with following properties:
- `path`: mandatory string representing the directory path.
- `maxDbs`: mandatory number representing the max count of databases/stores inside this environment.
- `maxSize`: optional max size of the environment.

`<env-composit>`: composit representing a configured environment.
- `.storage(<name>) -> <store-composit>`: compose store composit / database.
- `.close()`: close environment.

## Storage API

### .put(key, value, attachment) -> pipe.resolve(key)

Write data to the store:
- `<key>`: string key under which value is stored. Best used with `teth/auid`.
- `<value>`: object literal representing the data to be stored. Must be serializable via JSON.stringify(...).
- `<attachment>`: an optional NodeJS buffer instance, additional binary data to be stored (e.g. a media file).
- Returns a pipe that resolves with the key.

### .get(key) -> pipe.resolve(value|{ value, attachment })

Get data from the store:
- `<key>`: string key under which value is stored.
- Returns a pipe that resolves with the value or an object literal containing 2 props value and attachment.

### .del(key) -> pipe.resolve(value|{value, attachment})

Delete data from the store.
- `<key>`: string key under which value is stored.
- Returns a pipe that resolves with the value or an object literal containing 2 props value and attachment.

### .count() -> pipe.resolve(number)

Get the number of key-value-pairs in the store.
- Returns a pipe that resolves with the number.

### .filter(includeValue, callback) -> pipe.resolve(results[])

Fast filter contents of the store.

`<callback>` will be called with `ctx` (context) as last argument:
- `<ctx>`: object with properties `.index` and `.stop`.
  - `.index`: the current index
  - `.stop`: a boolean set to `false`, will stop the filter process if set to `true`.
- If `true` is returned from the callback, the result will contain the item.
- If `false` is returned from the callback, the result will NOT contain the item.

#### Filtering by keys

For extremely fast filtering and value-access, primary identification-attributes can be integrated into the key e.g.:
`<primary-attribute>:<id-of-value>`

- `<includeValue>` must be `false`.
- `<callback>` will be called `(key, ctx)`.
- The result will contain the keys.

#### Filtering by values

- `<includeValue>` must be `true`.
- `<callback>` will be called `(key, value, ctx)`.
- The result will contain the keys and the values, e.g. `{ key: <a-key>, value: <a-value>|{ value: <a-value>, attachment: <an-attachment> } }`.

### .close()

Closes the store. The store composit cannot be used after calling close. A new store composit must be created via `env.storage(...)`.
