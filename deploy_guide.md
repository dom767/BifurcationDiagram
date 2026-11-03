# Release packaging

The release workflow follows AgentController standards
`guidelines/export.md` and `guidelines/repository-commands.md`.
See [deploy.md](deploy.md) for this app's commands, packaging and hosting details.

Each deploy packages independently through `actions/lib/build.mjs`:
Deploy Local writes `Export/Local` with version `0.0.C`; Deploy Prod claims N
and writes `Export/VersionN` with version `0.N.C`. C is the source commit count
before claiming N. Both require a clean tree; production also checks upstream.
Versions appear in HTML only. Every package includes `build.json` with source
identity and SHA-256 hashes of non-HTML assets. Production compares these with
Local when the source commit matches, uploads assets before HTML, and verifies
the live asset version. Agents never run Deploy Prod.

Existing export folders remain untouched. There is no separate Build action.
