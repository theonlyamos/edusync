import { describe, it, expect } from 'vitest'
import { createWavHeader, convertToWav } from '@/lib/audio/wav'

describe('createWavHeader', () => {
  it('writes a 44-byte canonical PCM WAV header', () => {
    const dataLength = 1000
    const h = createWavHeader(dataLength, { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 })

    expect(h.length).toBe(44)
    expect(h.toString('ascii', 0, 4)).toBe('RIFF')
    expect(h.toString('ascii', 8, 12)).toBe('WAVE')
    expect(h.toString('ascii', 12, 16)).toBe('fmt ')
    expect(h.toString('ascii', 36, 40)).toBe('data')

    expect(h.readUInt32LE(4)).toBe(36 + dataLength) // RIFF chunk size
    expect(h.readUInt16LE(20)).toBe(1) // PCM format
    expect(h.readUInt16LE(22)).toBe(1) // channels
    expect(h.readUInt32LE(24)).toBe(24000) // sample rate
    expect(h.readUInt32LE(28)).toBe(24000 * 1 * 2) // byte rate
    expect(h.readUInt16LE(32)).toBe(2) // block align
    expect(h.readUInt16LE(34)).toBe(16) // bits per sample
    expect(h.readUInt32LE(40)).toBe(dataLength) // data chunk size
  })
})

describe('convertToWav', () => {
  it('prepends a header whose data length matches the decoded PCM', () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
    const b64 = pcm.toString('base64')

    const wav = convertToWav([b64], 24000)

    expect(wav.length).toBe(44 + pcm.length)
    expect(wav.readUInt32LE(40)).toBe(pcm.length) // header data length
    expect(wav.subarray(44)).toEqual(pcm) // payload preserved
  })

  it('concatenates multiple chunks', () => {
    const a = Buffer.from([1, 2])
    const b = Buffer.from([3, 4, 5, 6])
    const wav = convertToWav([a.toString('base64'), b.toString('base64')], 16000)

    expect(wav.readUInt32LE(40)).toBe(a.length + b.length)
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.length).toBe(44 + a.length + b.length)
  })
})
