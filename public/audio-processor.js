// audio-processor.js

class AudioStreamProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // A buffer to hold audio data before sending
        this.buffer = [];
        // The number of samples to collect before sending a message
        this.bufferSize = 2048;
    }

    process(inputs, outputs, parameters) {
        // We only expect one input
        const input = inputs[0];
        if (input.length > 0) {
            // Get the first channel of the audio data
            const channelData = input[0];
            // Add the new data to our buffer
            this.buffer.push(...channelData);

            // Once the buffer is full, send the data
            while (this.buffer.length >= this.bufferSize) {
                // Get the chunk of data to send
                const chunk = this.buffer.slice(0, this.bufferSize);
                // Remove the chunk from the buffer
                this.buffer = this.buffer.slice(this.bufferSize);

                // Post the audio data back to the main thread
                this.port.postMessage({
                    type: 'audioData',
                    data: chunk
                });
            }
        }
        // Return true to keep the processor alive
        return true;
    }
}

// Register the processor
registerProcessor('audio-stream-processor', AudioStreamProcessor);
