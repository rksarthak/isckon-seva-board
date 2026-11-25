# ISKCON Amsterdam Seva Board

A website where volunteers pick seva (service) slots for temple festivals, and where admins manage festivals, see who signed up, export WhatsApp lists and clean up after events.

- **Volunteers** need no account. They open the page, pick slots, enter name, WhatsApp number and email, tick the consent box and confirm.
- **Admins** sign in with email and password. An admin can invite other admins with a one-time code and remove them again at any time.
- **Data** lives in Supabase (database + admin accounts + photos). **Hosting** is a Render Static Site from your GitHub repo. There is no server of your own to run.

Files: `index.html`, `app.js`, `styles.css`, `config.js` (your Supabase details), `schema.sql` (database), `demo.html` + `demo-backend.js` (try it without any setup: just open `demo.html`; sign in with `admin@demo.local` / `demo1234`).

## 1. Create the Supabase project (free)

1. Go to supabase.com, sign up, click **New project**. Choose a strong database password and a region close to you (for example Frankfurt).
2. Open **SQL Editor**, click **New query**, paste the whole content of `schema.sql` and press **Run**. It is safe to run again later.
3. Open **Authentication → Providers → Email** and switch **Confirm email** OFF (so new admins can sign in straight away without email setup). Security comes from the invite code, not from the email.
4. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key. (Never use the `service_role` key on the website.)

## 2. Put your details in `config.js`

Replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the two values you copied. The anon key is meant to be public: the database rules (row level security in `schema.sql`) decide what visitors may do. Also check `DEFAULT_COUNTRY_CODE` (`"31"` = Netherlands) and `CONTACT_TEXT`.

## 3. Put the files on GitHub

Create a new repository on github.com and upload all files from this folder (drag and drop in the browser works). You can leave out `demo.html` and `demo-backend.js` if you do not want the demo online.

## 4. Host on Render

1. On render.com sign up (you can use your GitHub login), click **New → Static Site**, and connect your repository.
2. Settings: **Build Command** empty (or `echo ok`), **Publish Directory** `.` (a single dot). Click **Create Static Site**.
3. When it is live you get a URL like `https://your-name.onrender.com`. Every time you push a change to GitHub, Render updates the site.
4. Back in Supabase, open **Authentication → URL Configuration** and set **Site URL** to your Render URL.

## 5. Create the first admin

1. In the Supabase **SQL Editor** run (choose your own long code, at least 12 letters or digits):
   `select create_setup_code('MY-LONG-SECRET-CODE-2026');`
2. Open your website, click **Admin sign-in** at the bottom, choose **Create admin account**, enter your email, a password (8+ characters) and that code. The code works once and expires after 2 days.

## Everyday use

- **Add a festival**: Admin → Festivals and seva → **+ New festival**. Pick a ready-made event (Janmashtami, Gaura Purnima, Radhashtami, Ratha Yatra, Govardhan Puja, Diwali, Narasimha Chaturdashi, Sunday Love Feast) to fill in name and description and, if you like, the usual list of services. Dates change each year, so choose the date yourself.
- **Add a service**: pick a common one (cleaning, dishes, cooking, kitchen help, transportation, decoration and more) or create your own. Set day, start and end time, how many people per slot, and the slot length (30 min to 3 hours). Day, times and slot length are locked once volunteers have signed up.
- **See who signed up**: Volunteers and export → each service lists names, phone, email and a WhatsApp button.
- **WhatsApp groups**: download the contacts CSV or `.vcf` (open the `.vcf` on your phone to add everyone to your contacts), or copy names + numbers. Numbers are converted to international format (06… becomes +316…).
- **Delete finished events**: Admin → Finished events lists festivals whose last day has passed and past services. Select and delete; sign-ups and the contact details of volunteers with no other sign-ups are removed with them. Download the backup CSV first if you need it.
- **Admins**: Admin → Admins → **Create invite code**, send the message to the person. They use *Create admin account* with the code. **Remove access** ends someone's admin rights immediately (you cannot remove yourself).
- **Forgot password**: reset the user in Supabase → Authentication → Users.

## Privacy

Volunteers see only the number of free places per slot, never other people's details. Contact details are readable only by admins. A consent text is shown before sign-up. Delete data after each festival (see above) and tell volunteers who to contact. Check Supabase's current free-plan limits and terms before relying on it (free projects can be paused when unused for a while).

## Notes

- The website loads the Supabase library from the jsDelivr CDN and fonts from Google Fonts. To avoid third parties, download them and serve them from your repository.
- The schema limits sign-ups to 30 per hour per internet address and checks capacity and overlaps on the server, so two people cannot take the last place at the same moment.
