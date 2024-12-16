import mongoose from 'mongoose';

if (!process.env.MONGODB_URI) {
    throw new Error('Please add your Mongo URI to .env.local');
}

const MONGODB_URI = process.env.MONGODB_URI;

const options: mongoose.ConnectOptions = {
    maxPoolSize: 10,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,
    connectTimeoutMS: 10000
};

if (process.env.NODE_ENV === 'development') {
    // In development mode, enable debug mode to see mongoose queries
    mongoose.set('debug', true);
}

let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, options)
            .then(mongoose => {
                console.log('MongoDB connected successfully');
                return mongoose;
            })
            .catch(error => {
                console.error('Error connecting to MongoDB:', error);
                throw error;
            });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

// Add connection error handlers
mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected successfully');
});

// Gracefully close the connection when the app is shutting down
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    process.exit(0);
}); 