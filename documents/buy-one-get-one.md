# Buy 1 Get 1 subscriptions

The active frontend is `../my-only-tool`; server `src/public` is not used or
changed for this feature.

## Prices

| Plan | Standard VND | BOGO VND (bank/cash) | Standard USD | BOGO USD (card/PayPal) |
| --- | ---: | ---: | ---: | ---: |
| Daily Pass | 5,000 | 7,000 | 4.99 | 5.00 |
| Monthly | 50,000 | 55,000 | 5.55 | 5.60 |
| Yearly Saver | 150,000 | 155,000 | 7.25 | 7.30 |
| Lifetime VIP | 200,000 | 200,000 | 9.99 | 9.99 |

The server catalog is the source of pricing for advertisements and checkout.
`BOGO_ENABLED_PLANS` controls participating plans as comma-separated IDs. The
default is `DAILY,MONTHLY,YEARLY,LIFETIME`; an explicitly empty value disables
all promotion choices. Trial is never a paid/BOGO plan. Existing standard prices
remain unchanged when Buy 1 Get 1 is off. Client-supplied `amount` is ignored.

## UI

Home and Redmine show a promotional popup once per user/page/browser session,
with a button to reopen it. The Redmine entry is compact in the header to retain
Calendar space. Opening checkout closes the advertisement. A forced Redmine login
defers the advertisement until that dialog is closed.

Checkout supports choosing a paid plan, opting into BOGO, searching/paging
eligible recipients by email and selecting exactly one recipient. The recipient
is required before payment starts. An eligible recipient is another `user` or
`admin` with no active plan, including expired subscriptions/trials. This includes
admin-role accounts regardless of the configured admin email. Lifetime, active
subscriptions/trials, super-admin accounts and the buyer are excluded.
Only ID/email are returned by the picker API.

The gift receives the selected paid tier for one matching term from activation;
any expired recipient term does not carry forward. Buyers extend an existing
unexpired term. Month-end and leap-year anniversaries clamp to the last valid day.
Existing buyer lifetime access cannot be downgraded by buying a shorter tier.
The gift itself does not change `hasUsedTrial`.

Cash uses a persisted invoice and order code. Admin Management lists pending
cash invoices with the buyer, selected plan, total and gift recipient. Admin
confirms receipt after receiving the displayed amount. Cash and bank invoices
are polled by code; an existing buyer premium plan cannot falsely indicate a new
cash invoice was paid. Payment history identifies BOGO and the recipient.

## API

All endpoints below require JWT except the signed SePay webhook. Cash approval
and gift corrections additionally require the existing admin middleware.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/orders/plans` | Paid plans, standard/promotional prices and enabled flags |
| GET | `/api/orders/gift-recipients?search=email&page=1&limit=20` | Eligible users with pagination; limit capped at 50 |
| POST | `/api/orders/se-pay` | Create/reuse a matching bank invoice |
| POST | `/api/orders/cash` | Create/reuse a matching cash invoice |
| POST | `/api/orders/paypal` | Create a PayPal order using the server-calculated USD amount |
| POST | `/api/orders/paypal/:orderCode/capture` | Verify/capture the owned PayPal order and grant access |
| GET | `/api/orders/status/:orderCode` | Owned invoice status and refreshed JWT on completion |
| GET | `/api/orders/cash/pending` | Admin: pending cash invoices and paid orders needing review |
| POST | `/api/orders/cash/:orderCode/confirm` | Admin: confirm money received and grant both plans |
| PATCH | `/api/orders/:orderCode/gift-recipient` | Admin: correct a pending gift recipient and retry a verified payment |
| POST | `/api/orders/webhook/se-pay` | Verify existing HMAC and sufficient incoming amount before activation |

Creation body:

```json
{"planType":"MONTHLY","buyOneGetOne":true,"recipientUserId":"<ObjectId>"}
```

Standard purchases omit the recipient and set `buyOneGetOne` false. Malformed
plans/IDs, self-gifts, disabled promotions and an ineligible recipient are
rejected. Pending invoice reuse requires the same buyer, payment method, plan,
amount, promotion and recipient, so a previous selection cannot silently replace
the current checkout.

The `/paypal-success` compatibility route now verifies/captures a server-created
owned order. Older frontends which create PayPal orders entirely on the client
must be updated together with this backend; an unrecorded order is rejected.
Trial activation and owned paginated order history retain their routes.

## Payment consistency

Orders record the promotion, recipient and quoted price. Fulfillment uses a
MongoDB transaction containing the buyer update, gift update and completed
status. Repeated callbacks return the already-completed order without extending
access twice. Recipient eligibility is rechecked inside that transaction.

A confirmed payment is recorded before grants. If the recipient has gained an
active subscription in the meantime, both grants stay pending and the verified
payment appears in the admin review list. Admin can select a new eligible
recipient and activate both without taking payment again. A network/database
failure after provider capture is retried against the same order; it does not
require another charge. No real accounts or payments are modified by the tests.

## Deployment requirements

- MongoDB must support transactions (replica set/Atlas). Deploy the schema and
  backend before publishing the updated web. New fields are optional for old
  orders; existing history does not require migration.
- PayPal needs `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` **on the server**,
  using the same merchant application as the browser SDK. `PAYPAL_ENV=sandbox`
  selects sandbox; otherwise live is used. The secret must never be put in web
  environment variables. This checkout returns 503 if credentials are absent.
- Bank transfer retains `TPBANK_NUMBER`, `SEPAY_WEBHOOK_SECRET`, and the existing
  `x-sepay-signature` / `x-sepay-timestamp` HMAC convention. Incoming transfer
  amounts below the persisted invoice total are rejected. Overpayments fulfill
  once; partial transfers are not accumulated automatically.
- A live/sandbox end-to-end payment and transaction test must be run after
  configuring credentials and deploying. Mocked verification is not live payment
  confirmation. No deployment or real charge was performed during implementation.

## Checks

```sh
./node_modules/.bin/tsc --noEmit
node --import tsx --test tests/subscriptionPurchase.test.ts
node --require ../my-only-tool/.pnp.cjs tests/bogoCheckout.smoke.cjs
```

Tests exercise all standard/BOGO prices, recipient validation and search,
server-owned quotes, payment verification, webhook underpayment/signature
rejection, transaction wiring, rollback and duplicate callback handling using
mocked persistence/providers. Actual React DOM tests use the real API wrapper,
advertisement, checkout, recipient picker and dialog; they cover the three
payment choices, stale searches, required recipients and session dismissal.


## Legacy bank gift reconciliation

The earlier bank webhook marked invoices `COMPLETE` with `paypalCaptureId` set
to `COMPLETED` and credited only the buyer. For that exact legacy signature,
missing gift activation can now be reconciled transactionally on a duplicate
webhook or an owned status check. Only an eligible recipient is credited; the
buyer is never extended again. The original confirmation timestamp determines
the gift period. An elapsed term, an active recipient or another payment format
requires admin review rather than guessing or extending access automatically.

New fulfillments persist `giftActivatedAt`, `giftValidUntil` and
`giftActivationSource`; repeated checks therefore cannot grant a revoked gift
again. Manage Users & Licenses refreshes after admin payment approval, on window
focus and via Refresh users, with guards against late responses.
