import {reactive} from 'vue'
// Transient view state: never stored in designs or used by server rendering.
export const printSelection=reactive({active:false,clean:false,selected:[] as string[]})
export function resetPrintSelection(){printSelection.active=false;printSelection.clean=false;printSelection.selected=[]}
