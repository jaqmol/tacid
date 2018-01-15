# Tacid

Transactional ACID key-value store with optional binary attachments, based on promises (async/await compatible) and [LMDB (via node-lmdb).](https://github.com/Venemo/node-lmdb)

Tacid abstracts away the transaction-handling of the underlaying LMDB. All operations performed within an `env.with(...)` - i.e. `store.put()`, `store.get()`, `store.remove()`, `store.filter()` - are automatically and efficiently wrapped in a transaction. Handling of parallel read and write transactions across multiple stores is covered as well.

Minimalistic API: `put()`, `get()`, `remove()`, `filter()`, `count()` and `drop()` are the only database operations that must be mastered to build high performance data services. Batch-operations are chained by `Promise.all([...])`.

## usage

``` javascript
const { environment } = require('tacid')
const env = environment({ maxDbs: 1, path: '~/path/to/data/dir' })

env.with('my-store', myStore => {
    // Return a promise (all store.ops return promises)
    return myStore.put(key, value, /* optional attachment */)
  })
  .then(/* handle results */)
  .catch(/* handle errors */)

// Environments can be closed
env.close()
```

The example above initialises a database environment and accesses the store 'my-store' within it. A put-operation is performed on the store. Next to keys with associated values, binary attachments (NodeJS Buffers) can be stored.

## environment(<config>) -> <Environment>

`<config>`: environment configuration object literal, with following properties:
- `path`: mandatory string representing the directory path.
- `maxDbs`: mandatory number representing the max count of stores inside this environment.
- `maxSize`: optional max size of the environment.

`<Environment>`: instance representing a configured environment:

## Environment API

- `.with(<name>, <callback>)`: retrieve a store by name. Run operations on it from inside `<callback>` (see example above and store API below), return a thenable to commit all transactions.
- `.close()`: close environment.

## Storage API

### .put(key, value, attachment) -> Promise.resolve(key)

Write data to the store:
- `<key>`: string key under which value is stored. Best used with ID generators like `auid`.
- `<value>`: object literal representing the data to be stored. Must be serializable via JSON.stringify(...).
- `<attachment>`: an optional NodeJS buffer instance, additional binary data to be stored (e.g. a media file).
- Returns a Promise that resolves with the key.

### .get(key) -> Promise.resolve(value|{ value, attachment })

Get data from the store:
- `<key>`: string key under which value is stored.
- Returns a Promise that resolves with the value or an object literal containing 2 props value and attachment.

### .remove(key) -> Promise.resolve(value|{value, attachment})

Delete data from the store.
- `<key>`: string key under which value is stored.
- Returns a Promise that resolves with the value or an object literal containing 2 props value and attachment.

### .count() -> Promise.resolve(number)

Get the number of key-value-pairs in the store.
- Returns a Promise that resolves with the number.

### .filter([config,] callback) -> Promise.resolve(results[])

Filter contents of the store.

`[config]`: optional config
- `{ values: true }`, provide to include values (attachments) during filtering.
- fallback if omitted: `{ values: false }`, which means that filtering is over keys only.

`<callback>` will be called with `ctx` (context) as last argument:
- `<ctx>`: object with properties `.index` and `.stop`.
  - `.index`: the current index
  - `.stop`: a boolean set to `false`, will stop the filter process if set to `true`.
- If config `{ values: true }` is provided, the callback is invoked `(key, value, ctx) => {...}`
- If config `{ values: false }` is provided or config is omitted, the callback is invoked `(key, ctx) => {...}`
- Return `true` or `false` to keep or remove an item from the results set.

The result will always contain the keys and the values, e.g. `{ key: <a-key>, value: <a-value>|{ value: <a-value>, attachment: <an-attachment> } }`.

#### Filtering by values

Keep in mind that most relational DBs are using key-value-stores like LMDB as their backing-store. So this kind of  filtering is several times faster than to be expected with traditional DB-solutions, and perfectly valid.

#### Optimisation

Key-value stores are the kind of database used underneath traditional SQL-DBs. Without the overhead of clumsy and hazardous (security-wise) SQL-interpreters, though. So if you design your application for a key-value-store (in contrast to designing it for an intermediate SQL representation or even worse, another abstraction layer on top: ORM), it is very unlikely you'll encounter bad performance. That said please keep in mind:

- design your ERM for key-value-usage, not for an ORM
- you can include identification-attributes into the key, e.g. compose keys like:
`<primary-identification-attributes[:secondary-identification-attributes]>`
- use an index per store, accessible with a fixed key
- store your data column-based if everything needs to be searchable

### .drop(<confirm-callback>)

Remove all entries from the store. `<confirm-callback>` is mandatory. Return `true` from the confirm callback to actually perform the drop of all entries.

### .close()

Closes the store. The store composit cannot be used after calling close. A new store composit must be created via `env.with(...)`.
