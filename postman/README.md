# ResolveOS Postman collection

Runs the whole journey in order and checks what must be refused: no session, missing CSRF token,
invalid input, another buyer's case, duplicate capture and refund, unapproved or stale settlements,
and forged webhooks. It contains no secrets and uses the mock PayPal, so no money or AI quota is used.

Start a local server on a throwaway database with `PAYPAL_ADAPTER=mock`, `AI_MODE=demo` and any
`PAYPAL_WEBHOOK_ID`, run `pnpm db:reset --yes` against that database, then import both files into
Postman and run the collection, or use the free Newman command line:

```bash
pnpm dlx newman@6 run postman/ResolveOS.postman_collection.json -e postman/local.postman_environment.json
```

Set `baseUrl` in the environment file if your server is not on port 5001.
