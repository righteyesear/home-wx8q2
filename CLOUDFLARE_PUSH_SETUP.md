# Cloudflare Push Worker deployment checklist

`cloudflare-push-worker.js` is deployed manually. A code upload alone is not
enough; the bindings, secrets, and Cron Trigger below must also exist.

## Required configuration

1. Deploy `cloudflare-push-worker.js` to
   `push-notifications.miurayukimail.workers.dev`.
2. Bind a Workers KV namespace with the variable name `KV`.
3. Configure these Worker secrets:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `ADMIN_TOKEN` (a long random value used only for diagnostic endpoints)
4. Ensure `VAPID_PUBLIC_KEY` exactly matches the public key in
   `js/notifications.js`.
5. Add the Yahoo weather proxy as a Service Binding named `YAHOO_PROXY`.
   Direct fetch is used as a fallback, but the binding is recommended.
6. Configure a Cron Trigger for every minute:

   ```text
   * * * * *
   ```

## Verification

Open the public status endpoint:

```text
https://push-notifications.miurayukimail.workers.dev/api/status
```

Confirm:

- `subscribers` is at least 1;
- `cron.lastRun` exists and `cron.ageMinutes` is a small number;
- both VAPID key flags are `true`;
- `lastDelivery.failed` is 0 after a test.

Diagnostic notification endpoints require the admin token:

```powershell
$headers = @{ Authorization = "Bearer <ADMIN_TOKEN>" }
Invoke-RestMethod `
  -Uri "https://push-notifications.miurayukimail.workers.dev/api/test" `
  -Method Post `
  -Headers $headers
```

The expected result has `sent` greater than 0 and `failed` equal to 0.

## Subscription recovery

The dashboard now re-sends an existing browser subscription to the Worker
whenever the page loads. This restores KV registrations lost during a Worker
or namespace replacement. If the footer shows `通知再登録が必要`, press the
notification button once after checking the Worker configuration.
