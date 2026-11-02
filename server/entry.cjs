// Entry for hosts that require() the app (Hostinger's LiteSpeed runner).
// index.js uses top-level await, which require() cannot load.
import('./index.js')
