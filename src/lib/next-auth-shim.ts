import { getServerSession as realGetServerSession, authOptions } from './auth';
export const getServerSession = (..._args: any[]) => realGetServerSession();
export { authOptions };
export type DefaultSession = {
    user?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
    } | null;
};
