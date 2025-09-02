// MongoDB connection removed after migration to Supabase
export async function connectToDatabase() {
    throw new Error('MongoDB removed: migrate consumers to Supabase');
}