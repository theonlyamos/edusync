import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { connectToDatabase } from '@/lib/db';

const handler = NextAuth({
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Invalid credentials');
                }

                try {
                    const client = await connectToDatabase();
                    const db = client.db();
                    const user = await db.collection('users').findOne({ email: credentials.email });

                    if (!user) {
                        throw new Error('No user found');
                    }

                    const isValid = await compare(credentials.password, user.password);

                    if (!isValid) {
                        throw new Error('Invalid password');
                    }

                    return {
                        id: user._id.toString(),
                        email: user.email,
                        role: user.role,
                        name: user.name
                    };
                } catch (error) {
                    throw new Error('Authentication failed');
                }
            }
        })
    ],
    session: {
        strategy: 'jwt'
    },
    pages: {
        signIn: '/login',
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = user.role;
            }
            return token;
        },
        async session({ session, token }) {
            if (session?.user) {
                session.user.role = token.role;
            }
            return session;
        }
    }
});

export { handler as GET, handler as POST }; 