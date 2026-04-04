import { describe, expect, it } from 'vitest'
import {
  appendVoiceTranscript,
  getSpeechRecognitionConstructor,
  readSpeechRecognitionTranscript,
  resolveVoiceInputLanguage,
} from './voice-input'

describe('voice input helpers', () => {
  it('prefers standard speech recognition and falls back to webkit', () => {
    class StandardRecognition extends EventTarget {}
    class WebkitRecognition extends EventTarget {}

    expect(
      getSpeechRecognitionConstructor({
        SpeechRecognition: StandardRecognition as never,
        webkitSpeechRecognition: WebkitRecognition as never,
      } as never)
    ).toBe(StandardRecognition)

    expect(
      getSpeechRecognitionConstructor({
        webkitSpeechRecognition: WebkitRecognition as never,
      } as never)
    ).toBe(WebkitRecognition)
  })

  it('appends transcript without mangling spacing', () => {
    expect(appendVoiceTranscript('', 'hello world')).toBe('hello world')
    expect(appendVoiceTranscript('Draft', 'hello world')).toBe('Draft hello world')
    expect(appendVoiceTranscript('Draft ', 'hello world')).toBe('Draft hello world')
  })

  it('resolves a usable voice language', () => {
    expect(resolveVoiceInputLanguage('en', 'fr-CA')).toBe('en-US')
    expect(resolveVoiceInputLanguage('pt-PT', 'en-US')).toBe('pt-PT')
    expect(resolveVoiceInputLanguage(undefined, 'fr-CA')).toBe('fr-CA')
  })

  it('separates final and interim transcripts from recognition results', () => {
    const event = {
      resultIndex: 0,
      results: [
        {
          isFinal: true,
          0: { transcript: 'hello' },
        },
        {
          isFinal: false,
          item: () => ({ transcript: 'world' }),
        },
      ],
    }

    expect(readSpeechRecognitionTranscript(event)).toEqual({
      finalTranscript: 'hello',
      interimTranscript: 'world',
    })
  })
})
