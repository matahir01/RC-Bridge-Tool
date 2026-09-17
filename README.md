# RC Girder Workbench

An independent browser application for reinforced-concrete bridge girder research and preliminary checks. Its calculations, sampling and ANN training run on your computer. They do not call ChatGPT, OpenAI APIs or a remote calculation server.

## Open on your laptop without hosting

1. On GitHub, select **Code → Download ZIP** and extract the folder.
2. Double-click **RC-Girder-Workbench.html** in the extracted folder. Use a current desktop browser such as Edge, Chrome or Firefox.
3. Keep that file on your laptop. It contains the complete interface, styling, bridge calculation engine and research module, and works with the internet disconnected.

You can also use **Download offline app** in the online workbench to obtain the same single file. No installation, API key, Python, Node.js or web server is required to **run** it. This edition opens in your browser; it is not a Windows executable.

## Keep your projects

- In the offline edition, **Save project file** downloads a `.rcgirder.json` file. Keep it in your project folder and use **Import JSON** to reopen it.
- **Save** in the hosted edition uses that browser's local storage. Use **Export JSON** before moving to the offline edition, another computer or another website, then import that file there.
- Browser storage is a convenience copy. Moving or renaming the HTML file, changing browsers, private browsing or clearing browser data can affect saved-project listings. Your exported project files remain independent of those settings.
- Project JSON includes design inputs, random-variable settings, correlations and verification entries. Generated LHS rows are saved separately with **Export dataset**. Trained ANN weights and optimisation results are not currently stored in project JSON.
- Reports use your browser's print dialog; choose **Save as PDF**. CSV import, LHS sampling, ANN training and the existing optimisation workflow run locally.

## Source and rebuilding

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.mjs` | Editable interface and application logic |
| `bridge-engine.mjs` | Deterministic bridge calculations |
| `research.mjs` | Sampling, reliability quantities and ANN routines |
| `RC-Girder-Workbench.html` | Generated standalone edition; open this file directly |
| `scripts/build.mjs` | Rebuilds the standalone edition and `dist/` from the source |
| `dist/` | Ready-to-serve copy for a static web host |
| `.openai/hosting.json` | Optional deployment metadata for the existing Sites copy; not a runtime dependency |

For development only, install Node.js and run:

```sh
node scripts/build.mjs
node tests-engine.mjs
node tests-research.mjs
node tests-portability.mjs
```

The build uses only Node's built-in modules. Edit the source files, then rebuild; changes made directly to generated files are overwritten. Opening the source `index.html` through `file://` can trigger browser restrictions on JavaScript modules, so use `RC-Girder-Workbench.html` for direct opening.

## Use another host

Upload the contents of `dist/` to a static web host. All runtime paths are relative, including those needed when the app is served from a subfolder. HTTPS enables the optional service worker and web-app installation. The single-file offline edition needs neither feature. Removing or losing the ChatGPT-hosted copy does not stop downloaded copies from working.

## Engineering scope

This remains the current research and preliminary-design prototype. The portability update does not add engineering checks or certify code compliance. Preserve the modelling limitations displayed in the app and report, and verify results independently before professional use.
