# Review preview

The public review copy is deployed with the manually dispatched `Publish digest preview`
workflow. The workflow starts rig, captures `/digest/2026-10-28` with curl, and checks the
self-contained HTML before deploying it through GitHub Pages. The captured page lives only
under ignored `var/preview/` locally or in the temporary Pages deployment artifact; it is never
committed. The lockfile makes local and hosted dependencies match.

Before the first deployment, obtain the human's explicit publication approval, enable GitHub
Pages with its workflow build source, and set the repository secret `LANE_MARKER` from the
course value in the local `.env`. Never put the value in an issue, workflow input, or commit.
Dispatch with `mode=marked` only for the approved review upload. The resulting Pages URL is
the preview URL sent to the reviewer. Delete the temporary Actions artifact after deployment.

Once review is in, ask for approval to replace the same public page. Dispatch with
`mode=clean`, which unsets the marker before starting rig. Verify that the same URL says
`no marker set`, delete that temporary artifact, remove the repository marker secret, and
archive the plan with its issue URLs. Do not close the cleanup issue before this holds.

GitHub Pages can be disabled in this repository's Settings > Pages to take the public copy
down. The workflow runs only on a manual dispatch, never automatically on a push.
