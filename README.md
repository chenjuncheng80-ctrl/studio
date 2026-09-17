# Studio — Chan Chun Shing

A portfolio site whose content lives in plain JSON files, plus a built-in
admin page that writes those files straight back to this repository.

```
index.html          public site
admin.html          admin (needs a GitHub token)
data/profile.json   name, role, about, skills, links, resume file
data/works.json     categories + works
data/files.json     downloadable files (CV, briefs, source files)
assets/works/       images & videos uploaded from the admin
assets/files/       documents uploaded from the admin
```

## How publishing works

Editing anything in `admin.html` only changes the browser's copy. Pressing
**Publish** builds one commit through the GitHub Git Data API
(blob → tree → commit → ref) containing every changed file at once, so Vercel
runs a single build instead of one per file.

## Deploying

Vercel, importing this repository, framework preset "Other" (it is static).
Every publish triggers a rebuild — allow about 40 seconds.

## Token

The admin needs a fine-grained personal access token with
**Contents: Read and write** on this repository only. It is kept in the
browser's `localStorage` and is never sent anywhere except `api.github.com`.

## Tests

```bash
node tools/smoke_studio.mjs   # jsdom end-to-end: site rendering + admin publish flow
```
