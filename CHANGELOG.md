## [2.0.3](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v2.0.2...v2.0.3) (2026-05-01)


### Bug Fixes

* resolve Jest coverage and TypeScript errors ([92fdf0d](https://github.com/vernonthedev/hymnal-browser-plugin/commit/92fdf0d2773614d86ad398dedd9700077fedefe0))
* resolve PR review issues ([d66540c](https://github.com/vernonthedev/hymnal-browser-plugin/commit/d66540c77f7c5c59d9bb06057cf1fb00d8b25917))
* resolve test import errors, fixes [#9](https://github.com/vernonthedev/hymnal-browser-plugin/issues/9) ([93daf4a](https://github.com/vernonthedev/hymnal-browser-plugin/commit/93daf4a8f7fca479dc942985c4096fe6299c017e))

## [2.0.2](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v2.0.1...v2.0.2) (2026-05-01)


### Bug Fixes

* remove build:icons from CI (icons already committed) ([d0f4179](https://github.com/vernonthedev/hymnal-browser-plugin/commit/d0f417974d23ab32e6ea0d683dfca4b4f8b67e3c))

## [2.0.1](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v2.0.0...v2.0.1) (2026-05-01)


### Bug Fixes

* remove Python steps from CI workflow ([17df265](https://github.com/vernonthedev/hymnal-browser-plugin/commit/17df2652ec18e48b434e672dc752e178a683c292))

# [2.0.0](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v1.6.0...v2.0.0) (2026-05-01)


### Bug Fixes

* add missing token to control client connection ([59687af](https://github.com/vernonthedev/hymnal-browser-plugin/commit/59687af2e5fdfd5ea74c5972ed2caae77d37c673))
* address PR review security vulnerabilities and issues ([60eb5da](https://github.com/vernonthedev/hymnal-browser-plugin/commit/60eb5da1b25650b609d33b1777805c1a78607390))
* broadcast actual overlay state instead of empty payload ([d90c6bf](https://github.com/vernonthedev/hymnal-browser-plugin/commit/d90c6bfe77c5ff4f099245dcaf0fc7e4d8ddb3ce)), closes [#8](https://github.com/vernonthedev/hymnal-browser-plugin/issues/8)
* compile main.ts to CJS for Electron ([1c2b712](https://github.com/vernonthedev/hymnal-browser-plugin/commit/1c2b712548868c85a026e34c7b73aba0d1eb09cc)), closes [#8](https://github.com/vernonthedev/hymnal-browser-plugin/issues/8)
* resolve ESM __dirname issues in build scripts ([f8314de](https://github.com/vernonthedev/hymnal-browser-plugin/commit/f8314de8478fbab446f753ecc1fe1dc10b7572ee))


### Code Refactoring

* migrate to TypeScript-only setup ([fbf9f1b](https://github.com/vernonthedev/hymnal-browser-plugin/commit/fbf9f1b80073d7df694fcbac42c29f9cef88d20b))


### BREAKING CHANGES

* Run 'bun run build' before 'bun run dev' to compile TS files

# [1.6.0](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v1.5.0...v1.6.0) (2026-05-01)


### Bug Fixes

* fix the Electron main process for ES modules compatibility ([a0b2d95](https://github.com/vernonthedev/hymnal-browser-plugin/commit/a0b2d9520e83ff2b2c93d247caba35d3f025dbbf))
* handle directory requests in static file server ([535f784](https://github.com/vernonthedev/hymnal-browser-plugin/commit/535f7849f42df06f537434400247783a7a620444))
* register IPC handlers before window creation ([304b3a1](https://github.com/vernonthedev/hymnal-browser-plugin/commit/304b3a1d65a09f815be045590899ba5aefc4445a))
* resolve 'Waiting for backend' hang and build process issues ([032e1a1](https://github.com/vernonthedev/hymnal-browser-plugin/commit/032e1a1630f326f286289e4d2e231c65dd698bf9))
* resolve backend loading issues and implement async file I/O ([f2bd4e1](https://github.com/vernonthedev/hymnal-browser-plugin/commit/f2bd4e17da78d4a09aafe20d0d981e7d3cc7fa31))
* resolve ui status indicators and broadcast synchronization ([86af246](https://github.com/vernonthedev/hymnal-browser-plugin/commit/86af246d156e889d0a4b425559d7ce8aac5fe436))
* resolve websocket port mismatch and robust static file serving ([75d8c50](https://github.com/vernonthedev/hymnal-browser-plugin/commit/75d8c509191db678d0aad770684a21131929fb17))
* simplify build script to use tsconfig.json fully ([7d81761](https://github.com/vernonthedev/hymnal-browser-plugin/commit/7d81761c1a44647906ed4f84b2284cbb7dc423b4))
* update build script to specify moduleResolution on command line ([b3d2d5c](https://github.com/vernonthedev/hymnal-browser-plugin/commit/b3d2d5c5acf8488d6dde325ee38eb11de57962f5))
* update Electron main.js to use Node.js backend ([79f0acc](https://github.com/vernonthedev/hymnal-browser-plugin/commit/79f0acc7f77bbb5f04603e56f6d52d03662eeab5))
* update TypeScript config to use 'bundler' moduleResolution ([d9b79c0](https://github.com/vernonthedev/hymnal-browser-plugin/commit/d9b79c01aa9a7f1ade16be404a0920c7ddce679f))


### Features

* add Node.js dependencies and update build scripts ([a7880b5](https://github.com/vernonthedev/hymnal-browser-plugin/commit/a7880b5a67b3239e9b0c45b5fc045a93da2d47e4))
* added commitlint configuration ([6cba3be](https://github.com/vernonthedev/hymnal-browser-plugin/commit/6cba3be2674179c55f19e9201f1722fdb39f8597))
* added lefthook & commitlinting dependencies ([5221601](https://github.com/vernonthedev/hymnal-browser-plugin/commit/522160173d9750e56442ff01a76c3d8875847e82))
* added the commitizen configuration ([aef101c](https://github.com/vernonthedev/hymnal-browser-plugin/commit/aef101ca7f9d50b97d938cdcebeefd79dbe3ba4e))
* implement Node.js backend to replace Python server ([1a08153](https://github.com/vernonthedev/hymnal-browser-plugin/commit/1a0815351f47121d6b4f0e08fe08ce814865f983))
* **linting:** completed eslint & commitlinting setup with bun, fixes [#6](https://github.com/vernonthedev/hymnal-browser-plugin/issues/6) ([94135f7](https://github.com/vernonthedev/hymnal-browser-plugin/commit/94135f75396225d5c1324d32cb5275fb08b16b6e))
* update Electron to spawn Node.js backend instead of Python ([62039aa](https://github.com/vernonthedev/hymnal-browser-plugin/commit/62039aac1b7c15d0c845158f8ee698aa5542c554))

# [1.5.0](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v1.4.0...v1.5.0) (2026-03-01)


### Features

* **bug-fix:** Fixed the portable installer overwriting on windows build & updated application meta data config to stop blockmaps file generations ([ee79b03](https://github.com/vernonthedev/hymnal-browser-plugin/commit/ee79b0399dd27ffc8b115021217559bcc0af6f1f))

# [1.4.0](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v1.3.1...v1.4.0) (2026-03-01)


### Features

* Add GitHub Actions workflow for automated semantic releases and multi-platform installer builds, alongside minor package.json updates for author details and build script modifications. ([cc7d096](https://github.com/vernonthedev/hymnal-browser-plugin/commit/cc7d0962ccfeb02400f22a499c1c224c93574b53))

## [1.3.1](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v1.3.0...v1.3.1) (2026-03-01)


### Bug Fixes

* corrected pywin32 installations for windows only platforms ([aeeeb97](https://github.com/vernonthedev/hymnal-browser-plugin/commit/aeeeb972e523a85950f36306c3e248e11d923e85))

# [1.3.0](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v1.2.0...v1.3.0) (2026-03-01)


### Features

* **production:** setup application bundlings for all OS ([9ed2651](https://github.com/vernonthedev/hymnal-browser-plugin/commit/9ed265154dbbdfc1d6f115ebe4991dbadfdbd723))
* updated application build & icons ([c1eeee7](https://github.com/vernonthedev/hymnal-browser-plugin/commit/c1eeee7511539b89ebfeea5e909e0260070b1059))

# [1.2.0](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v1.1.0...v1.2.0) (2026-03-01)


### Bug Fixes

* **backend:** ignore stale websocket callbacks ([a53c5b9](https://github.com/vernonthedev/hymnal-browser-plugin/commit/a53c5b980323d68681c181384bd92ee64a732a4f))
* **backend:** separate control and overlay sockets ([e369614](https://github.com/vernonthedev/hymnal-browser-plugin/commit/e369614043fb083731f3d7aed00c039c49bb32cb))
* **electron:** prefer project python 3.12 backend ([481ce12](https://github.com/vernonthedev/hymnal-browser-plugin/commit/481ce125d9f3a2d2214b309bc7363d5e1dc931fc))
* **overlays:** broadcast background toggle updates ([74b9680](https://github.com/vernonthedev/hymnal-browser-plugin/commit/74b96802faa2c2718d3436a5033af2d1bc1731ce))
* **overlays:** bust cache for background toggle ([318bdcf](https://github.com/vernonthedev/hymnal-browser-plugin/commit/318bdcf44870564ba16d9b780c4f2e9bccabc9b2))
* **overlays:** enforce background toggle visually ([e0f5f21](https://github.com/vernonthedev/hymnal-browser-plugin/commit/e0f5f21327ac1a7aad20e316f6332f87414fb53a))
* **overlays:** hard-disable backdrop rendering ([e5b1029](https://github.com/vernonthedev/hymnal-browser-plugin/commit/e5b1029f9f21a89f974119d6d0b5b3da246e79d9))
* **overlays:** refresh cached backdrop assets ([583d784](https://github.com/vernonthedev/hymnal-browser-plugin/commit/583d784538c8c05de3cc3ced720d11a4ba822a29))
* **ui:** expose speaker templates and opacity ([d19919c](https://github.com/vernonthedev/hymnal-browser-plugin/commit/d19919c304485435b209404528aeb69e1883c5a8))
* **ui:** stabilize live style editing ([f727c28](https://github.com/vernonthedev/hymnal-browser-plugin/commit/f727c28b2450e95685d1b06272ea3123bb0b60bb))


### Features

* **backend:** add managed local overlay server ([f16e8f1](https://github.com/vernonthedev/hymnal-browser-plugin/commit/f16e8f102e48226247c9f5db6c5886c5a0b841a3))
* **electron:** add desktop control application ([d796bee](https://github.com/vernonthedev/hymnal-browser-plugin/commit/d796bee182582a46446b0d768efa4f43a1a68196))
* **overlays:** add synced multi-overlay clients ([b81e464](https://github.com/vernonthedev/hymnal-browser-plugin/commit/b81e464a7949d897b17fb9af3638a1fec470d743))
* **ui:** add separate background toggle ([4dda3f6](https://github.com/vernonthedev/hymnal-browser-plugin/commit/4dda3f67a2d2221ba01201706319148d0a13e1bf))
* **ui:** allow background-free overlays ([5e351e6](https://github.com/vernonthedev/hymnal-browser-plugin/commit/5e351e6e7a43e37968a4addaef9604e649b6e765))

# [1.1.0](https://github.com/vernonthedev/hymnal-browser-plugin/compare/v1.0.0...v1.1.0) (2026-03-01)


### Features

* updated & removed all slide numbers from the hymns text files ([56f9d52](https://github.com/vernonthedev/hymnal-browser-plugin/commit/56f9d522b0c002484b625450032a06197993aeaf))

# 1.0.0 (2026-03-01)


### Features

* ensured new version bump ([bcca136](https://github.com/vernonthedev/hymnal-browser-plugin/commit/bcca1365a57daf97b783f1b92ce90519e2fa030b))
