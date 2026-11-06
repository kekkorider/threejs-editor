import { ThreejsEditor } from '@kekkorider/threejs-editor'

const editor = document.querySelector('threejs-editor')
if (!(editor instanceof ThreejsEditor)) {
  throw new Error('The tag threejs-editor is not an instance of ThreejsEditor.')
}

const rect = editor.getBoundingClientRect()
const coversWidth = Math.abs(rect.width - window.innerWidth) < 1
const coversHeight = Math.abs(rect.height - window.innerHeight) < 1
document.documentElement.dataset.editorCoversWindow = coversWidth && coversHeight ? 'yes' : 'no'
