# Packaged License Status

This directory contains license texts copied from the exact npm packages installed when the Windows binaries were built.

## Files supplied separately by Electron

Electron's Windows distribution already places these files beside `Translator.exe`, so they are not duplicated in this directory:

- `LICENSE.electron.txt`
- `LICENSES.chromium.html`

## Packages without an embedded license file

The following installed packages do not contain a `LICENSE`, `LICENCE`, `NOTICE`, or `COPYING` file:

- `@tesseract.js-data/eng@1.0.0`
- `@tesseract.js-data/chi_sim@1.0.0`
- `tr46@0.0.3`

## OCR language data provenance

The npm metadata and installed `package.json` files for `@tesseract.js-data/eng@1.0.0` and `@tesseract.js-data/chi_sim@1.0.0` report `MIT`. Both releases identify this upstream Git commit through their npm `gitHead` field:

- Repository: `naptha/tessdata`
- Commit: `b86746569320a6103cea84cc2b8d9ee74f0f45d3`
- Commit date: 2023-08-21 14:30:20 UTC
- npm publication dates: 2023-09-04

The SHA-256 hashes of the installed `4.0.0_best_int` files exactly match the files at that commit:

- `eng.traineddata.gz`: `45B4CB346724AC1774F1C36F42F182B887BCDB28EBE63E6FFF90AC41F3FCFF91`
- `chi_sim.traineddata.gz`: `B8A23F10C7DE500891EB458A8ADC9CC58AB7F242F08B7D149F5E9AEA4AD5DB7C`

The package-generation script at that commit writes `"license": "MIT"` into generated language-package metadata. The commit itself does not contain a repository-level license file. The next upstream commit, `9c2fee3df42e6cdc19ebc1e4fb05a5bafa48dab0`, added an Apache-2.0 `LICENSE` at 2023-08-21 14:36:01 UTC. That exact upstream text is included as `tesseract/language-data-upstream-Apache-2.0-LICENSE.txt`.

Because the npm-package metadata and upstream repository license evidence differ, this distribution preserves both facts and does not claim that either is the only applicable license.

## tr46 provenance

The exact npm release commit for `tr46@0.0.3`, `a8009f9ce80ff5dbe71dd71e203afe4e4c878d28`, reports `MIT` in `package.json` but does not contain a license file. The same upstream repository later added an MIT license in commit `3a6f29721e7063b9ffd421e461a54beae6170001`, authored by Sebastian Mayr on 2016-08-02. The exact license text from that commit is included as `tesseract/transitive/tr46-LICENSE.md`.

