# Lee cashier and hardware trial

Automated browser tests simulate keyboard scanning, print invocation/layout, offline reload/sync, account controls, reports, and voids. They do not test the physical scanner, printer, card terminal, or a live deployment. Complete this checklist at the actual counter using clearly identified trial transactions.

Record the date, operator, browser/version, scanner model, printer model, paper width, and test receipt IDs. Every item below starts **unverified**.

- [ ] Sign in online as an admin. Configure shop address, phone, footer, and 58/80 mm paper. Create real trial products with known prices, tax rates, barcodes, and stock.
- [ ] Sign in as a cashier. Confirm product/user/settings/report administration is unavailable and the cashier sees only their own synced sales history.
- [ ] Scan the real barcode with the keyboard-wedge scanner followed by Enter. Repeat scans quickly. Confirm quantities, manual quantity edits, removal, and basket clearing.
- [ ] Complete a cash sale. Check subtotal, per-line tax rounding, total, cash tendered, and change against a manual calculation.
- [ ] Print the receipt through the browser. Select the actual printer, matching paper width, and disable browser headers/footers. Check long names, long baskets, feed/cut behavior, legibility, and reprinting from Sales history.
- [ ] If required, test the automatic print-dialog setting. Verify it opens once per completed checkout, not repeatedly when sync status changes.
- [ ] Use the external certified terminal for a controlled card trial. Enter only its approval/reference, never card numbers/CVV/PIN. Reconcile the recorded amount/reference with the terminal slip.
- [ ] Install the production PWA. Sign in online and confirm the catalog is downloaded. Turn off connectivity, reload the installed app, and complete a cash sale. Confirm the local receipt ID and unsynced count survive reload.
- [ ] Reconnect without taking another payment. Confirm the unsynced count reaches zero automatically, history contains the same receipt ID once, and stock is deducted once.
- [ ] Disconnect immediately after an online sale request. Reconnect/reload and confirm retry does not create a second sale. Never repeat the physical cash/card payment merely because sync is pending.
- [ ] Try two counters selling the final unit online. Confirm one sale commits and the other requires review. Offline cached stock is not a global reservation; inspect conflicts under the sync indicator.
- [ ] Sign out while unsynced sales remain. Sign in as a different cashier and confirm those sales are not attributed to them. Sign back in as the original cashier and confirm sync resumes.
- [ ] Reset a test cashier password and disable/enable their account. Confirm old tokens fail on reconnect. An offline counter can only learn about a revocation when it reconnects; cached shift sessions expire after eight hours.
- [ ] As an admin, return cash or reverse the external terminal payment for a trial sale, then void it with a reason and the confirmation checkbox. Confirm stock is restored once, history says Voided, daily totals exclude it, and Audit log records the user/time/reason.
- [ ] Compare Reports for a selected Colombo business date with completed receipts and cash/card terminal totals. Pending local sales are excluded until synced. Voids affect the original sale's date; the audit records when the void was performed.
- [ ] Confirm HTTP-to-HTTPS redirection, trusted certificate, and app update behavior on the chosen production server.

Do not clear browser data, uninstall the app, or discard a counter's browser profile while it has unsynced sales. Sales marked **Needs review** are retained with the original UUID/request. Resolve the server-side issue and retry as the original cashier; advanced conflict editing, partial returns, and automatic terminal refunds are not part of this MVP.

Record results and any failures beside the receipt IDs. Hardware and live-server checks are complete only after an operator performs them successfully.
