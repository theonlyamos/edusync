class AudioStreamProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        this.frameCount = 0;
    }

    process(inputs, outputs, parameters) {
        this.frameCount++;

        // Debug every 1000 frames (~23ms at 44.1kHz)
        if (this.frameCount % 1000 === 0) {
            console.log('AudioWorklet process called, inputs:', inputs.length, 'input channels:', inputs[0]?.length);
        }

        const input = inputs[0];
        if (!input || input.length === 0) {
            console.log('No input channels available');
            return true;
        }

        const inputChannel = input[0];
        if (!inputChannel || inputChannel.length === 0) {
            console.log('No input data in channel 0');
            return true;
        }

        // Process audio samples
        for (let i = 0; i < inputChannel.length; i++) {
            this.buffer[this.bufferIndex] = inputChannel[i];
            this.bufferIndex++;

            if (this.bufferIndex >= this.bufferSize) {
                // Send buffer to main thread
                console.log('Sending audio buffer to main thread, size:', this.bufferSize);
                this.port.postMessage({
                    type: 'audioData',
                    data: this.buffer.slice()
                });
                this.bufferIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor('audio-stream-processor', AudioStreamProcessor); 