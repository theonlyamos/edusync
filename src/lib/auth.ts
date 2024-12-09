import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { connectToDatabase } from './db';
import { compare } from 'bcryptjs';

export const authOptions: NextAuthOptions = {
    session: {
        strategy: 'jwt'
    },
    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'text' },
                password: { label: 'Password', type: 'password' }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Invalid credentials');
                }

                const client = await connectToDatabase();
                const db = client.db();
                const user = await db.collection('users').findOne({
                    email: credentials.email
                });

                if (!user || !user.password) {
                    throw new Error('No user found');
                }

                const isValid = await compare(credentials.password, user.password);

                if (!isValid) {
                    throw new Error('Invalid password');
                }

                return {
                    id: user._id.toString(),
                    email: user.email,
                    name: user.name,
                    role: user.role
                };
            }
        })
    ],
    callbacks: {
        jwt: async ({ token, user }) => {
            if (user) {
                token.role = user.role;
                token.id = user.id;
            }
            return token;
        },
        session: async ({ session, token }) => {
            if (token) {
                session.user.role = token.role;
                session.user.id = token.id;
            }
            return session;
        }
    },
    pages: {
        signIn: '/login'
    },
    secret: process.env.NEXTAUTH_SECRET
}; 