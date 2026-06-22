# Publishing tome-app to GitHub

Steps to run before pushing the `tome-app` branch to a new public GitHub repo.

## 1. Audit git history for secrets

```powershell
git log --all -p | Select-String -Pattern "sk_live|sk_test|PGPASSWORD|JWT_SECRET"
```

Expected: no output. If any hits appear, scrub with `git filter-repo` before proceeding.

## 2. Confirm no sensitive files are tracked

```powershell
git ls-files .env Secret/ Branding/ certs/
```

Expected: empty output. These paths should be gitignored.

## 3. Install new server dependencies

`bcrypt` and `jsonwebtoken` were added to `server/package.json` but may not be installed yet on the host (they will install automatically on `docker compose build`).

```powershell
cd server; npm install; cd ..
```

## 4. Commit all tome-app changes

```powershell
git add -A
git commit -m "feat: tome-app open-source fork — self-hosted auth, GPL-3.0"
```

## 5. Create the GitHub repo

1. Go to https://github.com/new
2. Name: `tome-app`
3. Visibility: **Public**
4. No template, no auto-initialize (repo must be empty)

## 6. Push the branch as main

```powershell
git push https://github.com/YOUR_USERNAME/tome-app.git tome-app:main
```

## 7. LICENSE note

The `LICENSE` file contains a short-form GPL-3.0 notice with the SPDX identifier `GPL-3.0-only`. GitHub will detect it correctly. If you want the full license text embedded, replace `LICENSE` with the text from:

https://www.gnu.org/licenses/gpl-3.0.txt

## Post-publish checklist

- [ ] Set repo description: "Self-hosted Scrivener-style writing app. No external auth required. Runs on any Docker host."
- [ ] Add topics: `writing`, `self-hosted`, `docker`, `gpl3`, `nodejs`, `react`
- [ ] Enable Issues and Discussions in repo settings
- [ ] Pin the repo on your GitHub profile (optional)
