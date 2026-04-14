# Deploy Kickoff Clash To `kickoff.neutralworking.com`

## Goal

Deploy the current Kickoff Clash Next.js app to the production host:

- `https://kickoff.neutralworking.com`

This repo has already been prepared in code for that host:

- canonical metadata and `metadataBase` point at `https://kickoff.neutralworking.com`
- the title screen includes a visible link to `kickoff.neutralworking.com`

Relevant files:

- [src/app/layout.tsx](/Users/solid-snake/Documents/kickoff-clash/src/app/layout.tsx)
- [src/components/TitleScreen.tsx](/Users/solid-snake/Documents/kickoff-clash/src/components/TitleScreen.tsx)

## Current Repo State

- Branch: `main`
- Last pushed gameplay commit: `acd53e9` (`Shift run loop toward season play`)
- There may be additional local unpushed changes related to the canonical host/link. Deploy from the latest committed state after reviewing `git status`.

## Hosting Outcome

Create or update the production deployment so that:

1. the app is live at `kickoff.neutralworking.com`
2. `https://kickoff.neutralworking.com` serves this repo
3. the homepage title screen shows the `kickoff.neutralworking.com` link
4. page metadata resolves canonically to `https://kickoff.neutralworking.com`

## Suggested Deployment Steps

1. Inspect the current repo status and commit any outstanding domain-link changes if needed.
2. Deploy the app on the hosting platform already available to Claude Code.
3. Attach the custom domain `kickoff.neutralworking.com` to that deployment.
4. Add/update the DNS record for `kickoff.neutralworking.com`.
5. Wait for SSL/domain verification to complete.
6. Verify the live site manually.

## Verification Checklist

After deployment, confirm:

- `https://kickoff.neutralworking.com` loads successfully
- the homepage renders without mixed-content or asset issues
- the title/index screen contains a link labeled `kickoff.neutralworking.com`
- page source / metadata reflects canonical host `https://kickoff.neutralworking.com`
- there is no unexpected reference to a Chief Scout production domain

## Nice-To-Have Follow-Up

Not required for deployment, but worth cleaning up later:

- rename package scope in [package.json](/Users/solid-snake/Documents/kickoff-clash/package.json) from `@chief-scout/kickoff-clash` to something neutralworking-aligned
