# Investigating live tutor interruptions

The retained synthetic session `synthetic-diagnostic-live-2026-10-15T1122Z` received two server interruption flags at 11:29:08.278 and 11:29:10.152 UTC. No deliberate interruption input was scheduled. The playback queue correctly cancelled 11 and 16 queued sources in response. Rendered output energy resumed 987.3 ms after the first flag. The session stopped before a recovery observation was possible after the second.

These observations establish that the provider sent the flags and that the client followed its interruption path. They do not establish which outbound input caused them. The last microphone packet with a peak above 0.001 preceded the flags by 12.131 and 14.005 seconds; the measured batching tail was only 211.5 ms. This does not support attributing either flag to the scheduled speech tail. The existing microphone transport also sends silence, so it does not rule out provider-side activity detection.

The client sends viewport updates as realtime text and periodic visualization screenshots as realtime video. Neither send path waits for the assistant to become idle. The first interruption followed visualization HTTP completion by 433 ms, which is consistent with a viewport-related hypothesis but is not proof. The retained evidence did not record exact successful text/video send times. Tool acknowledgements were 10–13 seconds earlier; their existing `SILENT` response field is not evidence of a blocking or nonblocking scheduling configuration.

No VAD, model, tool-response, payload, batching or playback scheduling setting is changed. Intentional barge-in still clears playback immediately. The only audio addition is passive metadata for a future separately authorized investigation.

## Event contract

The hook emits the window event `insyte-live-input` after an SDK send returns successfully and when it processes a server interruption. A send event proves only that the local SDK call returned, not provider receipt. `timestampMs` is the client wall-clock timestamp; `connectionGeneration` distinguishes replacement connections.

| Event | Additional fields |
| --- | --- |
| `sent` | `kind`: audio/text/video/tool; `source`: microphone/user/quiz/initial/viewport/visual/tool, constrained to valid pairs |
| `sent`, audio only | Optional nonnegative safe-integer `audioBytes` from the existing PCM byte array |
| `server-interrupted` | No payload fields |

No text, audio samples, image data, tool arguments, transcripts, credentials, URLs or session identifiers are copied into the event. Failed sends and stale callbacks do not produce successful-send metadata. The event has no subscriber, storage or network destination added by this change. Diagnostics are best effort and do not throw into the transport path.

Offline tests cover fixed metadata, privacy bounds, failed sends, replacement connections, unchanged transport payloads and the existing interruption behavior. No new live provider session was run for this change. The exact cause of the two retained server interruptions remains unverified.
