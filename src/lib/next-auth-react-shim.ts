export const SessionProvider = ({ children }: { children: React.ReactNode }) => children as any;
export const useSession = () => ({ data: null as any, status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading' });
export const signIn = async (..._args: any[]) => ({ ok: true } as any);
export const signOut = async (..._args: any[]) => { };
