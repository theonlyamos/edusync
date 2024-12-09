import { hash } from 'bcryptjs';
import { MongoClient } from 'mongodb';

async function seed() {
    if (!process.env.MONGODB_URI) {
        throw new Error('Please add your MongoDB URI to .env.local');
    }
    try {
        const client = await MongoClient.connect(process.env.MONGODB_URI);
        const db = client.db();
        const usersCollection = db.collection('users');

        // Clear existing users
        await usersCollection.deleteMany({});

        // Create test users
        const testUsers = [
            {
                name: 'Test Teacher',
                email: 'teacher@test.com',
                password: await hash('teacher123', 12),
                role: 'teacher',
            },
            {
                name: 'Test Student',
                email: 'student@test.com',
                password: await hash('student123', 12),
                role: 'student',
            },
        ];

        // Insert test users
        await usersCollection.insertMany(testUsers);

        console.log('Database seeded successfully!');
        console.log('Test Users:');
        console.log('Teacher - Email: teacher@test.com, Password: teacher123');
        console.log('Student - Email: student@test.com, Password: student123');

        await client.close();
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seed();
