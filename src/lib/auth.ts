import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                await connectToDatabase();

                const user = await User.findOne({ email: credentials.email }).lean();

                if (!user) {
                    return null;
                }

                const passwordsMatch = await bcrypt.compare(credentials.password, user.password);

                if (!passwordsMatch) {
                    return null;
                }

                return {
                    id: user._id.toString(),
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    image: user.image || null
                };
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                await connectToDatabase();
                const dbUser = await User.findById(user.id).lean();

                if (dbUser) {
                    token.id = dbUser._id.toString();
                    token.email = dbUser.email;
                    token.name = dbUser.name;
                    token.role = dbUser.role;
                    token.image = dbUser.image || null;
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id;
                session.user.name = token.name;
                session.user.email = token.email;
                session.user.role = token.role;
                session.user.image = token.image;
            }
            return session;
        }
    },
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
    },
    secret: process.env.NEXTAUTH_SECRET,
}; 