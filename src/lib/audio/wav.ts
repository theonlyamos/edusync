/**
 * Pure PCM→WAV helpers for Gemini Live audio playback. Extracted verbatim from
 * useAudioStreaming. Runs in the browser bundle (atob + Buffer polyfill), same
 * as before the extraction.
 */

export function createWavHeader(
    dataLength: number,
    options: { numChannels: number; sampleRate: number; bitsPerSample: number }
): Buffer {
    const { numChannels, sampleRate, bitsPerSample } = options;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);

    return buffer;
}

export function convertToWav(rawData: string[], sampleRate: number): Buffer {
    const pcmData = rawData.map(data => {
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return Buffer.from(bytes);
    });
    const totalDataLength = pcmData.reduce((acc, buffer) => acc + buffer.length, 0);

    const options = {
        numChannels: 1,
        sampleRate: sampleRate,
        bitsPerSample: 16,
    };
    const wavHeader = createWavHeader(totalDataLength, options);
    return Buffer.concat([wavHeader, ...pcmData]);
}
