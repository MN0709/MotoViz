# F08 preset assets

## Scope

Six generic, unbranded procedural GLB assets for Issue #8. These are preset
illustrations, not accurate product models or evidence of vehicle compatibility.
No product partId, vehicle ID, or fitModels mapping is claimed. No external
images, textures, brand geometry, or paid generation services were used.

The source generator and assets are supplied under the scoped MIT notice in
`packages/3d-renderer/assets/presets/LICENSE.txt`. Three.js 0.180.0 is the
MIT-licensed geometry/export tooling dependency. These are simple procedural
prototypes; visual suitability still needs the 3D lead and product owner's review.

## Assets and reproduction

`packages/3d-renderer/assets/presets/manifest.json` records each asset's relative
filename, stable preset ID, type, byte size, SHA-256, measured bounding dimensions,
source, license and default transform. It is an asset inventory, not a new shared
API contract or a replacement for Model3D.

| Files                                        | Type       | Variants             |
| -------------------------------------------- | ---------- | -------------------- |
| exhaust-compact.glb, exhaust-long.glb        | exhaust    | Two canister lengths |
| windshield-short.glb, windshield-touring.glb | windshield | Two screen sizes     |
| saddlebag-compact.glb, saddlebag-large.glb   | saddlebag  | Two case sizes       |

Coordinates use meters, Y up; rotations in inventory metadata are degrees;
scale is a dimensionless multiplier. Origins are approximately at component
centers. Default positions are preview positions, not motorcycle mounting points.
Windshields use opaque tinted material for reliable inspection, not optical simulation.

From the repository root after `npm install`:

```sh
node packages/3d-renderer/scripts/generate-presets.mjs
node packages/3d-renderer/scripts/verify-presets.mjs
python3 -m http.server 4178 --bind 127.0.0.1
```

Open `/packages/3d-renderer/preview.html` on the local server. This development
inspection page uses the installed Three.js package without a CDN. It is not the
F05 scene implementation or the F18 product page. Preview transforms are temporary;
position limits are +/-0.5 m and rotation limits +/-45 degrees. Its 0.25-3 scale
range is an inspection control, not a product rule or persistence contract.

## Verification and baseline

Base: main `438b2b6fd3b46503906d9070251631e7cfb76551`.
The original HTTPS Git fetch failed; a previously cloned local Git repository
provided the identical SHA, independently confirmed with GitHub API before work.

- Baseline npm install, lint, typecheck and build passed.
- Baseline format:check failed in 11 existing files; unrelated files were not reformatted.
- Six GLBs total 247144 bytes before HTTP compression.
- Browser checks loaded all six using GLTFLoader, filtered exhaust to two entries,
  exercised translation/rotation/scaling and reset, and checked desktop/mobile layout.
- Headless Chrome via Playwright 1.63.0: 1280x900 and 390x844 screenshots;
  canvas screenshots changed after transforms; reset restored 0/1; injected GLB
  request failure showed an error and a subsequent selection recovered. Zero page
  errors. PNG pixel checks found nonblank model regions in all seven screenshots.
- `node packages/3d-renderer/scripts/verify-presets.mjs`: all six passed.
- Final lint, typecheck, build and git diff --check passed. Final format:check
  still reports the same 11 baseline files. Changed text files pass Prettier.
- Screenshots: `docs/evidence/F08/` (six desktop assets plus mobile).
- This does not certify glTF specification compliance or production performance.

## Integration gate and remaining work

F05 owner @Freya-Qian should confirm loading a supplied GLB and the placement of
asset hosting before product integration. F04/F05/F18 must agree where the
existing `3D_MODE=generated/preset` requirement is read and which owner selects
the same-type preset after generation failure or timeout. The inspection page
does not implement that production switch. An unknown type must not silently
be represented as an unrelated specific product.

No shared type, HTTP API, Mock response, scene persistence format or product page
was changed. API/ownership changes remain subject to Issue #20 confirmation.
Preserve original uploaded images; show “预设效果示意” whenever a generic preset
is presented. Finish production fallback, original-image preservation checks,
F05/F18 integration and reviewer acceptance before closing #8.
