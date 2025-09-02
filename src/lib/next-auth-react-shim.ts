export const SessionProvider = ({ children }: { children: React.ReactNode }) => children as any;
export const useSession = () => ({ data: null as any, status: 'unauthenticated' as const });
export const signIn = async () => { };
export const signOut = async () => { };
