export interface SpeechRecognitionAlternativeLike {
  transcript: string
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean
  0?: SpeechRecognitionAlternativeLike
  item?: (index: number) => SpeechRecognitionAlternativeLike
}

export interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

export interface SpeechRecognitionErrorEventLike {
  error: string
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

export type VoiceInputWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }

const VOICE_LANGUAGE_MAP: Record<string, string> = {
  ar: 'ar-SA',
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  ko: 'ko-KR',
  'nb-NO': 'nb-NO',
  'pt-PT': 'pt-PT',
  ru: 'ru-RU',
  sv: 'sv-SE',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
}

export function getSpeechRecognitionConstructor(
  win?: VoiceInputWindow | null
): SpeechRecognitionConstructor | null {
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition ?? null
}

export function isVoiceInputSupported(win?: VoiceInputWindow | null): boolean {
  return !!getSpeechRecognitionConstructor(win)
}

export function appendVoiceTranscript(existing: string, transcript: string): string {
  const cleanedTranscript = transcript.trim()
  if (!cleanedTranscript) {
    return existing
  }
  if (!existing) {
    return cleanedTranscript
  }
  return /[\s\n]$/.test(existing) ? `${existing}${cleanedTranscript}` : `${existing} ${cleanedTranscript}`
}

export function resolveVoiceInputLanguage(appLanguage: string | undefined, browserLanguage: string | undefined): string {
  if (appLanguage && VOICE_LANGUAGE_MAP[appLanguage]) {
    return VOICE_LANGUAGE_MAP[appLanguage]
  }
  if (appLanguage?.includes('-') && !appLanguage.startsWith('zh-')) {
    return appLanguage
  }
  if (browserLanguage) {
    return browserLanguage
  }
  return 'en-US'
}

export function readSpeechRecognitionTranscript(event: SpeechRecognitionEventLike) {
  let finalTranscript = ''
  let interimTranscript = ''

  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index]
    const alternative = typeof result.item === 'function' ? result.item(0) : result[0]
    const transcript = alternative?.transcript?.trim()
    if (!transcript) {
      continue
    }
    if (result.isFinal) {
      finalTranscript = appendVoiceTranscript(finalTranscript, transcript)
    } else {
      interimTranscript = appendVoiceTranscript(interimTranscript, transcript)
    }
  }

  return {
    finalTranscript,
    interimTranscript,
  }
}
