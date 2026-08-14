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

7. `ALLOWED_ORIGINS` is optional. When omitted, subscription writes are
   accepted from `https://righteyesear.github.io` and local development only.
   If the dashboard origin changes, set this Worker variable to a comma-separated
   allowlist such as `https://example.github.io,https://weather.example.com`.

## What to upload to Cloudflare

Upload only `cloudflare-push-worker.js` as the Worker code. The following files
must be published with the GitHub Pages dashboard instead and are not pasted into
Cloudflare:

- `sw.js`
- `js/notifications.js`
- `scripts/ai_advisor.py`

The existing `KV`, `YAHOO_PROXY`, VAPID secrets, admin secret, and `* * * * *`
Cron Trigger remain required. No new mandatory binding or secret was added.

Urgent rain and warning pushes now use short delivery TTLs and high urgency, while
calendar and summary messages use longer TTLs and low urgency. A category-specific
Web Push topic replaces only stale messages in the same category instead of
replacing unrelated alerts.

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
