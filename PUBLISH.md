# Publish the package

The package name is `@kekkorider/threejs-editor`.
The license is MIT.
The package is public.
One command publishes it: `pnpm publish`.

Run every command in this file from the repository root, except the commands in the host page section.
Node.js 24 must be the active Node.js program.

## Publish for the first time

The npm user must own the scope `@kekkorider`.
Run `npm login` once.

Then run:

```shell
pnpm publish
```

`prepack` runs `build:lib` before `pnpm publish` packs the files.
`build:lib` writes `dist/index.js`.
`build:lib` copies the Draco files to `dist/draco`.
`build:lib` copies the Basis files to `dist/basis`.
`publishConfig.access` is `public`, so you do not add `--access public`.

## Update the package

1. Run one version command.
   - Run `npm version patch` to increase the third number.
   - Run `npm version minor` to increase the second number.
   - Run `npm version major` to increase the first number.
2. Run `pnpm publish`.
3. Run `git push`.
4. Run `git push --tags`.

`npm version` changes the `version` field in `package.json`.
`npm version` writes a git commit.
`npm version` writes a git tag.

## Host page

The host page is the page that contains the tag `threejs-editor`.
Install the package with one command:

```shell
pnpm add @kekkorider/threejs-editor
```

That command also installs these libraries:

- `vue`
- `pinia`
- `three`
- `three-start`
- `crashcat`
- `eventemitter3`
- `gsap`
- `sucrase`

Import the package in the host page:

```ts
import '@kekkorider/threejs-editor'
```

The import registers the tag `threejs-editor`.
The import loads the CSS.
Add one element to the HTML:

```html
<threejs-editor></threejs-editor>
```

A document can contain only one `threejs-editor` element.
The element moves to `document.body`.
The element has the same width as the window.
The element has the same height as the window.
Do not import `three-start` from the host page.
This project has one `ThreeStart`.

The host must serve the Draco files at `/draco/`.
The host must serve the Basis files at `/basis/`.
Copy `node_modules/@kekkorider/threejs-editor/dist/draco` to the host directory `public/draco`.
Copy `node_modules/@kekkorider/threejs-editor/dist/basis` to the host directory `public/basis`.

## Check the archive

1. Run `pnpm pack`.
2. Run `pnpm add ../../kekkorider-threejs-editor-2.0.1.tgz` in `examples/host`. Use the version from `package.json` in the file name.
3. Copy `node_modules/@kekkorider/threejs-editor/dist/draco` to `examples/host/public/draco`.
4. Copy `node_modules/@kekkorider/threejs-editor/dist/basis` to `examples/host/public/basis`.
5. Run `pnpm dev` in `examples/host`.
6. Open `http://localhost:5174`.
7. Check that `document.documentElement.dataset.editorCoversWindow` is `yes`.
