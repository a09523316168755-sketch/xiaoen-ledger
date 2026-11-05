# Xiaoen Ledger Financial Analytics — V0.7.2

## Scope

This implementation runs inside the existing Xiaoen Ledger website. It does not create a separate data source or mutate historical transactions for the purpose of chart rendering. The existing Supabase ledger document remains the underlying persistence model.

## Time and monetary conventions

- Financial time zone: Asia/Taipei.
- Period endpoints are **inclusive calendar dates** (YYYY-MM-DD).
- Expense/income: use transaction occurrence date (`row.date`).
- Account cash flows: use `row.settledDate` when explicitly entered, otherwise `row.date`; those estimates are flagged in the UI.
- Unoccurred future dates are excluded from reports. A custom end date after today is clamped to today.
- "This month", "last three/six months" and "year to date" end today. Last month / last year are complete calendar periods.
- Comparable prior period is the immediately adjacent period with an **equal number of days**, not necessarily a full prior calendar month. Both dates are visibly shown.
- Amounts are positive integer NT$ ledger entries; cash net values and refund offsets may be negative.

## Accounting rules

- Normal income adds to revenue only for transaction type `income` not classified as a refund or investment principal.
- Normal expense adds to spending when transaction type `expense`.
- An `income` row with `analysisKind='refund'` and valid `refundOf` points to an original non-deleted expense and **subtracts** the refund amount from the original category. It **does not count as income**. Multiple refund sums may not exceed the original expense; invalid/unlinked/excess refunds are flagged and excluded from general income/spending.
- Transfers (`type='transfer'`) are excluded from income and expense. Internal bank-to-bank transfer movements cancel in net cash flow and do not inflate external cash inflow/outflow.
- Credit-card charges are recognized as expense when charged, but do not count as liquid bank outflow. Paying a credit card through a transfer is a liquid cash outflow and liability decrease, **not another purchase**.
- Explicit `analysisKind='principal'` entries are excluded from ordinary income/expense analysis. **Full brokerage/investment transactions are not yet supported**.
- Project costs require `projectTag` to be set to `gla200` or `ronnie`. Each eligible row is counted once independent of category; linked refunds inherit the original expense project.
- Fixed vs variable spending depends on explicit `costNature` marking. Historical unmarked rows stay unclassified.
- Income sources are set explicitly or recognized from standard legacy subcategories; unrecognized sources remain "other".
- Budget is optional and prorated by each selected calendar day / the corresponding month's total days.
- Emergency runway uses manually provided emergency reserve and essential monthly expense amounts; the app does not assert these were verified with a bank.
- Future planned bills, investment portfolio value, automatic spending forecasts and account reconciliation are **not implemented**. Unsupported indicators show "待設定" rather than invented values.

## Module structure

1. Overview: income, expenses, balance, savings ratio, daily expense, largest spend and matching prior period.
2. Income: sources, shares, bonus variability, income trends and fixed wage proportion.
3. Expense: gross transactions, net after linked refunds, category/subcategory shares, cross-period changes, top ten and actual transaction drilldown.
4. Cashflow: asset-account incoming/outgoing amounts, bank transfers, credit repayments, daily/weekly/monthly net movements.
5. Behavior: observed consumption days/weekdays, food/drink counts and note-based recurrence evidence.
6. Projects: independently tagged GLA 200 and Ronnie expenses, per-subcategory and selected-year totals.
7. Health: surplus ratio, user-configured budgets and reserve figures, savings trend, missing-input states.

## Reproducible validation

`analytics-tests.js` contains synthetic fixtures only and can be executed with `window.runLedgerAnalyticsTests()` after loading `analytics-core.js`.

Latest source test result: **42 passed / 42 total**. Coverage includes refunds, over-refunds, cross-month transaction dates, equivalent comparison length, credit-card purchase/payment, bank transfer, edited/deleted/restored entries, empty ledgers, multi-category project tags, settlement dates, missing accounts, budget and emergency runway, and future transactions.

Seven-module DOM smoke runs passed with synthetic nonempty and empty ledgers. These checks verify core calculations and basic JavaScript rendering; they are **not** a substitute for real-world mobile/desktop/authentication/cloud synchronization acceptance tests.

## Pending work

- Complete end-to-end acceptance on actual iOS/Android/desktop devices.
- Full investment portfolio / principal-transfer schema, settled positions and dividends.
- Explicit future bills / recurring payment schedule and reliable cash forecasts.
- Advanced budgets per category, debt reconciliation, and automated account import.
- Multi-currency and installment accounting.
