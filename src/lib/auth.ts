import { supabase } from "@/lib/supabase";
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

                const { data: user, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', credentials.email)
                    .maybeSingle();
                if (error || !user) {
                    return null;
                }

                if (!user) {
                    return null;
                }

                const passwordsMatch = await bcrypt.compare(credentials.password, user.password);

                if (!passwordsMatch) {
                    return null;
                }

                return { id: String(user.id), email: user.email, name: user.name, role: user.role, image: user.image || null } as any;
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = (user as any).id;
                token.email = (user as any).email;
                token.name = (user as any).name;
                token.role = (user as any).role;
                token.image = (user as any).image || null;
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