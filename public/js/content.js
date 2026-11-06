/* Golden editorial library. Plain structured text, never contributor HTML.
   The backend can publish updates through its authenticated content settings;
   GitHub Pages uses this bundled library and labels it as device-local. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GFS_CONTENT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '2026.11.06-1';
  const CATEGORIES = ['Loan planning', 'Business', 'Agriculture', 'Salary & budgeting', 'Security', 'Repayments'];
  const author = 'Golden Editorial Team';
  const BLOG_POSTS = [
    {
      slug: 'choose-the-right-loan', title: 'Five loan options: how to choose the right fit',
      excerpt: 'Start with the purpose, compare the full repayment and check the requirements—not just the amount you can borrow.',
      category: 'Loan planning', author, publishedAt: '2026-11-06', updatedAt: '2026-11-06', productId: 'PL', art: 'plans', featured: true,
      tags: ['Personal', 'Business', 'Salary Advance', 'Agriculture', 'Emergency'],
      takeaway: 'Choose the smallest amount that meets a clear need and leaves room in your budget for the repayment.',
      sections: [
        { title: 'Begin with the purpose', paragraphs: ['A useful loan starts with a specific need. Write down what you are paying for, when the money is needed and whether the expense can wait. A business restocking before a busy trading period is different from an urgent household repair.', 'Golden publishes five categories: Personal, Business, Salary Advance, Agriculture and Emergency. The category helps organise the application, but affordability and document review still determine whether an offer is available.'] },
        { title: 'Match the need to a category', paragraphs: ['Use the product pages to compare the published amount range, term, monthly rate and arrangement fee. Prepare evidence that explains the purpose and your repayment source.'], bullets: ['Personal: planned household expenses with a verifiable repayment source.', 'Business: working capital, stock or equipment supported by trading records.', 'Salary Advance: a short-term bridge for confirmed employees, checked against payday.', 'Agriculture: inputs or farm equipment supported by a season plan and budget.', 'Emergency: an urgent, unexpected expense with a realistic short-term repayment plan.'] },
        { title: 'Compare the full cost', paragraphs: ['The instalment is only one part of the decision. Look at total repayable interest, the arrangement fee deducted at disbursement, and the dates on which payments fall due. A longer term can reduce an instalment while increasing the total interest cost.', 'Use the calculator with the same amount across products and terms. Its schedule is illustrative: actual interest accrues daily on unpaid principal. Read the current offer before signing.'] },
        { title: 'Check before you commit', paragraphs: ['Leave space for food, rent, utilities, existing debt and savings. Borrowing the maximum is not the same as borrowing comfortably. If the numbers are tight, reduce the amount, reconsider the timing or ask support about the requirements.'], bullets: ['Confirm the net amount after the arrangement fee.', 'Check guarantor and collateral requirements.', 'Keep your application reference and read the agreement.', 'Never treat a calculator estimate or sandbox approval as a live credit offer.'] }
      ]
    },
    {
      slug: 'understand-declining-balance-interest', title: 'Declining-balance interest, explained in plain language',
      excerpt: 'Why the principal balance matters, how a repayment is allocated and what changes when you pay early.',
      category: 'Loan planning', author, publishedAt: '2026-11-05', updatedAt: '2026-11-05', productId: 'PL', art: 'interest',
      tags: ['Interest', 'Calculator', 'Early settlement'],
      takeaway: 'Interest is tied to the unpaid principal and time. Verified principal repayments reduce the balance on which future interest accrues.',
      sections: [
        { title: 'The balance is the starting point', paragraphs: ['A declining-balance calculation uses the principal that remains unpaid. As verified repayments reduce that principal, the interest calculation has a smaller base. This is different from charging interest on the original amount for the entire term.', 'The published monthly percentage is converted using the actual number of days and a 365-day year in the backend. The calculator provides an illustrative schedule so you can compare options before applying.'] },
        { title: 'One payment can cover several buckets', paragraphs: ['A verified payment is allocated in the published order: penalties, fees, interest and then principal. The receipt and loan ledger show the allocation. Sending money or submitting a transfer reference does not itself verify a payment.', 'Check the payment status in your portal. A pending or awaiting-verification reference is not evidence that the outstanding balance has already fallen.'] },
        { title: 'Why an estimate may differ', paragraphs: ['Payment dates, partial payments, outstanding fees and accrued interest can make the actual payoff different from a simple scheduled total. The loan detail page and settlement quote use your recorded balance and the applicable rules.', 'A quote is time-sensitive. Request a fresh settlement quote on the day you intend to settle, and follow the verified payment instructions rather than guessing the amount.'] },
        { title: 'Early repayment and future interest', paragraphs: ['Early settlement pays the outstanding principal, interest accrued to the quote date, fees and penalties. Future interest that has not accrued is waived under the published settlement rules.', 'Use the calculator to explore scenarios, then use your own portal records for an actual decision. Educational examples are not a replacement for your signed agreement.'] }
      ]
    },
    {
      slug: 'prepare-a-business-loan-application', title: 'Prepare a stronger business loan application',
      excerpt: 'A practical way to organise trading records, explain working capital and separate business cash flow from household spending.',
      category: 'Business', author, publishedAt: '2026-11-04', updatedAt: '2026-11-04', productId: 'BL', art: 'business',
      tags: ['SMEs', 'Working capital', 'Documents'],
      takeaway: 'Clear records and a specific use of funds make it easier to assess the request; they do not guarantee approval.',
      sections: [
        { title: 'Describe the business clearly', paragraphs: ['Use a consistent business name, location and contact details. Explain what you sell, who your customers are and how long you have traded. If the business is informal, prepare the evidence that is genuinely available rather than inventing registration details.', 'Keep personal and business information in the correct profile sections. The application should explain why the business needs funds now.'] },
        { title: 'Build a working-capital picture', paragraphs: ['List expected sales, stock purchases, rent, wages, transport and other regular costs. Note slow periods and outstanding customer balances. A lender needs to understand the cash available for repayments, not only the value of stock.', 'Separate household expenses from business expenses. If you withdraw cash from the business for family use, include that pattern in your budget.'] },
        { title: 'Organise the evidence', paragraphs: ['Prepare identity documents, trading or registration evidence where applicable, bank or mobile-money statements and a clear purpose. Larger requests may require collateral and an independent valuation.'], bullets: ['Write down the amount needed and what it will purchase.', 'Keep supplier quotations or invoices relevant to the request.', 'Record existing debts and their repayment dates.', 'Ask guarantors for informed consent and valid identity evidence.'] },
        { title: 'Review the offer, not just the decision', paragraphs: ['An approved offer still needs careful reading. Check the net disbursement after the fee, the repayment frequency and the total cost. Confirm that the expected cash flow can cover the instalment during slower trading periods.', 'A request for a top-up, renewal or restructuring does not change the contract until an authorised decision is recorded. Keep every reference in the portal.'] }
      ]
    },
    {
      slug: 'plan-farm-finance-around-the-season', title: 'Plan farm finance around the season—not wishful prices',
      excerpt: 'Map input costs, labour, transport and realistic harvest income before taking on an agriculture repayment.',
      category: 'Agriculture', author, publishedAt: '2026-11-03', updatedAt: '2026-11-03', productId: 'AL', art: 'agriculture',
      tags: ['Agriculture', 'Season planning', 'Cash flow'],
      takeaway: 'Use conservative income assumptions and check repayment dates against the season. Do not assume a harvest will automatically change your contract.',
      sections: [
        { title: 'Cost the whole season', paragraphs: ['Seed and fertiliser are only part of the picture. Include land preparation, labour, transport, storage, pest control and expected losses. Write down when each cost must be paid so the borrowing need is tied to a timetable.', 'Keep quotations and a simple season plan. Evidence should describe the activity you actually undertake and the land or production arrangement you can verify.'] },
        { title: 'Use cautious income assumptions', paragraphs: ['Estimate income using more than one possible price and yield. A favourable market is not guaranteed. Separate crops or livestock sold at different times and allow for costs after harvest.', 'If the household has other income, record it separately. Do not count the same expected sale twice or treat uncertain income as already received.'] },
        { title: 'Check the repayment calendar', paragraphs: ['Compare the published repayment dates with expected cash inflows. Agriculture products have published terms and frequencies; a seasonal need does not automatically create a harvest-only repayment holiday.', 'If the dates do not fit, discuss the request before signing. Any restructuring requires review and an authorised decision. The calculator can help you compare a smaller amount or different term.'] },
        { title: 'Keep a record through harvest', paragraphs: ['Track input purchases, sales and repayments. Keep provider receipts and check that references are verified in the portal. Good records support future applications but do not remove affordability checks.'], bullets: ['Prepare a season budget and evidence of farming activity.', 'Check guarantor requirements and consent.', 'Review the net disbursement and full schedule.', 'Contact support early if weather or market conditions affect repayment.'] }
      ]
    },
    {
      slug: 'salary-advance-before-payday', title: 'Before payday: a calmer way to consider a salary advance',
      excerpt: 'Check the next pay date, existing deductions and essential expenses before using tomorrow’s salary today.',
      category: 'Salary & budgeting', author, publishedAt: '2026-11-02', updatedAt: '2026-11-02', productId: 'SA', art: 'salary',
      tags: ['Salary Advance', 'Budget', 'Payday'],
      takeaway: 'An advance reduces the money available after the next repayment. Check the whole month, not only the gap before payday.',
      sections: [
        { title: 'Identify the temporary gap', paragraphs: ['A salary advance is designed for a short-term cash-flow gap, not a permanent increase in income. Write down the expense, the expected net salary and the date it normally arrives.', 'If the gap repeats every month, address the underlying budget. Repeated borrowing can make the next month harder even when each individual advance is small.'] },
        { title: 'Count existing commitments', paragraphs: ['Include rent, food, transport, school costs, other loan repayments and regular family support. Check whether payroll deductions or delayed salary could affect the amount actually available.', 'Use current payslips and employment evidence. The published product requirements include confirmed employment and a salary paid through a verifiable channel.'] },
        { title: 'Compare the net benefit', paragraphs: ['Review the arrangement fee, interest and total repayable amount. Confirm the net disbursement is enough for the stated need without borrowing more than necessary.', 'The standard Salary Advance product does not require a guarantor, but identity, employment and affordability checks still apply. A sandbox approval is only a demonstration.'] },
        { title: 'Plan the following month', paragraphs: ['After the repayment, list what remains for essential expenses. If the remainder is not workable, consider a smaller amount or another option before accepting an offer.', 'Set a reminder ahead of the due date and keep the receipt. If circumstances change, contact support early rather than assuming the repayment date will move.'] }
      ]
    },
    {
      slug: 'emergency-borrowing-checklist', title: 'Emergency borrowing: five checks before you accept',
      excerpt: 'Urgency makes clear terms more important. Use a short checklist to avoid solving one problem by creating another.',
      category: 'Loan planning', author, publishedAt: '2026-11-01', updatedAt: '2026-11-01', productId: 'EL', art: 'emergency',
      tags: ['Emergency', 'Affordability', 'Planning'],
      takeaway: 'Borrow only what the verified urgent need requires, and check the short-term repayment against money you can realistically access.',
      sections: [
        { title: 'Confirm the amount needed', paragraphs: ['Ask for an invoice or written estimate where possible. Separate the immediate essential cost from expenses that can wait. A precise amount is easier to assess than a round figure chosen in a hurry.', 'Check whether the arrangement fee means the net disbursement will cover the essential cost. Do not increase borrowing automatically without reviewing the repayment.'] },
        { title: 'Check the repayment source', paragraphs: ['Identify the income or other realistic source that will fund the repayment. Do not rely on an unconfirmed promise or another loan that has not been approved.', 'Emergency terms are short. Compare the instalment with existing obligations and essential spending before accepting.'] },
        { title: 'Verify who you are dealing with', paragraphs: ['Use the official website or a confirmed branch contact. Never share a mobile-money PIN, password or one-time code with someone claiming they can speed up approval.', 'A payment reference should come from your portal or verified branch instructions. Report suspicious messages through the complaints and support route.'] },
        { title: 'Read before signing', paragraphs: ['Check the rate, fee, due dates, guarantor requirement and total repayable. An urgent need does not remove your right to understand the agreement.', 'Keep the signed terms and follow the application status. Live disbursement requires an authorised record; a screen saying “approved” is not proof that money has been sent.'] }
      ]
    },
    {
      slug: 'protect-your-money-from-otp-scams', title: 'PINs, passwords and OTPs: keep the keys to your account',
      excerpt: 'Recognise pressure tactics, verify payment instructions and know what to do if you suspect a scam.',
      category: 'Security', author, publishedAt: '2026-10-30', updatedAt: '2026-10-30', art: 'security',
      tags: ['OTP', 'Mobile money', 'Fraud prevention'],
      takeaway: 'Never share a password, PIN or one-time code. Stop the conversation and contact a verified branch or the official support route.',
      sections: [
        { title: 'Secrets stay secret', paragraphs: ['A one-time code is a key for a specific action. Sharing it can allow someone to sign in, reset a password or approve an action in your name. Staff do not need your mobile-money PIN to explain a loan.', 'Use a unique password and enable two-factor authentication in the secure backend when your phone is verified. Sandbox codes are demonstrations and should not be confused with live messages.'] },
        { title: 'Pressure is a warning sign', paragraphs: ['Be cautious of messages demanding an immediate fee to “release” a loan, threatening arrest, or asking you to move money to a personal number. Urgency and secrecy are common pressure tactics.', 'Check the address and contact details independently. Do not rely on a phone number supplied in the suspicious message itself.'] },
        { title: 'Verify payment references', paragraphs: ['Create a reference through the portal and use confirmed provider or branch instructions. A customer-submitted bank reference is a claim awaiting reconciliation, not a verified payment.', 'Keep the provider receipt. If the amount, destination or reference looks wrong, stop and ask support before sending more money.'] },
        { title: 'Act quickly if something feels wrong', paragraphs: ['Change your password through the official site, review active sessions and contact support. Tell the payment provider promptly if money may have moved.', 'Record dates, references and the message content, but do not post secret codes or identity documents publicly. The Security Centre explains the steps in more detail.'] }
      ]
    },
    {
      slug: 'build-a-repayment-routine', title: 'Build a repayment routine you can actually keep',
      excerpt: 'Use reminders, verified references and a simple monthly check to keep your loan records clear.',
      category: 'Repayments', author, publishedAt: '2026-10-28', updatedAt: '2026-10-28', art: 'repayments',
      tags: ['Repayments', 'Receipts', 'Statements'],
      takeaway: 'Check the status after every payment and keep the receipt. A submitted reference is not the same as a verified repayment.',
      sections: [
        { title: 'Know the due date', paragraphs: ['Check the current schedule in your portal rather than relying only on an old estimate. Partial or advance payments can affect the remaining balance and allocation.', 'Place a reminder before the due date, allowing time for provider processing or bank reconciliation. The published grace period is not a reason to delay deliberately.'] },
        { title: 'Use a unique reference', paragraphs: ['Start from the payment workflow and follow the available instructions. Unique references help match money to the correct loan and reduce reconciliation problems.', 'For mobile money, wait for the provider outcome. For bank transfer or cash, submit the requested evidence and check whether the status remains awaiting verification.'] },
        { title: 'Check the receipt and allocation', paragraphs: ['A verified payment produces a receipt and updates the ledger. Review the amount and allocation to penalties, fees, interest and principal. Keep the receipt reference with your records.', 'If a payment is pending or failed, do not assume another attempt is safe without checking the reference and support guidance. Idempotency protects retries with the same request key, not every new payment attempt.'] },
        { title: 'Review once a month', paragraphs: ['Download a statement, compare it with your own budget and check the next due date. Request a fresh settlement quote if you intend to clear the loan early.', 'Contact support before a missed payment where possible. A restructuring request is recorded for review; it does not change the existing schedule until authorised.'] }
      ]
    }
  ];
  const CHECKLIST = [
    { id: 'purpose', group: 'Your plan', title: 'Write down the purpose and exact amount', detail: 'Separate essential costs from expenses that can wait.' },
    { id: 'compare', group: 'Your plan', title: 'Compare the five loan categories', detail: 'Check limits, terms, rates, fees and security requirements.' },
    { id: 'budget', group: 'Your plan', title: 'Test the instalment in your monthly budget', detail: 'Include existing debt, essential spending and a buffer.' },
    { id: 'identity', group: 'Your documents', title: 'Prepare valid identity evidence', detail: 'Use a national ID, passport or driving licence accepted for review.' },
    { id: 'income', group: 'Your documents', title: 'Gather repayment-source evidence', detail: 'Payslips, statements, trading records or a season plan as applicable.' },
    { id: 'contacts', group: 'Your documents', title: 'Check your contact and next-of-kin details', detail: 'Use details you control and can verify.' },
    { id: 'guarantor', group: 'Your commitments', title: 'Discuss guarantor consent honestly', detail: 'Do not submit someone as a guarantor without informed consent.' },
    { id: 'security', group: 'Your commitments', title: 'Understand any collateral requirement', detail: 'Ownership evidence and professional valuation may be needed.' },
    { id: 'terms', group: 'Before signing', title: 'Read the current offer and agreement', detail: 'Check net disbursement, total cost, due dates and decision conditions.' },
    { id: 'records', group: 'Before signing', title: 'Know where your records will be kept', detail: 'Keep references, receipts, statements and support messages together.' }
  ];
  const SECURITY_TIPS = [
    { icon: 'lock', title: 'Keep codes private', body: 'Never share your password, mobile-money PIN or one-time verification code—even with someone claiming to be staff.' },
    { icon: 'phone', title: 'Verify the contact', body: 'Use contact details from the official website or a confirmed branch. Do not trust a number sent in an unexpected message.' },
    { icon: 'card', title: 'Check the destination', body: 'Use your unique payment reference and verified provider instructions. Stop if asked to send money to an unexplained personal account.' },
    { icon: 'clock', title: 'Resist pressure', body: '“Pay now to release funds” and threats of instant arrest are warning signs. Pause and ask for independent confirmation.' },
    { icon: 'shield', title: 'Secure your session', body: 'Use a unique password, enable two-factor authentication and sign out on shared devices. Review active sessions regularly.' },
    { icon: 'headset', title: 'Report quickly', body: 'Contact the provider if money moved, secure your account and open a tracked support ticket with dates and references.' }
  ];
  const readingMinutes = post => Math.max(2, Math.ceil((String(post?.excerpt || '') + ' ' + (post?.sections || []).map(s => (s.title || '') + ' ' + (s.paragraphs || []).join(' ') + ' ' + (s.bullets || []).join(' ')).join(' ')).split(/\s+/).length / 220));
  return { VERSION, CATEGORIES, BLOG_POSTS, CHECKLIST, SECURITY_TIPS, readingMinutes };
});
