// [TINIX] Pattern matching runs off the editor thread.
import { matchMaterialPoses, type MatchRequest } from './material-placement'

self.onmessage = (event: MessageEvent<MatchRequest>) => {
  self.postMessage(matchMaterialPoses(event.data))
}
