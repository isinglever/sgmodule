import { Cipher, UmpReader, UmpWriter } from '../lib/ump.js'
import { OnesieHeader } from '../lib/protobuf/ump/onesieHeader_pb'
import {
  EncryptedInnertubeResponsePart
} from '../lib/protobuf/ump/encrypted_pb'
import { WatchMessage } from './response'
import { gzipSync } from 'fflate'
import { OnesieInnertubeResponse } from '../lib/protobuf/ump/onesieInnertubeResponse_pb'

enum UMPPartId {
  UNKNOWN = 0,
  ONESIE_HEADER = 10,
  ONESIE_DATA = 11,
  ONESIE_ENCRYPTED_MEDIA = 12,
  MEDIA_HEADER = 20,
  MEDIA = 21,
  MEDIA_END = 22,
  CONFIG = 30,
  LIVE_METADATA = 31,
  HOSTNAME_CHANGE_HINT_DEPRECATED = 32,
  LIVE_METADATA_PROMISE = 33,
  LIVE_METADATA_PROMISE_CANCELLATION = 34,
  NEXT_REQUEST_POLICY = 35,
  USTREAMER_VIDEO_AND_FORMAT_METADATA = 36,
  FORMAT_SELECTION_CONFIG = 37,
  USTREAMER_SELECTED_MEDIA_STREAM = 38,
  FORMAT_INITIALIZATION_METADATA = 42,
  SABR_REDIRECT = 43,
  SABR_ERROR = 44,
  SABR_SEEK = 45,
  RELOAD_PLAYER_RESPONSE = 46,
  PLAYBACK_START_POLICY = 47,
  ALLOWED_CACHED_FORMATS = 48,
  START_BW_SAMPLING_HINT = 49,
  PAUSE_BW_SAMPLING_HINT = 50,
  SELECTABLE_FORMATS = 51,
  REQUEST_IDENTIFIER = 52,
  REQUEST_CANCELLATION_POLICY = 53,
  ONESIE_PREFETCH_REJECTION = 54,
  TIMELINE_CONTEXT = 55,
  REQUEST_PIPELINING = 56,
  SABR_CONTEXT_UPDATE = 57,
  STREAM_PROTECTION_STATUS = 58,
  LAWNMOWER_POLICY = 60,
  SABR_ACK = 61,
  END_OF_TRACK = 62,
  CACHE_LOAD_POLICY = 63,
  LAWNMOWER_MESSAGING_POLICY = 64,
  PREWARM_CONNECTION = 65,
  PLAYBACK_DEBUG_INFO = 66
}

async function run (): Promise<void> {
  const clientKey = new Uint8Array([
    /**
     * get from log_event
     */
  ]
  )
  const cipher = new Cipher(clientKey)
  const body = $response.body as Uint8Array
  const reader = new UmpReader(body)
  const writer = new UmpWriter()
  let preHeaderType = -1

  while (reader.hasNext()) {
    const part = reader.readPart()
    if (part.type === UMPPartId.ONESIE_HEADER) {
      const header = OnesieHeader.fromBinary(part.data)
      preHeaderType = header.type
    }

    if (part.type === UMPPartId.ONESIE_DATA && preHeaderType === 25) {
      console.log('handle ONESIE_DATA')
      const enPartMessage = EncryptedInnertubeResponsePart.fromBinary(part.data)
      const decryptResponseWithGzip = cipher.decrypt(enPartMessage)
      const realResponse = $utils.ungzip(decryptResponseWithGzip)
      const partMessageHandler = new WatchMessage(OnesieInnertubeResponse)
      partMessageHandler.fromBinary(realResponse)
      await partMessageHandler.modify()
      const responseWithGzip = gzipSync(partMessageHandler.toBinary(), { level: 0 })
      const {
        encryptedContent,
        hmac
      } = cipher.encrypt(responseWithGzip)
      enPartMessage.hmac = hmac
      enPartMessage.encryptedContent = encryptedContent
      part.data = enPartMessage.toBinary()
      preHeaderType = -1
    }
    writer.writePart(part)
  }
  $done({ body: writer.getBuffer() })
}

run().catch(e => {
  console.log(e.toString())
}).finally(() => {
  $done({ abort: true })
})
