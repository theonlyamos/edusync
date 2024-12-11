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
                name: 'Admin User',
                email: 'admin@test.com',
                password: await hash('admin123', 12),
                role: 'admin',
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                name: 'Test Teacher',
                email: 'teacher@test.com',
                password: await hash('teacher123', 12),
                role: 'teacher',
                status: 'active',
                level: 'jhs 1',
                subjects: ['Mathematics', 'Science'],
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                name: 'Test Student',
                email: 'student@test.com',
                password: await hash('student123', 12),
                role: 'student',
                status: 'active',
                level: 'jhs 1',
                createdAt: new Date(),
                updatedAt: new Date()
            },
        ];

        // Insert test users
        await usersCollection.insertMany(testUsers);

        console.log('Database seeded successfully!');
        console.log('Test Users:');
        console.log('Admin - Email: admin@test.com, Password: admin123');
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
