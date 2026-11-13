# TUONTA

Notes, tasks and flashcards for work, projects and study. It's an installable web app (PWA) that works offline and syncs to a **TUONTA** folder in each user's own Google Drive.

Your link once it's live: **https://shilrickmonsuller.github.io/tuonta/**

---

## Part 1 — Put it on GitHub (about 10 minutes)

1. **Unzip** `tuonta.zip`. Inside you'll see `index.html`, `app.css`, `config.js`, `sw.js`, `manifest.webmanifest`, `README.md`, and the folders `js`, `icons`, `fonts` and `vendor`.
2. On GitHub, click **+ → New repository**. Name it `tuonta`, set it to **Public**, and click **Create repository**.
3. On the empty repo page, click **uploading an existing file**.
4. Select **everything inside** the unzipped folder, including all 4 folders, and drag it onto the page. Drag the contents, not the outer folder, so `index.html` ends up at the top level. Wait until every file is listed. `pdf.worker.min.js` is about 1 MB.
5. Type the message `Launch TUONTA` and click **Commit changes**.
6. Check that the repo shows `index.html` plus the `js`, `icons`, `fonts` and `vendor` folders.
7. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then click **Save**.
8. Wait 1–2 minutes, then refresh. Open **https://shilrickmonsuller.github.io/tuonta/**.

TUONTA now works **offline on your device**. To add Google sign-in and Drive sync, do Part 2.

---

## Part 2 — Google sign-in + Drive sync (about 20 minutes)

### A. Firebase project
1. Go to **console.firebase.google.com**, click **Create a project**, and name it `TUONTA`. You can turn Google Analytics off.
2. Go to **Build → Authentication → Get started → Sign-in method**. Click **Google**, turn on **Enable**, pick your support email, and click **Save**.
3. Still in Authentication, open **Settings → Authorized domains**. Click **Add domain**, enter `shilrickmonsuller.github.io`, and click **Add**.
4. Open **Project settings** (the gear icon) **→ General → Your apps** and click the **Web** icon `</>`. Use the nickname `TUONTA`. Leave Hosting unticked and click **Register app**.
5. Copy these 4 values from the code shown: `apiKey`, `authDomain`, `projectId`, `appId`.

### B. Google Cloud (same project)
1. Go to **console.cloud.google.com** and pick the **TUONTA** project at the top.
2. Go to **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.
3. Open **Google Auth Platform** (also called *OAuth consent screen*):
   - **Branding:** App name `TUONTA`, your support email, and app home page `https://shilrickmonsuller.github.io/tuonta/`. Skip the logo, because adding one makes Google review the app.
   - **Audience:** User type **External**. Click **Publish app** so it shows *In production*. Without this, only test users you add by hand can sign in.
   - **Data access → Add or remove scopes:** tick `.../auth/drive.file`, `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`, then click **Save**. `drive.file` only lets TUONTA see files it created itself.
4. Go to **Clients** (or **APIs & Services → Credentials**) and open **Web client (auto created by Google Service)**:
   - Under **Authorized JavaScript origins**, add `https://shilrickmonsuller.github.io`
   - Under **Authorized redirect URIs**, add `https://shilrickmonsuller.github.io/tuonta/` and keep the slash at the end.
   - Click **Save**, then copy the **Client ID**. It ends in `.apps.googleusercontent.com`.

### C. Fill in config.js and upload it
1. Open `config.js` in a text editor (Notepad is fine) and paste in your values:
   ```js
   googleClientId: "1234…apps.googleusercontent.com",
   firebase: { apiKey: "…", authDomain: "tuonta-xxxx.firebaseapp.com", projectId: "tuonta-xxxx", appId: "1:…:web:…" }
   ```
2. On GitHub, open the repo and go to **Add file → Upload files**. Upload `config.js`, then click **Commit changes**.
3. Wait 2 minutes. Fully close TUONTA and reopen it. You may need to do this twice. Go to **Menu → Sync & backup → Sign in with Google**.

Google changes for a few minutes after you save them. If sign-in says *redirect_uri_mismatch*, check the redirect URI in B.4 again, wait 5 minutes and try again.

---

## Part 3 — Install it on your phone
- **iPhone:** open the link in **Safari**, tap **Share**, then **Add to Home Screen**.
- **Android:** open it in **Chrome**, then tap **Install**, or go to menu ⋮ **→ Install app**.
- Then open **Settings** in TUONTA and tap **Protect my data**. Every few weeks, go to **Sync & backup → Download backup**.

---

## What's in your Google Drive
- `TUONTA/Notes/<notebook>/<note>.md` holds a readable copy of each note.
- `TUONTA/Attachments/` holds your photos, PDFs, files and voice notes.
- `TUONTA/TUONTA data (do not edit).json` is what the app syncs from. Don't edit it.

## Good to know
- **Reminders** pop up while TUONTA is open, and overdue ones show on the Today card. Background push notifications (Firebase Blaze plan) can be added later.
- If the same note is edited on two devices before syncing, the newer edit wins. The other version is kept under **Earlier versions** in that note.
- **Search** covers titles, note text, #tags and text inside PDFs and text files. Text inside photos isn't searched.
- Google sign-in lasts about an hour. After that, TUONTA quickly reconnects when you open it.

## Updating later
When you get a new version, upload the changed files the same way. `sw.js` holds a version number. A changed number is how phones know to fetch the new files.
