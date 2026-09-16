# Publishing packages

npm is the installation channel. Publish SDK, server, React, UI and CLI in that
order. All five packages use the same version. GitHub Releases also provide the
matching archives and checksums; consumers do not need to clone the repository.

## First publication

An npm account with permission to publish under `@rebyteai` must bootstrap each
package. Log in with `pnpm login`; npm may separately request browser 2FA during
publication. Never put an npm token in source or send it through chat.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm pack:release /tmp/rebyte-release
node scripts/publish-release.mjs /tmp/rebyte-release
```

Install all five released versions into a fresh directory from the public
registry and verify SDK imports and CLI execution before announcing a release.
The publication script checks registry SHA-512 integrity and can resume a partial
release. It refuses to skip an existing version containing different bytes.

## Subsequent releases through GitHub Actions

After the first publication, configure a trusted publisher for each package:

```sh
for package in agent-sdk agent-server agent-react agent-ui cli; do
  pnpm exec npm trust github "@rebyteai/$package" \
    --file release.yml --repo ReByteAI/rebyte-agent-toolkit --allow-publish --yes
done
```

This registry configuration is a separate operation from committing the workflow;
check `pnpm exec npm trust list @rebyteai/agent-sdk` (and the other four packages).
The workflow uses GitHub OIDC, with no stored npm token. See the
[npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

For a new version, update the root and five package versions, refresh the lockfile,
run validation and commit the changes. Push the matching `vX.Y.Z` tag. The workflow
checks every package version, builds and packs once, publishes to npm, then creates
the GitHub Release. Do not move a released tag or overwrite published versions.
Keep the original verified archives from a locally bootstrapped release. A tag
workflow rerun skips npm publication only when the rebuilt archives match the
registry byte for byte. If a rebuild differs, investigate and use the original
verified archives for the GitHub Release; never replace an npm version.


npm scans newly accepted uploads before they become publicly installable. The
workflow submits all packages, then waits up to 20 minutes and verifies every
SHA-512 integrity. A 404 immediately after upload is not a failed upload. If a
run stops while a version is staged, wait for its scan/approval status before
retrying; do not overwrite the tag or increment versions to bypass a scan.

A manual dispatch uses package source from the existing release tag and the
publishing helper from the immutable workflow revision. This allows a reviewed
publication-check fix to finish an existing release without changing its archives.
