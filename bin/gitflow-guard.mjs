#!/usr/bin/env node
import { main } from '../lib/cli.mjs'

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`[gitflow-guard] ${e?.message ?? e}`)
    process.exit(1)
  })
