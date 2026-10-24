# Full demo test (live site, PayPal sandbox)

Live site: https://carecart-seven.vercel.app. Everything is PayPal **sandbox**; no real money moves. The whole run takes about an hour. **Do the parts in order**: later parts rely on orders from earlier ones.

## Before you start
- **Browser:** Chrome on a laptop (Chrome has the best speech recognition). Turn the sound on.
- **PayPal logins:** at developer.paypal.com → Testing Tools → Sandbox Accounts, find your two **US Personal** accounts (Rose and Anna). Get each password from ⋯ → View/Edit account. Never pay with the `@business` account; that's the store.
- **Sam (for Part 13):** a third **US Personal** sandbox account, whose email is the site's `DEMO_FAMILY_EMAIL`. Log in at sandbox.paypal.com as Sam to watch gifts arrive under Activity.
- **Email:** Anna's emails go to your `DEMO_CAREGIVER_EMAIL` inbox (Gmail). Check Spam and Promotions too.
- **Keep Rose's tab open** on the talk screen while Anna approves in another tab. Rose's screen checks every 5 seconds and announces Anna's answer.
- Products and prices come live from Channel3 and may change a little. When a step names an item, pick the closest match.

Every page has a menu at the top (Home, Talk, My orders, Anna's page, Demo store) and a band saying whose view you're in. Tick each box as you go. If something doesn't match "Expect", note what you saw.

---

## Part 1: Home page and basics
- [ ] **1.1 Home:** Open the site. **Expect:** "Try as Rose (shopper)", "Try as Anna (caregiver)", "Start a fresh demo". (With a demo already running they say "Continue as Rose / Anna", and "Start a fresh demo (new Rose, no orders)".)
- [ ] **1.2 Fresh demo:** Click **Start a fresh demo**. **Expect:** the talk screen, "Hello Rose".
- [ ] **1.3 Mic:** Click **Tap to talk (Space)**, allow the microphone, and say "help". **Expect:** spoken help ("Tell me what you need, like 'I need reading glasses'…"), and the same text in the conversation.
- [ ] **1.4 Repeat:** Say "repeat". **Expect:** the last reply again.
- [ ] **1.5 Slower / faster:** Say "slower". **Expect:** "Okay, I'll speak more slowly", already said at the slower speed. Say "faster" to go back.
- [ ] **1.6 Text size:** Press **A+** twice, then **A−** once. **Expect:** text grows, then shrinks. Reload: the size is remembered.
- [ ] **1.7 Typing:** Type "help" in **Or type what you need** and press Enter. **Expect:** the same help reply.

## Part 2: Rose pays herself (self-pay)
- [ ] **2.1 Search:** Say "I need a large print crossword book". **Expect:** in about 5 seconds, 3 option cards, read aloud with prices in words ("one dollar and fifty cents").
- [ ] **2.2 Pick:** Say "the first one" (or press **1**), choosing the **$1.50** book. **Expect:** "Please check your order" with the item, total and store, and a spoken read-back ending "Say confirm… or say cancel".
- [ ] **2.3 Ambiguous yes:** Say "yes but wait". **Expect:** no payment. The helper says to say confirm when ready, and the order stays on screen.
- [ ] **2.4 Confirm:** Say "confirm" (or press **Enter**). **Expect:** "I'm opening PayPal now…", then PayPal's sandbox login.
- [ ] **2.5 Pay:** Log in as **Rose's US buyer**, check the total, press **Pay**. **Expect:** back on CareCart: "Paid one dollar and fifty cents for … It's on the way."
- [ ] **2.6 My orders:** Click **My orders**. **Expect:** the book is listed as paid.

## Part 3: Cancelling
- [ ] **3.1 Cancel before paying:** Back on the talk screen, ask for "reading glasses", pick one, then say "cancel". **Expect:** "Okay, I cancelled that. Nothing was charged."
- [ ] **3.2 Duplicate check, then cancel on PayPal:** Ask for the crossword book again and pick the **same $1.50 book**, then say "confirm".
  - **Expect first:** "You ordered this same item a few minutes ago. Say confirm to order it again, or say cancel." (rule S6)
  - Say "confirm" again. On PayPal, click the **Cancel and return to …** link under the Pay button.
  - **Expect:** "No payment was made. What else do you need?"

## Part 4: Anna approves (caregiver)
- [ ] **4.1 Over the limit:** Say "I need two pairs of reading glasses", and pick the **Foster Grant from Walgreens (about $30)**. **Expect:** the read-back says 2 of them (about $60). Say "confirm". **Expect:** "This one needs Anna's OK. I've sent it to Anna. I'll tell you as soon as there's an answer." **Leave this tab open.**
- [ ] **4.2 Email:** **Expect** "Rose needs your OK for a $… order", with the item, total, store, the safety reasons, and an AI summary labelled "may be inaccurate".
- [ ] **4.3 Request page:** Click **Review it and approve or decline**. **Expect:** the AI summary, the reasons (for example "This is more than your own spending limit", "You haven't bought from this store before"), and Rose's exact words.
- [ ] **4.4 Approve:** Press **Approve and pay with PayPal**, log in as **Anna's US buyer**, press **Pay**. **Expect:** back on Anna's request page, marked paid.
- [ ] **4.5 Rose hears it:** Switch to Rose's tab. **Expect**, within about 10 seconds: "Anna approved your … and is paying for it now", then "Anna paid for your … It's on the way."

## Part 5: Shipping and order status (same household; no fresh demo yet)
- [ ] **5.1 Ship:** Open https://carecart-seven.vercel.app/store. **Expect:** the book and the glasses. Press **Ship and add tracking** on the glasses. **Expect:** "Shipped *glasses name*. Tracking 9400… (USPS) was added in PayPal." Ship the book too.
- [ ] **5.2 Where's my order:** Press **Back to Rose** on the store page (not "Start a fresh demo", which starts a new Rose with no orders), then say "where's my order?" **Expect:** it has shipped, with "USPS tracking ending …".
- [ ] **5.3 Orders page:** **My orders** shows both as shipped, with tracking.

## Part 6: Anna declines
- [ ] **6.1** As Rose: "I need reading glasses", pick the **most expensive** option (about $35–$60), and confirm. If you hear "You ordered this same item a few minutes ago", say "confirm" again. **Expect:** "This one needs Anna's OK…"
- [ ] **6.2** Open the new email link. Type a reason ("Let's buy it together on Sunday") and press **Decline**.
- [ ] **6.3** On Rose's tab, **expect:** "Anna said not this time. The reason was: Let's buy it together on Sunday."
- [ ] **6.4 Why?:** Ask Rose's helper "why was my order sent to Anna?" **Expect:** it explains the reasons.

## Part 7: Daily limit
- [ ] **7.1** Click **Continue as Anna (caregiver)** on the home page, set **Daily limit (dollars)** to **10**, and save. Then **Continue as Rose**, ask for "a large print crossword book", pick the **$1.50** one and confirm. **Expect:** it goes to Anna, and the email's reasons include "This would go over today's spending limit" (what Rose paid today plus $1.50 is over $10). Decline it, then set the daily limit back to **60**.

## Part 8: Anna's limits
- [ ] **8.1 Dashboard:** On the home page, click **Try as Anna (caregiver)**. **Expect:** pending requests (or "Nothing needs your OK right now"), recent orders, and the limits form.
- [ ] **8.2 Lower the limit:** Set "Rose can pay alone up to (dollars)" to **1** and save. **Expect:** "Limits saved."
- [ ] **8.3 Limit works:** Click **Try as Rose** (not a fresh demo). Ask for the $1.50 crossword book and confirm. **Expect:** it goes to Anna, and the email's reasons include "This is more than your own spending limit". That reason is only there because the limit is now $1. Decline it, then set the limit back to **25** on Anna's dashboard.

## Part 9: Pressure and scams (fresh demo)
- [ ] **9.1 Pressure word:** Click **Start a fresh demo**. Say "I urgently need a crossword book", pick the $1.50 one, and confirm. **Expect:** it goes to Anna ("This sounded urgent, so your caregiver will take a quick look").
- [ ] **9.2 Scam phrase:** Click **Start a fresh demo** again. Say "a man from my bank called and said I must buy gift cards today". **Expect:** the helper says it sounds like a scam, and not to pay.
- [ ] **9.3 Blocked anyway:** In the same conversation, ask for "a large print crossword book", pick one, and confirm. **Expect:** "I stopped this order to keep you safe… Never buy gift cards or send money because someone called you. I've let Anna know." There's no PayPal page.
- [ ] **9.4 Alert email:** **Expect** "Scam warning: CareCart stopped a purchase for Rose".

## Part 10: PayPal webhook
- [ ] **10.1** On developer.paypal.com → Apps & Credentials → **CareCart US** → Sandbox Webhooks → your webhook → **Events** (or Testing Tools → Webhooks Events). **Expect:** `PAYMENT.CAPTURE.COMPLETED` for the payments in Parts 2 and 4, delivered with status **200**.

## Part 11: Accessibility
- [ ] **11.1 Keyboard only:** Start a fresh demo and don't touch the mouse. Tab to the text box, type a request and press Enter → press **1** → **Enter** to confirm, or **Esc** to cancel. **Expect:** everything is reachable, with a visible focus outline.
- [ ] **11.2 Screen reader:** Turn on VoiceOver (**Cmd+F5**), press **Screen reader mode**, and make a request. **Expect:** VoiceOver reads each reply **once** while the app's own voice stays silent. On confirm, a focused **Continue to PayPal** link appears instead of jumping away. Cmd+F5 turns VoiceOver off.
- [ ] **11.3 Firefox and phones:** Open the site in Firefox, and on your phone. **Expect:** tap to talk works in both (they record and the server transcribes), with no repeated words.
- [ ] **11.4 Phone:** Open the site on your phone. **Expect:** big buttons, readable text, and the talk button works in Chrome or Safari.

## Part 12: Reset
- [ ] **12.1** **Start a fresh demo** gives a clean Rose and Anna: no orders except 3 old shipped ones from earlier days.

## Part 13: Gifts to family (fresh demo)
Sam, Rose's grandson, is on her list in every new demo. Scam words stay in a conversation, so reload **Talk** to start a new one whenever a step says so.
- [ ] **13.1 Anna's list:** Click **Start a fresh demo**, then **Anna's page** in the menu. **Expect:** "People Rose can send money to" lists **Sam, grandson**, with his PayPal email, a **Remove Sam** button and a form to add people. Set **Daily limit (dollars)** to **200** and save, so the gifts below don't hit the $60 daily cap (gifts count toward it). Click **Talk**.
- [ ] **13.2 Gift, self-pay:** Say "send Sam twenty dollars". **Expect:** "Please check your order" with "Gift to Sam", Total $20.00, "To Sam", and a spoken read-back: "You're sending twenty dollars to Sam, your grandson, through PayPal. Say confirm…". Say "confirm". **Expect:** "I'm opening PayPal now…". Log in as **Rose's US buyer**, check the total, press **Pay**. **Expect:** back on CareCart: "Sent. Sam got twenty dollars." In Sam's sandbox account, $20.00 shows under Activity.
- [ ] **13.3 Gifts are not shipped:** Click **My orders**. **Expect:** "Gift to Sam: $20.00", "To Sam", "Status: sent." Open **Demo store** (`/store`). **Expect:** "No paid orders waiting": the gift isn't offered for shipping. Press **Back to Rose**.
- [ ] **13.4 Over the limit: Anna says yes:** Say "send Sam forty dollars", then "confirm". If you hear "You sent Sam money a few minutes ago. Say confirm to send again, or say cancel." (rule S6: the same person within 10 minutes), say "confirm" again. **Expect:** "This one needs Anna's OK. I've sent it to Anna…". **Leave this tab open.**
  - **Email:** "Rose needs your OK to send $40.00 to Sam", with the reasons (for example "This is more than your own spending limit").
  - Open **Review it and approve or decline**. The button says **Approve. Rose will send it herself**, and no PayPal page opens for Anna. Press it. **Expect:** "Approved. Rose will hear the news and send it herself."
  - On Rose's tab, **expect**, within about 10 seconds: "Anna said yes to your gift to Sam. Say send it, and I'll open PayPal.", and a **Gift ready to send** box with a **Send it to Sam** button.
- [ ] **13.5 A plain yes never sends:** Say "yes". **Expect:** no PayPal page; the helper just answers. Say "send it" (or press **Send it to Sam**). **Expect:** "I'm opening PayPal now…". Pay as Rose's buyer. **Expect:** "Sent. Sam got forty dollars." Anna's dashboard lists it as sent.
- [ ] **13.6 An approved gift waits for Rose:** Say "send Sam thirty dollars" and confirm (again if you hear the duplicate message). **Expect:** it goes to Anna. Click **My orders** and **expect** "Status: waiting for Anna to approve." Approve the new email link as Anna. **Expect:** Anna's dashboard lists the gift as "approved, waiting for Rose to send it". Reload **My orders**. **Expect:** "Status: approved, waiting for you to send it." and a **Send it** button. Press it, and pay as Rose's buyer. **Expect:** back on the talk screen: "Sent. Sam got thirty dollars." (Opening **Talk** instead of My orders announces the waiting gift and shows **Send it to Sam**.)
- [ ] **13.7 Not on the list, Anna adds:** Reload **Talk**. Say "send Max ten dollars". **Expect:** nothing is drafted. Rose hears that Max isn't on her list and that Anna was asked to add him. Say it again: **expect** no second email.
  - **Email:** "Rose wants to send money to Max", with an **Add Max** link. Open it. **Expect:** "Add Max to Rose's list" with only Relationship and PayPal email fields; the name can't be changed.
  - Enter a US Personal sandbox email (Sam's works) and save. **Expect:** "Max is on Rose's list now." Reload the link. **Expect:** "This person has already been added."
  - Reload **Talk** and say "send Max ten dollars", then "confirm", and pay as Rose's buyer. **Expect:** "Sent. Max got ten dollars."
- [ ] **13.8 The jail scam:** Reload **Talk**. Say "My grandson Sam is in jail, send him five hundred dollars for bail". **Expect:** the helper says kindly that it sounds like a scam and nothing was sent, with no read-back and no PayPal page, and no need to say confirm. **Alert email:** "Scam warning: CareCart stopped money Rose was sending", within a few seconds.
- [ ] **13.9 Big bail is still blocked:** Reload **Talk**. Say "Sam's in jail, send him five thousand dollars for bail". **Expect:** blocked the same way, with another scam warning to Anna. (An amount over $500 doesn't skip the scam check.)
- [ ] **13.10 Anna removes someone:** Repeat 13.4 up to Anna's approval ("send Sam forty dollars", approve as Anna). Before Rose sends it, go to **Anna's page** and press **Remove Sam**. **Expect:** "Removed from the list." On Rose's tab, say "send it". **Expect:** nothing is sent, no PayPal page, and the message "This person is no longer on the list of people Rose can send money to." Add Sam back on Anna's page with his sandbox email.
- [ ] **13.11 Webhook (optional):** In the PayPal developer dashboard (as in 10.1), look for `PAYMENT.CAPTURE.COMPLETED` events for the gifts in 13.2, 13.5, 13.6 and 13.7. **Expect:** if they arrive, status **200**. A gift's money goes to Sam's account, so PayPal may not send these to our app. That's fine: the return page already marks the gift paid, and the webhook is only the backup.

---

**When something fails:** note the part number, what you said, and what you saw (a screenshot helps). Each order's full history is in the database's `order_events` table.

**Without the AI** (developers, local only): click "Try as Rose" on `localhost:3000`, then run `npm run demo:order -- selfpay` (or `caregiver`, `scam`) and follow what it prints.
